#!/bin/bash
set -e

CONTAINER_STARTUP_FILE=/data/.erp-connector
TIME=$( date '+%F_%H:%M:%S' )

function handleInit() {
    # Create savefile which indicates that container was started
    echo "Time of Build: $TIME" > $CONTAINER_STARTUP_FILE
    echo "Remove this file to enforce a full rebuild of the container" >> $CONTAINER_STARTUP_FILE
    echo "WARNING: This will reset all settings and flows!" >> $CONTAINER_STARTUP_FILE

    chown node-red:node-red $CONTAINER_STARTUP_FILE

    cd /data

    echo "Adjusting settings"
    cp /cpro-erp-connector/src/data/config.js /data/config.js
    cp /cpro-erp-connector/src/data/settings.js /data/settings.js
    chown node-red:node-red /data/config.js
    chown node-red:node-red /data/settings.js

    echo "Importing worker files"
    cp /cpro-erp-connector/src/data/logger.worker.js /data/logger.worker.js
    chown node-red:node-red /data/logger.worker.js

    echo "Setting up logging files"
    mkdir -p /var/log/cpro-erp-connector/
    touch /var/log/cpro-erp-connector/warning.log
    chown node-red:node-red /var/log/cpro-erp-connector/warning.log
    
    echo "Setup finished!"
}

function handleAlreadyInitialized() {
    echo "Container restarted at $TIME" >> $CONTAINER_STARTUP_FILE
}

if [ ! -f $CONTAINER_STARTUP_FILE ]; then
    handleInit
else
    handleAlreadyInitialized
fi

exit 0