const fs = require("fs");
const os = require("os");
const path = require("path");

const TMP_DIR =
  process.env.TOKEN_OPTIMIZER_TMP_DIR ||
  os.tmpdir();

const LOG_FILE =
  process.env.TOKEN_OPTIMIZER_LOG_FILE ||
  path.join(TMP_DIR, "token-optimizer-debug.log");

const SESSION_STATE_FILE =
  process.env.TOKEN_OPTIMIZER_STATE_FILE ||
  path.join(TMP_DIR, "token-optimizer-session-state.json");

function ensureParentDir(filePath) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  } catch {
    // ignore
  }
}

function safeClone(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return { note: "unserializable_payload" };
  }
}

function rotateIfNeeded(filePath, maxBytes = 2 * 1024 * 1024) {
  try {
    if (!fs.existsSync(filePath)) return;
    const stat = fs.statSync(filePath);
    if (stat.size <= maxBytes) return;

    const rotatedPath = `${filePath}.${Date.now()}.bak`;
    fs.renameSync(filePath, rotatedPath);
  } catch {
    // ignore rotation failures
  }
}

function readJsonFile(filePath, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath, value) {
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(safeClone(value), null, 2), "utf8");
}

function appendDebugLog(event, data = {}) {
  try {
    ensureParentDir(LOG_FILE);
    rotateIfNeeded(LOG_FILE);

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

function readSessionState() {
  return readJsonFile(SESSION_STATE_FILE, {});
}

function writeSessionState(nextState) {
  writeJsonFile(SESSION_STATE_FILE, nextState || {});
  return nextState || {};
}

function mergeSessionState(updater) {
  const prev = readSessionState();
  const next =
    typeof updater === "function"
      ? updater(prev)
      : { ...prev, ...(updater || {}) };

  return writeSessionState(next);
}

module.exports = {
  LOG_FILE,
  SESSION_STATE_FILE,
  appendDebugLog,
  readSessionState,
  writeSessionState,
  mergeSessionState,
};
