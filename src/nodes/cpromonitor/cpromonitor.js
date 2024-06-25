'use strict';
/**
 * @typedef {import('../../data/config').CproConfig} CproConfig
 */

const { useMongoLocalStrategy, useMongoCosmosStrategy, useMongoCosmosAPIStrategy } = require('./strategies/mongo');

const CproMonitor = function (RED) {
	function Monitor(config) {
		RED.nodes.createNode(this, config);
		try {
			// Early shutdown if config.mode is "off"
			if (config.mode === "off") {
				RED.log.info("Monitor node is in 'off' mode. Advanced logging is disabled");
				this.status({ fill: "grey", shape: "circle", text: "Advanced logging is disabled" });
				return;
			}

			const node = this;
			/** @type CproConfig */
			const cpro = RED.settings.functionGlobalContext._cpro;

			node.name = config.name;
			node.ignore = config.ignore?.split(',').map((nodeType) => nodeType.trim()) || [];
			node.mode = config.mode;
			node.snapshotrecording = config.snapshotrecording;
			node.transactions = {};

			// Attempt to connect to MongoDB
			if (node.mode === "mongo_local") {
				useMongoLocalStrategy(RED, node, cpro);
			}

			if (node.mode === "mongo_cosmos") {
				useMongoCosmosStrategy(RED, node, cpro)
			}

			if (node.mode === "mongo_cosmos_over_api") {
				useMongoCosmosAPIStrategy(RED, node, cpro);
			}
		} catch (error) {
			RED.log.error(`Monitor: An error occured while loading the node: ${error}`);
			this.status({ fill: "red", shape: "circle", text: "An error occured while loading the node" });
		}
	}
	RED.nodes.registerType('monitor', Monitor);
}


module.exports = CproMonitor;