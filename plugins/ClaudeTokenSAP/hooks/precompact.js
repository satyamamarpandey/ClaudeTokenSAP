const { appendDebugLog, LOG_FILE, readSessionState } = require("../lib/debug-log");
const fs = require("fs");

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

function recentDebugEvents(limit = 5) {
  try {
    const lines = fs.readFileSync(LOG_FILE, "utf8").trim().split(/\n+/);
    return lines
      .slice(-limit)
      .map((line) => {
        try {
          const item = JSON.parse(line);
          return `${item.event} @ ${item.ts}`;
        } catch {
          return line;
        }
      });
  } catch {
    return [];
  }
}

(async () => {
  const payload = await readJsonStdin();
  appendDebugLog("precompact", {
    cwd: payload.cwd,
    model: payload.model,
  });

  const state = readSessionState();
  const recentFiles = (state.recentlyReadFiles || []).slice(0, 5).map((item) => {
    const base = item.filePath ? item.filePath.split(/[\\/]/).pop() : "unknown";
    return `- ${base} (${item.summaryType || item.ext || "unknown"})`;
  });

  const lines = [
    "Token Optimizer pre-compact memory:",
    `- current task: ${state.currentTask || "unknown"}`,
    `- clarification rounds used: ${state.clarificationRounds || 0}`,
    `- blocked large reads: ${state.blockedReads || 0}`,
  ];

  if (recentFiles.length) {
    lines.push("- recently read files:");
    lines.push(...recentFiles);
  }

  const events = recentDebugEvents(4);
  if (events.length) {
    lines.push("- recent hook events:");
    lines.push(...events.map((event) => `- ${event}`));
  }

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreCompact",
        additionalContext: lines.join("\n"),
      },
    })
  );
})();
