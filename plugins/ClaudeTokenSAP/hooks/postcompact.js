const fs = require("fs");
const path = require("path");
const { appendDebugLog } = require("../lib/debug-log");

function readJsonStdin() {
  return new Promise((resolve) => {
    let raw = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      raw += chunk;
    });
    process.stdin.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });
}

// Count total events in the debug log for telemetry after compaction.
function countEvents(logFilePath) {
  try {
    const lines = fs.readFileSync(logFilePath, "utf8").trim().split(/\n+/);
    return lines.length;
  } catch {
    return 0;
  }
}

(async () => {
  const payload = await readJsonStdin();
  // Log the postcompact event
  appendDebugLog("postcompact", {
    cwd: payload.cwd,
    model: payload.model,
  });
  const logFile = process.env.TOKEN_OPTIMIZER_LOG_FILE || path.join(require("os").tmpdir(), "token-optimizer-debug.log");
  const totalEvents = countEvents(logFile);
  const additionalContext = `Token Optimizer post-compact summary:\nTotal events logged this session: ${totalEvents}`;
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PostCompact",
        additionalContext,
      },
    })
  );
})();