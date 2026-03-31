const {
  appendDebugLog,
  mergeSessionState,
  readSessionState,
} = require("../lib/debug-log");
const { getUsage } = require("../lib/token-budget");
const { getDedupStats } = require("../lib/dedup-tracker");

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

  // Gather metrics from all subsystems
  const promptCount = nextState.promptCount || 0;
  const blockedReads = nextState.blockedReads || 0;
  const compressedBash = nextState.bashCompressCount || 0;
  const searchCompressed = nextState.searchCompressCount || 0;
  const errorLoops = nextState.errorLoopsDetected || 0;
  const compactions = nextState.compactionCount || 0;
  const duplicateReads = nextState.duplicateReads || 0;

  const usage = getUsage();
  const dedupStats = getDedupStats();

  const lines = [
    "TOKEN OPTIMIZER: POST-COMPACT RESUME BRIEFING",
    "═══════════════════════════════════════════════",
    "",
    `Session: ${promptCount} prompts | compaction #${compactions}`,
  ];

  // Token budget status
  lines.push(
    "",
    "── Budget ──",
    `  Consumed: ~${usage.consumed.toLocaleString()} tokens (${usage.pct}% of ${usage.total.toLocaleString()})`,
  );
  if (usage.savings.total > 0) {
    lines.push(`  Saved: ~${usage.savings.total.toLocaleString()} tokens via optimization`);
  }

  // Efficiency metrics
  const totalActions = blockedReads + compressedBash + searchCompressed + errorLoops + duplicateReads;
  if (totalActions > 0) {
    lines.push(
      "",
      "── Efficiency ──",
    );
    if (blockedReads > 0) lines.push(`  ${blockedReads} large reads blocked`);
    if (compressedBash > 0) lines.push(`  ${compressedBash} bash outputs compressed`);
    if (searchCompressed > 0) lines.push(`  ${searchCompressed} search results compressed`);
    if (errorLoops > 0) lines.push(`  ${errorLoops} error loops detected & interrupted`);
    if (duplicateReads > 0) lines.push(`  ${duplicateReads} duplicate reads flagged`);
  }

  // Architecture signals
  const archSignals = nextState.archSignals || {};
  const archNotes = [];
  if (archSignals.depsModified) archNotes.push(`deps:${archSignals.depsModified}`);
  if (archSignals.dbModified) archNotes.push(`db:${archSignals.dbModified}`);
  if (archSignals.apiModified) archNotes.push(`api:${archSignals.apiModified}`);
  if (archSignals.configModified) archNotes.push(`config:${archSignals.configModified}`);
  if (archSignals.testModified) archNotes.push(`test:${archSignals.testModified}`);
  if (archNotes.length > 0) {
    lines.push(
      "",
      `── Architecture changes: ${archNotes.join(", ")} ──`
    );
  }

  // Files modified by category (from write_tracker)
  const fileModsByCategory = nextState.fileModsByCategory || {};
  const modCategories = Object.entries(fileModsByCategory).filter(([, v]) => v > 0);
  if (modCategories.length > 0) {
    lines.push(
      "",
      "── Files modified ──",
      `  ${modCategories.map(([cat, n]) => `${cat}:${n}`).join(", ")}`
    );
  }

  // Continuation hints
  lines.push("", "── Resume ──");
  if (nextState.lastBlockedFile) {
    lines.push(`  Last blocked: ${nextState.lastBlockedFile.filePath.split(/[\\/]/).pop()} — use targeted search`);
  }
  if (nextState.lastReadFile) {
    lines.push(`  Last read: ${nextState.lastReadFile.filePath.split(/[\\/]/).pop()}`);
  }

  lines.push(
    "",
    "IMPORTANT: Update .claude/CLAUDE.md if you learned new project info.",
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
