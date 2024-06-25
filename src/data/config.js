const path = require('path');
const bcrypt = require('bcrypt');

const fs = require('fs');

// Initialize environment
/** @type {Environment} */
const environment = (() => process.env.ENVIRONMENT === 'prod' ? 'prod' :
  process.env.ENVIRONMENT === 'integration' ? 'integration' :
    process.env.ENVIRONMENT === 'staging' ? 'staging' :
      process.env.ENVIRONMENT === 'qas' ? 'qas' : 'dev')()

/**
 *
 * @param {'ADMIN_PASSWORD' | 'ADMIN_USERNAME' | 'CREDENTIALS_SECRET' | 'HTTP_USERNAME' | 'HTTP_PASSWORD' | 'MONITOR_DB_USERNAME' | 'MONITOR_DB_PASSWORD'} secretName
 */
const getSecretOrEnv = (secretName, defaultValue) => {
  if (fs.existsSync(`/run/secrets/${secretName}`)) {
    return fs.readFileSync(`/run/secrets/${secretName}`, 'utf8')
  }
  return process.env[secretName] || defaultValue
}

// Node-Red init vaiables
const port = +(process?.env?.PORT || 3199);
const projectsEnabled = process.env.PROJECTS_ENABLED === 'false' ? false : true
const httpNodeRoot = process.env.HTTP_NODE_ROOT || '/api'
const disableEditor = process.env.DISABLE_EDITOR === 'false' ? false : environment === 'prod'
const externalModulesAllowInstall = process.env?.EXTERNAL_MODULES_ALLOW_INSTALL?.toLowerCase() === 'false' ? false : true;
const httpPublicUrl = process.env.PUBLIC_URL || `http://localhost:${port}`;

// Logging init consts
const logFsPath = process.env.LOGGING_FS_PATH || path.join('/', 'var', 'log', 'cpro-erp-connector');
const logFsPathWarn = path.join(logFsPath, 'warning.log')
const logHttpPath = (process.env.LOGGING_HTTP_PATH || '/cpro/logs')

// OpenAPI consts
const httpOpenapiUi = (process.env.HTTP_OPENAPI_UI || '/cpro/docs/index.html')
const httpOpenapiAssets = (process.env.HTTP_OPENAPI_ASSETS || '/cpro/docs/assets');
const httpOpenapiJson = (process.env.HTTP_OPENAPI_JSON || '/cpro/docs/json')

// Monitor consts
const monitorHttpPath = process.env.MONITOR_HTTP_PATH || '/cpro/monitor';
const monitorHost = process.env.MONITOR_HOST || "mongo";
const monitorDbUsername = getSecretOrEnv('MONITOR_DB_USERNAME', 'mongo');
const monitorDbPassword = getSecretOrEnv('MONITOR_DB_PASSWORD', 'mongo');
const monitorApiUrl = process.env.MONITOR_API_URL || "http://host.docker.internal:8000"
const monitorDbPort = +(process.env.MONITOR_DB_PORT || 27017);
const monitorDatabase = process.env.MONITOR_DATABASE || "cpro";
const monitorSnapshotStrategy = (() => {
  const validStrategies = ['collection', 'gridfs']
  const strategy = process.env.MONGO_SNAPSHOT_STRATEGY || 'collection'
  if (!validStrategies.includes(strategy)) {
    throw new Error('MONGO_SNAPSHOT_STRATEGY must be either "collection" or "gridfs"')
  }
  return strategy
})()

// Credential secrets
// These can and should be configured using docker secrets
const credentialSecret = getSecretOrEnv('CREDENTIALS_SECRET', 'iPQJvwC9HOf77QKD010')
const adminUser = {
  username: getSecretOrEnv('ADMIN_USERNAME', 'admin'),
  password: bcrypt.hashSync(getSecretOrEnv('ADMIN_PASSWORD', 'test'), 10),
  permissions: '*'
}
const httpUser = {
  user: getSecretOrEnv('HTTP_USERNAME', 'user'),
  pass: bcrypt.hashSync(getSecretOrEnv('HTTP_PASSWORD', 'sekret'), 10),
}

/**
 * @desc Create the cpro custom configuration
 * @type {CproConfig}
 */
const cproConfig = {
  connector: {
    adminUser: adminUser,
    httpUser: httpUser,
    environment: environment,
    port: port,
    projectsEnabled: projectsEnabled,
    credentialSecret: credentialSecret,
    disableEditor: disableEditor,
    httpNodeRoot: httpNodeRoot,
    httpOpenapiJson: httpOpenapiJson,
    httpOpenapiAssets: httpOpenapiAssets,
    httpOpenapiUi: httpOpenapiUi,
    httpPublicUrl: httpPublicUrl,
    externalModulesAllowInstall: externalModulesAllowInstall,
    monitorConfig: {
      httpPath: monitorHttpPath,
      host: monitorHost,
      username: monitorDbUsername,
      password: monitorDbPassword,
      port: monitorDbPort,
      database: monitorDatabase,
      snapshotStrategy: monitorSnapshotStrategy,
      apiUrl: monitorApiUrl
    },
    loggingConfig: {
      fsPath: logFsPath,
      httpPath: logHttpPath,
      warn: {
        name: 'warning.log',
        fsPath: logFsPathWarn
      }
    },
  }
};

/**
 * @typedef {'prod' | 'integration' | 'staging' | 'qas' | 'dev'} Environment
 *
 * @typedef {Object} CproConfig
 * @property {ConnectorConfig} connector
 *
 * @typedef {Object} EnvironmentConfig
 * @property {string} url - The URL of the system.
 * @property {string} [username] - The username for authentication, if applicable.
 * @property {string} [password] - The password for authentication, if applicable.
 * @property {string} [apikey] - An API key for authentication, if applicable.
 * @property {string} [client] - The SAP client ID, if applicable.
 *
 * @typedef {Object} ConnectorConfig
 * @property {Environment} environment
 * @property {AdminConfig} adminUser
 * @property {UserConfig} httpUser
 * @property {number} port
 * @property {boolean} projectsEnabled
 * @property {string} credentialSecret
 * @property {boolean} disableEditor
 * @property {string} httpNodeRoot - The root path of the HTTP nodes
 * @property {string} httpOpenapiJson - The path to the HTTP API specification in JSON
 * @property {string} httpOpenapiAssets - The path to the HTTP API specification assets
 * @property {string} httpOpenapiUi - The path to the HTTP UI
 * @property {string} httpPublicUrl - The URL of the HTTP APIs
 * @property {boolean} externalModulesAllowInstall
 * @property {MonitorConfig} monitorConfig
 * @property {LoggingConfig} loggingConfig
 *
 * @typedef {Object} MonitorConfig
 * @property {string} httpPath
 * @property {string} host
 * @property {string} username
 * @property {string} password
 * @property {number} port
 * @property {string} database
 * @property {'collection' | 'gridfs'} snapshotStrategy
 * @property {string} apiUrl
 *
 * @typedef {Object} LoggingConfig
 * @property {string} fsPath - Root path of other logging files on local filesystem
 * @property {string} httpPath - Root path of the server where logfiles are available
 * @property {LoggingLevel} warn
 * @property {LoggingLevel} [error]
 * @property {LoggingLevel} [fatal]
 *
 * @typedef {Object} LoggingLevel
 * @property {string} name - The name of the log file
 * @property {string} fsPath - The path to the log file on the local file system
 *
 * @typedef {Object} AdminConfig
 * @property {string} username
 * @property {string} password
 * @property {string} permissions
 *
 * @typedef {Object} UserConfig
 * @property {string} user
 * @property {string} pass
 */

module.exports = { cproConfig }