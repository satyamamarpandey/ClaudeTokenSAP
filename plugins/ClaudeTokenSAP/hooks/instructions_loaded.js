const { appendDebugLog, LOG_FILE } = require("../lib/debug-log");

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
    // Ignore repo summary errors
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

  const additionalContextLines = [
    "Token Optimizer session policy:",
    "- For vague build/create/scaffold prompts, ask targeted clarification questions before writing code.",
    "- Ask only for missing details. Skip any detail the user already provided.",
    "- Ask at most one clarification round for a normal build request.",
    "- If the user answers a clarification round, proceed with smart defaults unless a truly blocking detail is still missing.",
    "- Treat phrases like `choose your own framework`, `best one`, `pick for me`, `all functions`, and `all features` as permission to select sensible defaults and continue.",
    "- Do not ask the same category twice in a row.",
    "- Use compact OpenCode-like numbered choices, and make the last option in each question exactly `Custom`.",
    "- If the user clearly asks for the simplest/default version and the platform/stack is already clear, proceed without another clarification round.",
    "- Prefer search, grep, symbol lookup, or targeted range reads before large full-file reads.",
    "- Do not rewrite workspace files on disk just to save tokens.",
    "- For large JSON/log/CSV/generated files, prefer targeted inspection and summaries over full-file dumps.",
    `- Debug log file: ${LOG_FILE}`,
  ];

  try {
    const countEntries = Object.entries(repoSummary)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([ext, count]) => `${ext}: ${count}`)
      .join(", ");

    if (countEntries) {
      additionalContextLines.push(`- Repo file summary: ${countEntries}`);
    }
  } catch {
    // Ignore repo summary formatting errors
  }

  const additionalContext = additionalContextLines.join("\n");

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext,
      },
    })
  );
})();