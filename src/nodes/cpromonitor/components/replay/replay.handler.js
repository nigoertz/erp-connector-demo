const { getAdminToken, getDeplyedNodes, postReconstructedFlow } = require("./replay.api")


/**
 * Represents a node configuration.
 * @typedef {Object} ActiveFlowNode
 * @property {string} id - The unique identifier for the node.
 * @property {string} type - The type of the node.
 * @property {string} name - The name of the node.
 * @property {number} x - The x-coordinate value.
 * @property {number} y - The y-coordinate value.
 * @property {Array<string[]>} wires - An array of wires connected to the node. Each wire is the ID of the next node
 */

/**
 * @param {Object} options
 *
 * @param {string} options.first_node
 * @param {string} options.last_node
 * @param {ActiveFlowNode[]} options.currentlyActiveNodes
 */
function reconstructFlow({ first_node, last_node, currentlyActiveNodes }) {
  const recustructedFlow = {
    id: "reconstructed-flow",
    label: "Reconstructed flow",
    disabled: false,
    info: "This flow was reconstructed automatically by the CPRO Monitor. If found, please delete it. Timstamp: " + new Date(),
    env: [],
    nodes: []
  }

  /**
   * @desc Recursive function to reconstruct the flow from the first node to the last
   * @param {string} nodeId
   */
  function assembleFlow(nodeId) {
    const currentNode = currentlyActiveNodes.find(node => node.id === nodeId);
    const hasNextNode = currentNode && currentNode.wires[0]?.length > 0
    const currentNodeIsFinalNode = currentNode && Array.isArray(last_node) ? last_node.includes(currentNode.id) : currentNode?.id === last_node

    // If node was found, add it to the reconstructed flow
    if (currentNode) {
      // @ts-ignore
      recustructedFlow.nodes.push({
        ...currentNode,
        id: `${currentNode.id}.copy`,
        wires: [currentNode.wires[0]?.map(wire => `${wire}.copy`) || []],
      });
    }

    // If the current node has a followup node and is not the final one, run this function again
    if (hasNextNode && !currentNodeIsFinalNode) {
      currentNode.wires[0].forEach(assembleFlow);
    }
  }

  assembleFlow(first_node);
  return recustructedFlow;
}

function addInjectAndDebugNodes({ reconstructedFlow, payload, input_type, last_node }) {
  const replayInjectNode = {
    "type": "inject",
    "name": "Replay transaction",
    "props": [{ "p": "payload" }, { "p": "topic", "vt": "str" }],
    "repeat": "",
    "crontab": "",
    "once": false,
    "onceDelay": 0.1,
    "topic": "Replay transaction",
    "payload": typeof payload === "string" ? payload : JSON.stringify(payload) || "{}",
    "payloadType": input_type,
    "x": reconstructedFlow.nodes[0].x - 240,
    "y": reconstructedFlow.nodes[0].y,
    "wires": [
      [
        // @ts-ignore
        reconstructedFlow.nodes[0].id
      ]
    ]
  }

  // Add inject node
  reconstructedFlow.nodes.unshift(replayInjectNode);

  // Add a debug-node if a last_node was provided
  if (!!last_node) {
    const debugOutNode = {
      "id": "replay-debug-out",
      "type": "debug",
      "name": "Replay debug out",
      "active": true,
      "tosidebar": true,
      "console": false,
      "tostatus": false,
      "complete": "payload",
      "targetType": "msg",
      "statusVal": "",
      "statusType": "auto",
      "x": reconstructedFlow.nodes[reconstructedFlow.nodes?.length - 1].x + 240,
      "y": reconstructedFlow.nodes[reconstructedFlow.nodes?.length - 1].y,
      "wires": []
    }
    reconstructedFlow.nodes[reconstructedFlow.nodes?.length - 1].wires = [[debugOutNode.id]];
    reconstructedFlow.nodes.push(debugOutNode);
  }

  return reconstructedFlow
}

async function replayTransaction(RED, node, req, res) {
  let reconstructedFlowId = null;
  try {
    const cproConfig = RED.settings.functionGlobalContext._cpro;
    const { first_node, last_node, payload, send, input_type } = req.body;
    const adminUsername = process.env.ADMIN_USER || "admin";
    const adminPassword = process.env.ADMIN_PASSWORD || "test";
    const adminToken = await getAdminToken({ username: adminUsername, password: adminPassword, cproConfig });
    RED.log.info(`Replaying transaction from ${first_node} to ${last_node}`);
    RED.log.info(`Sending message to target system is ${send ? 'enabled' : 'disabled'}`);
    /**@typedef {Array<ActiveFlowNode>} */
    const currentlyActiveNodes = await getDeplyedNodes({ adminToken, cproConfig });
    const reconstructedFlow = reconstructFlow({ first_node, last_node, currentlyActiveNodes });
    const reconstructedFlowWithInAndOut = addInjectAndDebugNodes({ reconstructedFlow, payload, input_type, last_node });
    const response = await postReconstructedFlow({ adminToken, cproConfig, reconstructedFlow: reconstructedFlowWithInAndOut });
    reconstructedFlowId = response.data.id;

    res.status(200).send({ msg: `Replaying transaction from ${first_node} to ${last_node}. Flow id: ${reconstructedFlowId}`, flow: reconstructedFlowWithInAndOut });

  } catch (error) {
    console.error(error);
    RED.log.error(error.message ?? error);
    res.status(500).send({ msg: error.message ?? error });
  }
}

module.exports = { replayTransaction }