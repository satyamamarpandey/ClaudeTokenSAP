const {
  appendDebugLog,
  mergeSessionState,
  readSessionState,
} = require("../lib/debug-log");

function readJsonStdin() {
  return new Promise((resolve) => {
    let raw = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { raw += chunk; });
    process.stdin.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { resolve({}); }
    });
  });
}

(async () => {
  const payload = await readJsonStdin();

  appendDebugLog("postcompact", { cwd: payload.cwd, model: payload.model });

  const nextState = mergeSessionState((prev) => ({
    ...prev,
    compactionCount: (prev.compactionCount || 0) + 1,
    lastCompactedAt: new Date().toISOString(),
  }));

  // Calculate session efficiency metrics
  const promptCount = nextState.promptCount || 0;
  const blockedReads = nextState.blockedReads || 0;
  const compressedBash = nextState.bashCompressCount || 0;
  const compactions = nextState.compactionCount || 0;
  const totalSavings = blockedReads + compressedBash + compactions;

  const lines = [
    "Token Optimizer: post-compact",
    `- compaction #${compactions} complete`,
    `- session prompts: ${promptCount}`,
    `- total savings actions: ${totalSavings} (${blockedReads} reads blocked, ${compressedBash} outputs compressed)`,
  ];

  // Continuation hints
  if (nextState.lastBlockedFile) {
    lines.push(`- tip: inspect ${nextState.lastBlockedFile.filePath.split(/[\\/]/).pop()} with targeted search`);
  }
  if (nextState.lastReadFile) {
    lines.push(`- tip: continue from ${nextState.lastReadFile.filePath.split(/[\\/]/).pop()} if needed`);
  }

  // Remind about CLAUDE.md updates
  lines.push(
    "",
    "IMPORTANT: Update .claude/CLAUDE.md now if you learned new project info.",
    "Continue with the user's last task. Stay concise."
  );

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PostCompact",
        additionalContext: lines.join("\n"),
      },
    })
  );
})();
