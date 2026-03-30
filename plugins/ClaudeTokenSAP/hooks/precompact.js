const fs = require("fs");
const path = require("path");
const { appendDebugLog } = require("../lib/debug-log");

/**
 * Read a JSON payload from stdin. Claude Code passes arguments for hooks
 * using this mechanism. If parsing fails, return an empty object.
 */
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

// Produce a simple summary of the current debug log. This helps
// compacting sessions understand what has occurred so far.
function summarizeDebug(logFilePath) {
  try {
    const lines = fs.readFileSync(logFilePath, "utf8").trim().split(/\n+/);
    // Only keep the last few events to avoid blowing up context
    const recent = lines.slice(-5).map((line) => {
      try {
        const obj = JSON.parse(line);
        return `${obj.event}: ${new Date(obj.ts).toLocaleString()} (pid ${obj.pid})`;
      } catch {
        return line;
      }
    });
    return recent;
  } catch {
    return [];
  }
}

(async () => {
  const payload = await readJsonStdin();
  // Log the precompact event for telemetry
  appendDebugLog("precompact", {
    cwd: payload.cwd,
    model: payload.model,
  });

  // Build an additional context message summarizing recent events
  const logFile = process.env.TOKEN_OPTIMIZER_LOG_FILE || path.join(require("os").tmpdir(), "token-optimizer-debug.log");
  const summaryLines = summarizeDebug(logFile);
  const additionalContext = summaryLines.length
    ? [
        "Token Optimizer pre-compact summary:",
        "Recent events:",
        ...summaryLines,
      ].join("\n")
    : "";

  // Output the additional context if non-empty
  const output = {};
  if (additionalContext) {
    output.hookSpecificOutput = {
      hookEventName: "PreCompact",
      additionalContext,
    };
  }
  process.stdout.write(JSON.stringify(output));
})();