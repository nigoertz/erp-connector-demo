function createNodeTransaction(RED, node, ev) {

  try {
    const transactionKey = ev.msg?._msgid;

    function initializeTransaction() {
      node.transactions[transactionKey] = {
        id: `${transactionKey}`,
        start: new Date().getTime(),
        end: null,
        receiver: [],
        sender: "Unknown",
        // steps: [],
        logs: [],
      };
    }

    function updateReceiver() {
      if (!node.transactions[transactionKey].receiver.includes(ev.msg.receiver) && !!ev.msg.receiver) {
        node.transactions[transactionKey].receiver.push(ev.msg.receiver);
      }
    }

    function updateSender() {
      node.transactions[transactionKey].sender = ev.msg.sender ?? "Unknown";
    }



    // Init trace for this message
    if (!node.transactions[transactionKey]) {
      initializeTransaction();
    };

    // If specified, update incoming and outgoing port
    updateReceiver()
    updateSender()

    // Append log items for each 'preDeliver' event, if it exists
    // If no next node is recognized, send the message
    if (ev.destination.node._wireCount == 0) {
      node.transactions[transactionKey].end = new Date().getTime();
      const transaction = { ...node.transactions[transactionKey] };
      // Filter out steps by their id that are duplicated
      delete node.transactions[transactionKey];
      return (transaction);
    }
  } catch (error) {
    RED.log.error(error);
  }
}

function createNodeStep(RED, node, ev) {
  return {
    id: `${ev.source.id}-${ev.source.port}`,
    topic: ev.msg.topic || "None",
    node: {
      type: ev.source.node.type,
      name: ev.source.node.name || ev.source.node.id
    },
    transaction: ev.msg?._msgid,
    createdAt: new Date().getTime(),
    snapshotId: `${ev.msg._msgid}-${ev.source.id}-${ev.source.port}`
  }
}

function createNodeLogs(RED, node, ev) {
  if (ev.msg?.log) {
    let logs = [];
    const isArray = Array.isArray(ev.msg.log);
    const handleLogItem = (msgLogItem) => {
      const isString = typeof msgLogItem === 'string';
      if (isString) {
        logs.push({
          level: "warn",
          node: ev.source.node.name || ev.source.node.id,
          text: msgLogItem,
          createdAt: new Date().getTime(),
          transaction: ev.msg?._msgid
        });
        // If log item's not s tring, assemble an object based on
        // available properties
      } else {
        logs.push({
          level: msgLogItem.level || "warn",
          node: msgLogItem.node || ev.source.node.name || ev.source.node.id,
          text: msgLogItem.text || "Text field missing",
          createdAt: new Date().getTime(),
          transaction: ev.msg?._msgid
        });
      }
    }

    if (isArray) {
      ev.msg.log.forEach(msgLogItem => handleLogItem(msgLogItem));
    } else {
      handleLogItem(ev.msg.log);
    }
    ev.msg.log = null;
    return logs;
  }
}

function createNodeSnapshot(RED, node, ev) {
  const msg = { ...ev.msg };

  // Remove req and res to avoid circular references
  if (msg.req) msg.req = null;
  if (msg.res) msg.res = null;
  return {
    id: `${ev.msg._msgid}-${ev.source.id}-${ev.source.port}`,
    transaction: `${ev.msg._msgid}`,
    node: {
      type: ev.source.node.type,
      name: ev.source.node.name || ev.source.node.id
    },
    createdAt: new Date().getTime(),
    msg: msg,
  };
}

module.exports = {
  createNodeTransaction,
  createNodeStep,
  createNodeLogs,
  createNodeSnapshot
}