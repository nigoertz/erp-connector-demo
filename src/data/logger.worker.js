
const fs = require("fs/promises");
const { cproConfig } = require("./config");

process.on('message', (logMessage) => {
  try {
    fs.appendFile(
      cproConfig.connector.loggingConfig.warn.fsPath,
      `${JSON.stringify(logMessage)}\n`,
      'utf8'
    );
  } catch (error) {
    fs.appendFile(
      cproConfig.connector.loggingConfig.warn.fsPath,
      `An error occured while trying to write to the log file: ${JSON.stringify(error)}\n`,
      'utf8'
    )
  }
})