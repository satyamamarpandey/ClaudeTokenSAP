const fs = require("fs");
const os = require("os");
const path = require("path");

const LOG_FILE =
  process.env.TOKEN_OPTIMIZER_LOG_FILE ||
  path.join(os.tmpdir(), "token-optimizer-debug.log");

function safeClone(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return { note: "unserializable_payload" };
  }
}

function appendDebugLog(event, data = {}) {
  try {
    const record = {
      ts: new Date().toISOString(),
      event,
      pid: process.pid,
      data: safeClone(data),
    };
    fs.appendFileSync(LOG_FILE, JSON.stringify(record) + "\n", "utf8");
  } catch {
    // Never break hook execution because of logging.
  }
}

module.exports = {
  LOG_FILE,
  appendDebugLog,
};