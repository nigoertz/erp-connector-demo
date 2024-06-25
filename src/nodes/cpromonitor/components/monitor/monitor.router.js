/**
 * @typedef {import('../../../../data/config').CproConfig} CproConfig
 */

const {
  getMonitorStatus,
  getTransactions,
  getTransactionById,
  getTransactionSnapshots,
  getSnapshotById,

  getTransactionsFromApi,
  getTransactionByIdFromApi,
  getTransactionSnapshotsFromApi,
  getSnapshotByIdFromApi
} = require("./monitor.handler")

/**
 *
 * @param {*} RED
 * @param {*} node
 * @param {CproConfig} cpro
 */

function registerMongoMonitorRoutes(RED, node, cpro) {
  RED.httpNode.get(`${cpro.connector.monitorConfig.httpPath}`, (req, res) => getMonitorStatus(node, req, res));
  RED.httpNode.get(`${cpro.connector.monitorConfig.httpPath}/transactions`, (req, res) => getTransactionsFromApi(node, req, res));
  RED.httpNode.get(`${cpro.connector.monitorConfig.httpPath}/transactions/:transactionId`, (req, res) => getTransactionByIdFromApi(node, req, res));
  RED.httpNode.get(`${cpro.connector.monitorConfig.httpPath}/transactions/:transactionId/snapshots`, (req, res) => getTransactionSnapshotsFromApi(node, req, res));
  RED.httpNode.get(`${cpro.connector.monitorConfig.httpPath}/snapshots/:id`, (req, res) => getSnapshotByIdFromApi(node, req, res));
}

module.exports = {
  registerMongoMonitorRoutes
}