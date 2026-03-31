const fs = require("fs");
const path = require("path");
const { appendDebugLog, LOG_FILE, readSessionState } = require("../lib/debug-log");

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

function recentDebugEvents(limit = 5) {
  try {
    const lines = fs.readFileSync(LOG_FILE, "utf8").trim().split(/\n+/);
    return lines.slice(-limit).map((line) => {
      try {
        const item = JSON.parse(line);
        return `${item.event} @ ${item.ts}`;
      } catch { return line; }
    });
  } catch { return []; }
}

(async () => {
  const payload = await readJsonStdin();
  const cwd = payload.cwd || process.cwd();

  appendDebugLog("precompact", { cwd, model: payload.model });

  const state = readSessionState();

  // Collect session learnings to preserve across compaction
  const learnings = [];

  // Track files that were read/modified
  const recentFiles = (state.recentlyReadFiles || []).slice(0, 5).map((item) => {
    const base = item.filePath ? item.filePath.split(/[\\/]/).pop() : "unknown";
    return `${base} (${item.summaryType || item.ext || "?"})`;
  });

  // Build compaction memory
  const lines = [
    "Token Optimizer pre-compact memory (preserve this across compaction):",
    "",
    `- prompts this session: ${state.promptCount || 0}`,
    `- blocked large reads: ${state.blockedReads || 0}`,
    `- bash outputs compressed: ${state.bashCompressCount || 0}`,
    `- compactions so far: ${state.compactionCount || 0}`,
  ];

  if (state.currentTask) {
    lines.push(`- current task: ${state.currentTask}`);
  }

  if (recentFiles.length) {
    lines.push("- key files touched: " + recentFiles.join(", "));
  }

  // Check if CLAUDE.md has been populated (not placeholder)
  const claudeMdPath = path.join(cwd, ".claude", "CLAUDE.md");
  try {
    const md = fs.readFileSync(claudeMdPath, "utf8");
    if (md.includes("pending onboarding")) {
      lines.push("- NOTE: .claude/CLAUDE.md still has placeholder values — onboarding was not completed");
    }
  } catch {}

  // Inject directive to update CLAUDE.md with anything learned
  lines.push(
    "",
    "AFTER COMPACTION: If you learned anything new about the project during this session",
    "(stack, key files, architecture patterns, constraints), update .claude/CLAUDE.md",
    "using the Edit tool. Keep it concise — max 20 lines total."
  );

  const events = recentDebugEvents(4);
  if (events.length) {
    lines.push("- recent events: " + events.join(", "));
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
