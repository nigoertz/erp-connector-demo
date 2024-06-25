#!/bin/bash
set -e 

/cpro-erp-connector/src/scripts/init.sh

./entrypoint.sh "$@"