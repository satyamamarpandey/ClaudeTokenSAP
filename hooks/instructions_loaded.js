const fs = require("fs");
const path = require("path");
const { appendDebugLog, LOG_FILE, mergeSessionState } = require("../lib/debug-log");

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

function getRepoSummary(rootDir) {
  const counts = {};
  try {
    const items = fs.readdirSync(rootDir, { withFileTypes: true });
    for (const item of items) {
      if (item.isFile()) {
        const ext = path.extname(item.name).toLowerCase() || "<no-ext>";
        counts[ext] = (counts[ext] || 0) + 1;
      }
    }
  } catch {}
  return counts;
}

function detectStack(rootDir) {
  const markers = [
    ["package.json", "Node.js"],
    ["tsconfig.json", "TypeScript"],
    ["next.config.js", "Next.js"], ["next.config.ts", "Next.js"], ["next.config.mjs", "Next.js"],
    ["vite.config.ts", "Vite"], ["vite.config.js", "Vite"],
    ["requirements.txt", "Python"], ["pyproject.toml", "Python"], ["setup.py", "Python"],
    ["Cargo.toml", "Rust"],
    ["go.mod", "Go"],
    ["pom.xml", "Java/Maven"], ["build.gradle", "Java/Gradle"],
    ["pubspec.yaml", "Flutter/Dart"],
    ["Gemfile", "Ruby"],
    ["composer.json", "PHP"],
  ];

  const detected = [];
  for (const [file, stack] of markers) {
    try {
      if (fs.existsSync(path.join(rootDir, file))) detected.push(stack);
    } catch {}
  }
  return detected;
}

(async () => {
  const payload = await readJsonStdin();
  const cwd = payload.cwd || process.cwd();
  const repoSummary = getRepoSummary(cwd);
  const detectedStack = detectStack(cwd);

  // Reset per-session flags
  mergeSessionState((prev) => ({
    ...prev,
    onboardingDone: false,
    promptCount: 0,
    sessionStartedAt: new Date().toISOString(),
  }));

  const isFirstRun = !fs.existsSync(path.join(cwd, ".claude", "CLAUDE.md"));

  appendDebugLog("session_start", {
    cwd,
    source: payload.source,
    model: payload.model,
    logFile: LOG_FILE,
    repoSummary,
    detectedStack,
    isFirstRun,
  });

  const lines = [
    "TOKEN OPTIMIZER v2.0.0 — Context Savings Policy",
    "",
    "MANDATORY RULES (apply to EVERY response this session):",
    "",
    "SEARCH FIRST:",
    "- Always Grep/Glob before Read",
    "- Read with offset+limit, never full file unless <3KB",
    "- Never browse files to find a symbol — Grep for it",
    "",
    "CONCISE OUTPUT:",
    "- Max 3-5 sentences for explanations, no filler words",
    "- No 'Here is...' / 'I will...' / 'Let me...' preambles",
    "- No re-stating what the user said or echoing file contents",
    "- Code responses: just the code, no line-by-line narration",
    "- If creating files: create them silently, report only what was created",
    "- Batch independent tool calls in parallel — ALWAYS",
    "",
    "TASK-SPECIFIC:",
    "- DEBUG: Grep error text first, read only failing function",
    "- BUILD: if stack is unclear, ask ONE question with defaults, then proceed",
    "- TEST: read only the test + function under test, skip others",
    "- REFACTOR: Glob to map scope, Grep usages, targeted reads only",
    "- GIT: Bash git commands only, never read files for history",
    "- EXPLAIN: Grep symbol definition, read that block only",
    "",
    "EFFICIENCY:",
    "- Multi-step tasks: ONE pass, stop, report, wait — no loops",
    "- Bash output >50 lines: extract errors + head/tail only",
    "- Large JSON: convert flat arrays to CSV, summarize nested objects",
    "- Never repeat prior explanations or re-read already-read files",
    "",
    "CONTEXT MANAGEMENT:",
    "- After task completion, update .claude/CLAUDE.md if new project info was learned",
    "- /compact will be suggested every 4 prompts automatically",
  ];

  // Add detected stack info
  if (detectedStack.length > 0) {
    lines.push(`\nDetected stack: ${detectedStack.join(", ")}`);
  }

  // Add repo file summary
  try {
    const entries = Object.entries(repoSummary)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([ext, count]) => `${ext}:${count}`)
      .join(" ");
    if (entries) lines.push(`Repo files: ${entries}`);
  } catch {}

  lines.push(`\nDebug: ${LOG_FILE}`);

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: lines.join("\n"),
      },
    })
  );
})();
