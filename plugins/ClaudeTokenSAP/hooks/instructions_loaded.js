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
    "Token Optimizer policy (apply every response):",
    "TOOLS: Grep/Glob first → targeted Read(offset+limit) → full Read only if file <5KB",
    "DEBUG/FIX: Grep the error text → read only the failing function/block range, not the whole file",
    "REFACTOR: Glob to map scope → Grep for usages → targeted reads; never load whole files",
    "BUILD: if platform/stack is absent from the prompt, ask ONE question with numbered options; proceed with defaults otherwise",
    "TEST: read only the specific test + the function under test; skip unrelated test files",
    "GIT: use Bash git commands only; do not read files to understand history or diff changes",
    "EXPLAIN: Grep for the symbol definition → read that function/class block only",
    "SEARCH: always Grep before any Read — never browse files to find a symbol",
    "CLARIFY: ask at most once, only for the ONE detail that would change the entire approach; state a default and proceed otherwise",
    "MULTI-STEP (build+test+improve): complete ONE bounded pass, stop, report results, wait for next instruction — do NOT loop",
    "OUTPUT: no echoing file content back, no repeating prior explanations, stay concise",
    "BASH OUTPUT: if a command produces many lines, extract only errors/warnings + first and last lines",
    "CLAUDE.MD: after any task where a large file was blocked, check if the project CLAUDE.md deny-rules already cover that pattern; if not, add a minimal rule",
    `Debug log: ${LOG_FILE}`,
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