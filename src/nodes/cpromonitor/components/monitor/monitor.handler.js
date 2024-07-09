const axios = require('axios');
const { config } = require('process');
const { cproConfig } = require('../../../../data/config');

/**
 * @typedef {import('mongodb').Collection} Collection
 */

/*******************************
   * Handlers for HTTP Endpoints *
   *******************************/
async function getMonitorStatus(node, req, res) {
  try {
    res.status(200).send({ connection: node.monitor.status });
  } catch (error) {
    res.status(500).send({ msg: error.message });
  }
}

async function getTransactions(node, req, res) {
  try {
    const count = +(req.query.count || 10);
    const offset = +(req.query.offset || 0);
    const q = req.query.q || "";
    const a = req.query.a || "false";

    const isDayQuery = /^\d{2}.\d{2}.\d{4}$/.test(q);
    let options = {};
    let pipeline = [];
    if (isDayQuery) {
      options = getDayQueryOptions(q);
      pipeline = assembleDefaultPipeline(options, { count, offset });
    } else if (a === "true") {
      options = getAdvancedTransactionQueryOptions(q);
      pipeline = assembleAdvancedPipeline(options, { count, offset });
    } else {
      options = getDefaultTransactionQueryOptions(q);
      pipeline = assembleDefaultPipeline(options, { count, offset });
    }
    /** @type Collection */
    const collection = node.monitor.transactionCollection;
    const transactions = await collection.aggregate(pipeline).toArray();
    res.status(200).send(transactions);
  } catch (error) {
    res.status(500).send({ msg: error.message });
  }
}

async function getTransactionById(node, req, res) {
  try {
    const pipeline = [
      {
        $match: { id: req.params.transactionId },
      },
      {
        $lookup: {
          from: "steps",
          localField: "id",
          foreignField: "transaction",
          as: "steps",
        },
      },
      {
        $lookup: {
          from: "logs",
          localField: "id",
          foreignField: "transaction",
          as: "logs",
        },
      },
      {
        $addFields: {
          steps: "$steps",
          logs: "$logs",
        },
      },
    ];
    /** @type Collection */
    const collection = node.monitor.transactionCollection;
    const transactions = await collection.aggregate(pipeline).toArray();
    res.status(200).send(transactions);
  } catch (error) {
    res.status(500).send({ msg: error.message });
  }
}

async function getTransactionSnapshots(node, req, res) {
  try {
    /** @type Collection */
    const collection = node.monitor.snapshotCollection;
    const snapshots = await collection.find({ transaction: req.params.transactionId }).sort({ createdAt: -1 }).toArray();
    res.status(200).send(snapshots);
  } catch (error) {
    res.status(500).send({ msg: error.message });
  }
}

async function getSnapshotById(node, req, res) {
  async function getSnapshotFromBucket(node, req, res) {
    const matchedSnapshot = await node.monitor.snapshotBucket.find({ filename: req.params.id }).toArray();
    if (matchedSnapshot.length === 0) {
      res.status(404).send({ msg: "Snapshot not found" });
      return;
    }
    const snapshotStream = node.monitor.snapshotBucket.openDownloadStream(matchedSnapshot[0]._id);
    res.status(200).set("Content-Type", "application/json");
    snapshotStream.pipe(res);

    snapshotStream.on("error", (err) => {
      throw new Error(err);
    });

    snapshotStream.on("end", () => {
      res.end();
    });
  }

  async function getSnapshotFromCollection(node, req, res) {
    /** @type Collection */
    const collection = node.monitor.snapshotCollection;
    const snapshots = await collection.find({ id: req.params.id }).toArray();
    res.status(200).send(snapshots[0]);
  }

  try {
    if (node.monitor.snapshotStrategy === "gridfs") {
      await getSnapshotFromBucket(node, req, res);
    } else {
      await getSnapshotFromCollection(node, req, res);
    }
  } catch (error) {
    res.status(500).send({ msg: error.message });
  }
}

async function insertTransaction(node, transaction) {
  const query = { id: transaction.id };
  const payload = {
    $set: {
      id: transaction.id,
      end: transaction.end,
      start: transaction.start,
      sender: transaction.sender,
    },
    $addToSet: {
      receiver: { $each: transaction.receiver },
      logs: { $each: transaction.logs },
    },
  };
  // If there are logs, add them. This avoids conflicts with node-reds
  // runtime behavior to unexpectedly send 'preDeliver' hooks twice
  // after adding new nodes to the flow
  await node.monitor.transactionCollection?.updateOne(query, payload, { upsert: true });
}

async function insertStep(node, step, { recordSnapshot }) {
  const query = { id: step.id, transaction: step.transaction };
  const payload = {
    $set: {
      id: step.id,
      topic: step.topic,
      node: step.node,
      transaction: step.transaction,
      createdAt: step.createdAt,
      snapshotId: recordSnapshot ? step.snapshotId : null,
    },
  };
  await node.monitor.stepCollection?.updateOne(query, payload, { upsert: true });
}

async function insertSnapshot(node, snapshot) {
  async function insertSnapshotToBucket(node, snapshot) {
    const buffer = Buffer.from(JSON.stringify(snapshot));
    const uploadStream = node.monitor.snapshotBucket.openUploadStream(snapshot.id);
    uploadStream.write(buffer);
    uploadStream.end();
  }

  async function insertSnapshotToCollection(node, snapshot) {
    const query = { id: snapshot.id };
    const payload = {
      $set: {
        id: snapshot.id,
        msg: snapshot.msg,
        node: snapshot.node,
        transaction: snapshot.transaction,
        createdAt: snapshot.createdAt,
      },
    };
    await node.monitor.snapshotCollection?.updateOne(query, payload, { upsert: true });
  }

  if (node.monitor.snapshotStrategy === "gridfs") {
    await insertSnapshotToBucket(node, snapshot);
  } else {
    await insertSnapshotToCollection(node, snapshot);
  }
}

async function insertLogs(node, logs) {
  await node.monitor.logCollection?.insertMany(logs);
}

async function getTransactionsFromApi(node, req, res) {
  try {
    const count = +(req.query.count || 10);
    const offset = +(req.query.offset || 0);
    const q = req.query.q || "";
    const a = req.query.a || "false";

    const params = new URLSearchParams({
      count: count.toString(),
      offset: offset.toString(),
      q,
      a
    });

    const apiUrl = cproConfig.connector.monitorConfig.apiUrl + `/transactions?${params.toString()}`;
    const response = await axios.get(apiUrl);
    const transactions = response.data;

    res.status(200).send(transactions);
  } catch (error) {
    res.status(500).send({ msg: error.message });
  }
}

async function getTransactionByIdFromApi(node, req, res) {
  try {
    const transactionId = req.params.transactionId;
    const apiUrl = cproConfig.connector.monitorConfig.apiUrl + `/transactions/${transactionId}`;
    const response = await axios.get(apiUrl);
    const transaction = response.data;

    if (!transaction || transaction.msg === "Transaction not found") {
      res.status(404).send({ msg: "Transaction not found" });
      return;
    }

    res.status(200).send(transaction);
  } catch (error) {
    res.status(500).send({ msg: error.message });
  }
}

async function getTransactionSnapshotsFromApi(node, req, res) {
  try {
    const transactionId = req.params.transactionId;
    const apiUrl = cproConfig.connector.monitorConfig.apiUrl + `/transactions/${transactionId}/snapshots`;
    const response = await axios.get(apiUrl);
    const snapshots = response.data;

    if (!snapshots || snapshots.msg === "Snapshots not found for the transaction") {
      res.status(404).send({ msg: "Snapshots not found for the transaction" });
      return;
    }

    res.status(200).send(snapshots);
  } catch (error) {
    res.status(500).send({ msg: error.message });
  }
}

async function getSnapshotByIdFromApi(node, req, res) {
  async function getSnapshotFromBucket(node, req, res) {
    try {
      const matchedSnapshot = await node.monitor.snapshotBucket.find({ filename: req.params.id }).toArray();
      if (matchedSnapshot.length === 0) {
        res.status(404).send({ msg: "Snapshot not found" });
        return;
      }
      const snapshotStream = node.monitor.snapshotBucket.openDownloadStream(matchedSnapshot[0]._id);
      res.status(200).set("Content-Type", "application/json");
      snapshotStream.pipe(res);

      snapshotStream.on("error", (err) => {
        throw new Error(err);
      });

      snapshotStream.on("end", () => {
        res.end();
      });
    } catch (error) {
      throw new Error(error);
    }
  }

  async function getSnapshotFromCollection(node, req, res) {  
    try {
      const snapshotId = req.params.id
      const apiUrl = cproConfig.connector.monitorConfig.apiUrl + `/snapshots/${snapshotId}`;
      const response = await axios.get(apiUrl);
      const snapshots = response.data;
      res.status(200).send(snapshots);
    } catch (error) {
      res.status(500).send({ msg: error.message });
    }
  }

  try {
    if (node.monitor.snapshotStrategy === "gridfs") {
      await getSnapshotFromBucket(node, req, res);
    } else {
      await getSnapshotFromCollection(node, req, res);
    }
  } catch (error) {
    res.status(500).send({ msg: error.message });
  }
}

async function insertTransactionToApi(node, transaction) {
  try {
    await axios.post(cproConfig.connector.monitorConfig.apiUrl + "/transactions", transaction);
    node.status({ fill: "green", shape: "dot", text: "Transaction inserted" });
  } catch (error) {
    node.status({ fill: "red", shape: "dot", text: "Error inserting transaction" });
  }
}

async function insertStepToApi(node, step, { recordSnapshot }) {
  try {
    await axios.post(cproConfig.connector.monitorConfig.apiUrl + "/steps", step);
    node.status({ fill: "green", shape: "dot", text: "Step inserted" });
  } catch (error) {
    node.status({ fill: "red", shape: "dot", text: "Error inserting step" });
  }
}

async function insertSnapshotToApi(node, snapshot) {
  try {
    await axios.post(cproConfig.connector.monitorConfig.apiUrl + "/snapshots", snapshot);
    node.status({ fill: "green", shape: "dot", text: "Snapshot inserted" });
  } catch (error) {
    node.status({ fill: "red", shape: "dot", text: "Error inserting snapshot" });
  }
}

async function insertLogsToApi(node, logs) {
  try {
    await axios.post(cproConfig.connector.monitorConfig.apiUrl + "/logs", logs);
    node.status({ fill: "green", shape: "dot", text: "Logs inserted" });
  } catch (error) {
    node.status({ fill: "red", shape: "dot", text: "Error inserting logs" });
  }
}

async function querySnapshots(node, req, res) {
  try {
    /** @type Collection */
    const collection = node.monitor.snapshotCollection;
    const snapshots = await collection.find(req.query).toArray();
    res.status(200).send(snapshots);
  } catch (error) {
    res.status(500).send({ msg: error.message });
  }
}

// Private functions
function getDayQueryOptions(q) {
  const [day, month, year] = q.split(".");
  const startDate = new Date(`${year}-${month}-${day}`).getTime();
  const endDate = startDate + 24 * 60 * 60 * 1000;

  return {
    $and: [
      { start: { $gte: startDate } }, // Greater than or equal to the lower timestamp
      { start: { $lte: endDate } },   // Less than or equal to the upper timestamp
    ],
  };
}

function getAdvancedTransactionQueryOptions(q) {
  return {
    $or: [
      { id: { $regex: q, $options: "i" } },
      { "steps.node.id": { $regex: q, $options: "i" } },
      { "steps.node.name": { $regex: q, $options: "i" } },
      { "steps.node.type": { $regex: q, $options: "i" } },
      { "steps.topic": { $regex: q, $options: "i" } },
      { "logs.text": { $regex: q, $options: "i" } },
      { "snapshots.msg.payload": { $regex: q, $options: "i" } },
      { "snapshots.msg.receiver": { $regex: q, $options: "i" } },
      { "snapshots.msg.sender": { $regex: q, $options: "i" } },
      { "snapshots.msg.log": { $regex: q, $options: "i" } },
      { "snapshots.msg.topic": { $regex: q, $options: "i" } },
    ],
  };
}

function getDefaultTransactionQueryOptions(q) {
  return {
    $or: [
      { id: { $regex: q, $options: "i" } },
      { "steps.node.id": { $regex: q, $options: "i" } },
      { "steps.node.name": { $regex: q, $options: "i" } },
      { "steps.node.type": { $regex: q, $options: "i" } },
      { "steps.topic": { $regex: q, $options: "i" } },
      { "logs.text": { $regex: q, $options: "i" } },
    ],
  };
}

function assembleDefaultPipeline(options, { count, offset }) {
  return [
    {
      $lookup: {
        from: "steps",
        localField: "id",
        foreignField: "transaction",
        as: "steps",
      },
    },
    {
      $lookup: {
        from: "logs",
        localField: "id",
        foreignField: "transaction",
        as: "logs",
      },
    },
    {
      $addFields: {
        steps: "$steps",
        logs: "$logs",
      },
    },
    { $match: options },
    { $sort: { start: -1 } },
    { $skip: offset },
    { $limit: count },
  ];
}

function assembleAdvancedPipeline(options, { count, offset }) {
  return [
    {
      $lookup: {
        from: "snapshots",
        localField: "id",
        foreignField: "transaction",
        as: "snapshots",
      },
    },
    {
      $lookup: {
        from: "steps",
        localField: "id",
        foreignField: "transaction",
        as: "steps",
      },
    },
    {
      $lookup: {
        from: "logs",
        localField: "id",
        foreignField: "transaction",
        as: "logs",
      },
    },
    {
      $addFields: {
        steps: "$steps",
        logs: "$logs",
      },
    },
    { $match: options },
    { $sort: { start: -1 } },
    { $skip: offset },
    { $limit: count },
  ];
}

module.exports = {
  getMonitorStatus,

  getTransactions,
  getTransactionById,
  getTransactionSnapshots,
  getSnapshotById,

  getTransactionsFromApi,
  getTransactionByIdFromApi,
  getTransactionSnapshotsFromApi,
  getSnapshotByIdFromApi,

  insertTransaction,
  insertStep,
  insertLogs,
  querySnapshots,
  insertSnapshot,

  insertTransactionToApi,
  insertStepToApi,
  insertLogsToApi,
  insertSnapshotToApi,
};