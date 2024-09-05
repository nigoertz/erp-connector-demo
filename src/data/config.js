const path = require('path');
const bcrypt = require('bcrypt');

// Load systems
/** @type {SystemConfig} */
const systems = require('./systems.json');
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

// Cpro Settings & Systems consts
const httpCproSettingsPath = (process.env.HTTP_CPRO_SETTINGS_PATH || '/cpro/settings')
const httpCproSystemSettingsPath = (process.env.HTTP_CPRO_SYSTEM_SETTINGS_PATH || '/cpro/settings/systems')
const systemsFsPath = process.env.SYSTEMS_FS_PATH || path.join('/', 'data', 'systems.json');
const systemsBackupFsPath = process.env.SYSTEMS_BACKUP_FS_PATH || path.join('/', 'data', 'systems.json.backup');
const systemsFactoryFsPath = process.env.SYSTEMS_BACKUP_FS_PATH || path.join('/', 'data', 'factory.systems.json');

// Cpro Node Catalogue consts
const httpCproNodeCataloguePath = (process.env.HTTP_CPRO_NODE_CATALOGUE_PATH || '/cpro/nodes/catalogue')
const httpCproNodeCatalogueUser = (process.env.HTTP_CPRO_NODE_CATALOGUE_USER || 'admin'); // Username for Nexus repository
const httpCproNodeCataloguePassword = (process.env.HTTP_CPRO_NODE_CATALOGUE_PASSWORD || 'admin'); // Password for Nexus repository

// Monitor consts
const monitorHttpPath = process.env.MONITOR_HTTP_PATH || '/cpro/monitor';
const monitorHost = process.env.MONITOR_HOST || "mongo";
const monitorDbUsername = getSecretOrEnv('MONITOR_DB_USERNAME', 'mongo');
const monitorDbPassword = getSecretOrEnv('MONITOR_DB_PASSWORD', 'mongo');
const monitorDbPort = +(process.env.MONITOR_DB_PORT || 27017);
const monitorDatabase = process.env.MONITOR_DATABASE || "cpro";
const monitorApiUrl = process.env.MONITOR_API_URL
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
  systems: systems,
  connector: {
    adminUser: adminUser,
    httpUser: httpUser,
    environment: environment,
    port: port,
    systemsFsPath: systemsFsPath,
    systemsBackupFsPath: systemsBackupFsPath,
    systemsFactoryFsPath: systemsFactoryFsPath,
    projectsEnabled: projectsEnabled,
    credentialSecret: credentialSecret,
    disableEditor: disableEditor,
    httpNodeRoot: httpNodeRoot,
    httpPublicUrl: httpPublicUrl,
    httpCproSettingsPath: httpCproSettingsPath,
    httpCproSystemSettingsPath: httpCproSystemSettingsPath,
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
  },
  catalogue: {
    path: httpCproNodeCataloguePath,
    user: httpCproNodeCatalogueUser,
    pass: httpCproNodeCataloguePassword
  }
};

/**
 * @typedef {'prod' | 'integration' | 'staging' | 'qas' | 'dev'} Environment
 *
 * @typedef {Object} CproConfig
 * @property {SystemConfig} systems
 * @property {ConnectorConfig} connector
 * @property {CatalogueConfig} catalogue - The path to the HTTP CPRO node catalogue aka the Nexus repository
 *
 * @typedef {Object} SystemConfig
 * @property {SystemEnvironment} [sap]
 * @property {SystemEnvironment} [shipcloud]
 *
 * @typedef {Object} SystemEnvironment
 * @property {EnvironmentConfig} [dev] - Settings for the development environment
 * @property {EnvironmentConfig} [qas] - Settings for the QAS environment
 * @property {EnvironmentConfig} [staging] - Settings for the staging environment
 * @property {EnvironmentConfig} [integration] - Settings for the integration
 * @property {EnvironmentConfig} [prod] - Settings for the production environment
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
 * @property {string} systemsFsPath
 * @property {string} systemsBackupFsPath
 * @property {string} systemsFactoryFsPath
 * @property {boolean} projectsEnabled
 * @property {string} credentialSecret
 * @property {boolean} disableEditor
 * @property {string} httpNodeRoot - The root path of the HTTP nodes
 * @property {string} httpPublicUrl - The URL of the HTTP API
 * @property {string} httpCproSettingsPath - The path to the HTTP CPRO settings
 * @property {string} httpCproSystemSettingsPath - The path to the HTTP CPRO system settings
 * @property {boolean} externalModulesAllowInstall
 * @property {MonitorConfig} monitorConfig
 * @property {LoggingConfig} loggingConfig
 *
 * @typedef {Object} CatalogueConfig
 * @property {string} path
 * @property {string} user
 * @property {string} pass
 *
 * @typedef {Object} MonitorConfig
 * @property {string} httpPath
 * @property {string} host
 * @property {string} username
 * @property {string} password
 * @property {number} port
 * @property {string} database
 * @property {'collection' | 'gridfs'} snapshotStrategy
 * @property {string} monitorApiUrl
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