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

(async () => {
  const payload = await readJsonStdin();

  // Gather a simple repository summary on session start. This scans the current
  // working directory (the project root) and counts top level files by
  // extension. This is a lightweight alternative to a full repo map and
  // provides Claude with useful context without sending every file.
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

  appendDebugLog("session_start", {
    cwd: payload.cwd,
    source: payload.source,
    model: payload.model,
    transcriptPath: payload.transcript_path,
    logFile: LOG_FILE,
    // log a basic repo summary as part of telemetry
    repoSummary: getRepoSummary(payload.cwd || process.cwd()),
  });

  // Build the additional context lines. We'll join them below.
  const additionalContextLines = [
    "Token Optimizer session policy:",
    "- For vague build/create/scaffold prompts, ask targeted clarification questions before writing code.",
    "- Ask only for missing details. Skip any detail the user already provided.",
    "- Use compact OpenCode-like numbered choices, and make the last option in each question exactly `Custom`.",
    "- If the user clearly asks for the simplest/default version and the platform/stack is already clear, proceed without a clarification round.",
    "- Do not rewrite workspace files on disk just to save tokens.",
    "- For large JSON/log/CSV/generated files, prefer targeted inspection and summaries over full-file dumps.",
    `- Debug log file: ${LOG_FILE}`,
  ];

  // Append a short repo summary to the additional context if available.
  try {
    const repoCounts = getRepoSummary(payload.cwd || process.cwd());
    const countEntries = Object.entries(repoCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([ext, count]) => `${ext}: ${count}`)
      .join(", ");
    if (countEntries) {
      additionalContextLines.push(`- Repo file summary: ${countEntries}`);
    }
  } catch {
    // ignore summary errors
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