const {
  appendDebugLog,
  LOG_FILE,
  mergeSessionState,
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

function getRepoSummary(rootDir) {
  const fs = require("fs");
  const path = require("path");
  const counts = {};
  try {
    const items = fs.readdirSync(rootDir, { withFileTypes: true });
    for (const item of items) {
      if (item.isFile()) {
        const ext = path.extname(item.name).toLowerCase() || "<no-ext>";
        counts[ext] = (counts[ext] || 0) + 1;
      }
    }
  } catch {
    // ignore errors; summary remains empty
  }
  return counts;
}

(async () => {
  const payload = await readJsonStdin();
  const cwd = payload.cwd || process.cwd();
  const repoSummary = getRepoSummary(cwd);

  appendDebugLog("session_start", {
    cwd,
    source: payload.source,
    model: payload.model,
    transcriptPath: payload.transcript_path,
    logFile: LOG_FILE,
    repoSummary,
  });

  mergeSessionState((prev) => ({
    ...prev,
    cwd,
    startedAt: prev.startedAt || new Date().toISOString(),
    repoSummary,
    compactionCount: prev.compactionCount || 0,
    blockedReads: prev.blockedReads || 0,
    recentlyReadFiles: prev.recentlyReadFiles || [],
    assumptions: prev.assumptions || {},
    clarificationRounds: prev.clarificationRounds || 0,
  }));

  const additionalContextLines = [
    "Token Optimizer session policy:",
    "- For vague build/create/scaffold prompts, ask targeted clarification questions before writing code.",
    "- Ask only for missing details. Skip any detail the user already provided.",
    "- Use compact OpenCode-like numbered choices, and make the last option in each question exactly `Custom`.",
    "- Do not ask a second full clarification round for a normal build request unless a truly blocking detail is still missing.",
    "- If the user replies to clarification with short options or phrases like `choose your own framework`, proceed with smart defaults.",
    "- Treat `choose your own framework`, `best one`, `all features`, and `all functions` as permission to choose sensible defaults.",
    "- Prefer search, grep, symbol lookup, or targeted range reads before large full-file reads.",
    "- Do not rewrite workspace files on disk just to save tokens.",
    "- For large JSON/log/CSV/generated files, prefer targeted inspection and summaries over full-file dumps.",
    `- Debug log file: ${LOG_FILE}`,
  ];

  const countEntries = Object.entries(repoSummary)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([ext, count]) => `${ext}: ${count}`)
    .join(", ");

  if (countEntries) {
    additionalContextLines.push(`- Repo file summary: ${countEntries}`);
  }

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: additionalContextLines.join("\n"),
      },
    })
  );
})();
