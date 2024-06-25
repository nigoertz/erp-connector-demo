/**
 * @typedef {import('../../../../data/config').CproConfig} CproConfig
 */

const { validateReplayRequest } = require("./replay.validator");
const { replayTransaction } = require("./replay.handler");

/**
 *
 * @param {*} RED
 * @param {*} node
 * @param {CproConfig} cpro
 */
function registerMongoReplayRoutes(RED, node, cpro) {
  RED.httpNode.post(`${cpro.connector.monitorConfig.httpPath}/replay/`, validateReplayRequest, (req, res) => replayTransaction(RED, node, req, res));
}

module.exports = {
  registerMongoReplayRoutes
}