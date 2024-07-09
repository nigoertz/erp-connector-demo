/**
 * @typedef {import('../../../data/config').MonitorConfig} MonitorConfig
 * @typedef {import('../../../data/config').CproConfig} CproConfig
 * @typedef {import('../../../data/config').Environment} Environment
 */
const axios = require('axios');
const { MongoClient, GridFSBucket } = require("mongodb");

const {
  createNodeTransaction,
  createNodeStep,
  createNodeLogs,
  createNodeSnapshot
} = require("../components/monitor/monitor.transform")
const {
  registerMongoMonitorRoutes
} = require("../components/monitor/monitor.router");
/*const {
  registerMongoReplayRoutes }
  = require("../components/replay/replay.routes")*/
const {
  insertSnapshot,
  insertStep,
  insertLogs,
  insertTransaction,
  
  insertSnapshotToApi,
  insertStepToApi,
  insertLogsToApi,
  insertTransactionToApi
} = require("../components/monitor/monitor.handler")


function useMongoStrategy(RED, node, cpro, mode) {
  const environment = cpro.connector.environment;
  const monitorConfig = cpro.connector.monitorConfig;
  if (monitorConfig.username === "mongo") {
    RED.log.warn("Using default username for development. Set the environment or secret variable 'MONITOR_DB_USERNAME' before deploying");
  }

  if (monitorConfig.password === "mongo") {
    RED.log.warn("Using default password for development. You should set the environment or secret variable 'MONITOR_DB_PASSWORD' before deploying");
  }

  if (environment === "prod" && monitorConfig.username === "mongo" && monitorConfig.password === "mongo") {
    RED.log.error("Cannot use default credentials for production. Set the environment or secret variable 'MONITOR_DB_USERNAME' and 'MONITOR_DB_PASSWORD' before deploying");
    node.status({ fill: "red", shape: "dot", text: "Illegal use of default credentials. Disconnected" });
    return;
  }

  RED.log.info(`Attempting to connect to MongoDB ${mode}: ${monitorConfig.host}:${monitorConfig.port}/${monitorConfig.database}`);

  node.monitor = {
    client: new MongoClient(connectionStringFromConfig(monitorConfig, mode)),
    db: null,
    transactionCollection: null,
    snapshotCollection: null,
    status: {
      connected: false,
      connectedSince: 0
    }
  }

  // Remove all previous hooks if they exist
  RED.hooks.remove('preDeliver.monitor');

  // Register the monitor hook
  RED.hooks.add('preDeliver.monitor', async (ev) => {
    // node is an 'emergency quit' to prevent propagation of 'preDeliver' events from nodes that come after snapshot or transaction
    if (['monitor', ...node.ignore].includes(ev?.source?.node?.type)) {
      ev.msg.__isTransactionPreDeliver = true;
    }

    // If it is hit, ignore the message
    if (ev.msg.__isTransactionPreDeliver) {
      return;
    }

    // If this is the first recorded step in the transaction,
    // Set the _firstnode property
    if (!ev.msg._firstnode) {
      ev.msg._firstnode = `${ev.msg._msgid}-${ev.source.id}-${ev.source.port}`;
    }

    // If this is the last node, that means the destination has no wires
    // Set the lastnode property
    if (ev.destination.node._wireCount == 0) {
      ev.msg._lastnode = `${ev.msg._msgid}-${ev.source.id}-${ev.source.port}`;
    }

    // Otherwise, handle transactions, steps, snapshots and logs

    // Custom rules for snapshot recording
    // By default, all snapshots are recorded
    const isAllPolicySatisfied = node.snapshotrecording === "all"

    // If the node is configured to only record first and last snapshots.
    // This check will return true for the 'first_and_last' policy
    // If the node that fired the 'preDeliver' event is the first or last
    // for this transaction
    const isFirstAndLastPolicySatisfied = (node.snapshotrecording === "first_and_last"
      && (ev.msg._firstnode === `${ev.msg._msgid}-${ev.source.id}-${ev.source.port}`
        || ev.msg._lastnode === `${ev.msg._msgid}-${ev.source.id}-${ev.source.port}`))

    const recordSnapshot = isAllPolicySatisfied || isFirstAndLastPolicySatisfied;
    const transaction = createNodeTransaction(RED, node, ev);
    const step = createNodeStep(RED, node, ev)
    const logs = createNodeLogs(RED, node, ev);
    const snapshot = createNodeSnapshot(RED, node, ev);

    // A transaction must always be considered
    if (transaction) {
      await insertTransaction(node, transaction)
    }

    // Steps must only be considered if they have not been recorded yet
    // Due to Node-Red's runtime behavior, sometimes 'preDeliver' events
    // are sent several times and overwrite the previous one with the same id
    if (step && ev.msg._previousnode !== `${ev.msg._msgid}-${step.id}`) {
      ev.msg._previousnode = `${ev.msg._msgid}-${step.id}`
      await insertStep(node, step, { recordSnapshot })
    }

    // If logs were extracted, add them to the database
    if (!!logs && logs.length > 0) {
      await insertLogs(node, logs)
    }

    // If a snapshot was extracted and snapshotrecording policy is set,
    // add it to the database
    if (snapshot && recordSnapshot) {
      await insertSnapshot(node, snapshot)
    }
  });

  // Register monitor and replay routes
  registerMongoMonitorRoutes(RED, node, cpro);
  //registerMongoReplayRoutes(RED, node, cpro);

  function handleDbError(RED, node, error) {
    node.monitor.status.connected = false;
    node.monitor.status.connectedSince = 0;
    node.monitor.client?.close();
    node.status({ fill: "red", shape: "dot", text: error ?? error.message });
    RED.log.error(error);
  }

  node.monitor.client.connect().then(() => {
    const cproConfig = RED.settings.functionGlobalContext._cpro;
    const database = cproConfig.connector.monitorConfig.database;
    const snapshotStrategy = cproConfig.connector.monitorConfig.snapshotStrategy;
    node.monitor.status.connected = true;
    node.monitor.status.connectedSince = new Date().getTime();
    node.monitor.db = node.monitor.client?.db(database);
    node.monitor.transactionCollection = node.monitor.db?.collection('transactions');
    node.monitor.stepCollection = node.monitor.db?.collection('steps');
    node.monitor.logCollection = node.monitor.db?.collection('logs');
    if (snapshotStrategy === "collection") {
      node.monitor.snapshotStrategy = "collection";
      node.monitor.snapshotCollection = node.monitor.db?.collection('snapshots');
    }
    if (snapshotStrategy === "gridfs") {
      node.monitor.snapshotStrategy = "gridfs";
      node.monitor.snapshotBucket = new GridFSBucket(node.monitor.db, { bucketName: 'snapshots-bucket' });
    }

    node.monitor.stepCollection.createIndex({ id: 1 })

    RED.log.info(`Connected to monitoring DB '${database}' using ${mode} strategy`);
    RED.log.info(`Snapshots will be stored using '${snapshotStrategy}' strategy`);
    if (snapshotStrategy === "gridfs") {
      RED.log.warn("Note that when using mongodb 'gridfs', fulltext search on messages is not supported")
      RED.log.warn("Make sure to use the logging feature for searchable fields when developing flows")
      RED.log.warn("Read more about using logging here: https://github.com/cpro-iot/erp-connector/wiki/07.-Monitoring#msglog")
    }
    node.status({ fill: "green", shape: "dot", text: "Connected to Monitor DB" });

    //Handle DB connectivity errors
  }).catch((error) => handleDbError(RED, node, error));
  node.monitor.client.on('error', (error) => handleDbError(RED, node, error))
  // Terminate DB Connection when process is interrupted
  process.on('SIGINT', () => {
    node.monitor.client.close();
    process.exit(0);
  })
}

function useApiStrategy(RED, node, cpro) {
  node.monitor = {
    client: null,
    db: null,
    transactionCollection: null,
    snapshotCollection: null,
    status: {
      connected: false,
      connectedSince: 0
    }
  }

  registerMongoMonitorRoutes(RED, node, cpro);

  axios.get(cpro.connector.monitorConfig.apiUrl + `/status`)
  .then(response => {
    node.monitor.status.connected = true;
    node.monitor.status.connectedSince = new Date().getTime();
    node.status({ fill: "green", shape: "dot", text: "Connected to API" });
  })
  .catch(error => {
    node.status({ fill: "red", shape: "dot", text: "Could not connect to API" });
  });
 
  RED.hooks.remove('preDeliver.monitor');
  RED.hooks.add('preDeliver.monitor', async (ev) => {
    if (['monitor', ...node.ignore].includes(ev?.source?.node?.type)) {
      ev.msg.__isTransactionPreDeliver = true;
    }

    if (ev.msg.__isTransactionPreDeliver) {
      return;
    }

    if (!ev.msg._firstnode) {
      ev.msg._firstnode = `${ev.msg._msgid}-${ev.source.id}-${ev.source.port}`;
    }

    if (ev.destination.node._wireCount == 0) {
      ev.msg._lastnode = `${ev.msg._msgid}-${ev.source.id}-${ev.source.port}`;
    }

    const isAllPolicySatisfied = node.snapshotrecording === "all"
    const isFirstAndLastPolicySatisfied = (node.snapshotrecording === "first_and_last"
      && (ev.msg._firstnode === `${ev.msg._msgid}-${ev.source.id}-${ev.source.port}`
        || ev.msg._lastnode === `${ev.msg._msgid}-${ev.source.id}-${ev.source.port}`))

    const recordSnapshot = isAllPolicySatisfied || isFirstAndLastPolicySatisfied;
    const transaction = createNodeTransaction(RED, node, ev);
    const step = createNodeStep(RED, node, ev)
    const logs = createNodeLogs(RED, node, ev);
    const snapshot = createNodeSnapshot(RED, node, ev);

    if (transaction) {
      await insertTransactionToApi(node, transaction)
    }

    if (step && ev.msg._previousnode !== `${ev.msg._msgid}-${step.id}`) {
      ev.msg._previousnode = `${ev.msg._msgid}-${step.id}`
      await insertStepToApi(node, step, { recordSnapshot })
    }

    if (logs && logs.length > 0) {
      await insertLogsToApi(node, logs)
    }

    if (snapshot && recordSnapshot) {
      await insertSnapshotToApi(node, snapshot)
    }
  });
}

module.exports = useApiStrategy;

/*********************************************
 * Function scope to handle MongoDB strategy *
 *********************************************/

function useMongoLocalStrategy(RED, node, cpro) {
  useMongoStrategy(RED, node, cpro, "local")
}

function useMongoCosmosStrategy(RED, node, cpro) {
  useMongoStrategy(RED, node, cpro, "cosmos")
}

function useMongoCosmosAPIStrategy(RED, node, cpro) {
  useApiStrategy(RED, node, cpro)
}

/**
 *
 * @param {MonitorConfig} config
 * @param {'cosmos' | 'local' |'cosmosoverapi'} mode
 * @returns
 */

function connectionStringFromConfig(config, mode) {
  if (mode === "cosmos") {
    return `mongodb+srv://${config.username}:${config.password}@${config.host}/?tls=true&authMechanism=SCRAM-SHA-256&retrywrites=false&maxIdleTimeMS=120000`;
  }

  return `mongodb://${config.username}:${config.password}@${config.host}:${config.port}`;
}

module.exports = {
  useMongoLocalStrategy,
  useMongoCosmosStrategy,
  useMongoCosmosAPIStrategy
}