const {
  appendDebugLog,
  mergeSessionState,
  readSessionState,
} = require("../lib/debug-log");

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

(async () => {
  const payload = await readJsonStdin();

  appendDebugLog("postcompact", {
    cwd: payload.cwd,
    model: payload.model,
  });

  const nextState = mergeSessionState((prev) => ({
    ...prev,
    compactionCount: (prev.compactionCount || 0) + 1,
    lastCompactedAt: new Date().toISOString(),
  }));

  const nextStepHints = [];
  if (nextState.lastBlockedFile) {
    nextStepHints.push(`Inspect ${nextState.lastBlockedFile.filePath.split(/[\\/]/).pop()} with a targeted search or range read.`);
  }
  if (nextState.lastReadFile) {
    nextStepHints.push(`Continue from ${nextState.lastReadFile.filePath.split(/[\\/]/).pop()} if more exact detail is needed.`);
  }

  const lines = [
    "Token Optimizer post-compact summary:",
    `- compaction count: ${nextState.compactionCount || 0}`,
    `- current task: ${nextState.currentTask || "unknown"}`,
  ];

  if (nextStepHints.length) {
    lines.push("- continuation hints:");
    lines.push(...nextStepHints.map((line) => `- ${line}`));
  }

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PostCompact",
        additionalContext: lines.join("\n"),
      },
    })
  );
})();
