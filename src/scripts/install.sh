#!/bin/bash
set -e

cd /usr/src/node-red

# Remote packages from NPM
npm install node-red-contrib-opcua-server
npm install node-red-contrib-opcua
npm install @node-red-contrib-themes/theme-collection bcrypt mongodb 

# Local packages
npm install /cpro-erp-connector/src/nodes

# Move branded locales to their respective position (en & de):
cp /cpro-erp-connector/src/locales/en-US/runtime.json /usr/src/node-red/node_modules/@node-red/runtime/locales/en-US/runtime.json
cp /cpro-erp-connector/src/locales/de/runtime.json /usr/src/node-red/node_modules/@node-red/runtime/locales/de/runtime.json

exit 0