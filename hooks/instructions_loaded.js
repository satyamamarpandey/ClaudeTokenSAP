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
    onboardingStep: 0,
    onboardingAnswers: {},
    onboardingOriginalPrompt: null,
    detectedSignals: {},
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
    "TOKEN OPTIMIZER v2.3.7 - Context Savings Policy",
    "",
    "MANDATORY RULES (apply to EVERY response this session):",
    "",
    "SEARCH FIRST:",
    "- Always Grep/Glob before Read",
    "- Read with offset+limit, never full file unless <3KB",
    "- Never browse files to find a symbol - Grep for it",
    "",
    "CONCISE OUTPUT:",
    "- ALWAYS produce visible text output - never go silent or stay in thinking mode",
    "- Max 3-5 sentences for explanations, no filler words",
    "- No 'Here is...' / 'I will...' / 'Let me...' preambles",
    "- No re-stating what the user said or echoing file contents",
    "- Code responses: just the code, no line-by-line narration",
    "- If creating files: create them silently, report only what was created",
    "- Batch independent tool calls in parallel - ALWAYS",
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
    "- Multi-step tasks: ONE pass, stop, report, wait - no loops",
    "- Bash output >50 lines: extract errors + head/tail only",
    "- Large JSON: convert flat arrays to CSV, summarize nested objects",
    "- Never repeat prior explanations or re-read already-read files",
    "",
    "FLOW CONTROL (critical):",
    "- After onboarding: announce 'Setup complete. Now working on: [original request]'",
    "- After completing ANY task: say 'Done. [1-line summary].' then STOP",
    "- NEVER loop back to re-check or re-verify after announcing completion",
    "- NEVER stay silent - always produce visible output the user can read",
    "- If a hook injected guidance, follow it but ALWAYS respond visibly to the user",
    "",
    "VERIFICATION BEFORE COMPLETION:",
    "- NEVER claim work is done without running a verification command",
    "- Evidence before claims: run tests/build, check output, then assert",
    "- No 'should work' or 'probably fixed' - only verified results",
    "- If you fixed a bug, reproduce the original failure first, then verify it's gone",
    "",
    "SYSTEMATIC DEBUGGING (when errors occur):",
    "- Phase 1: Read the FULL error, trace data flow backward to root cause",
    "- Phase 2: Find similar WORKING code in the codebase, compare differences",
    "- Phase 3: Form ONE hypothesis, make smallest test change to verify",
    "- Phase 4: Write a failing test, implement targeted fix, verify",
    "- After 3 failed attempts: STOP - question the approach, ask the user",
    "",
    "TEST-DRIVEN DEVELOPMENT:",
    "- Write the test FIRST (RED), then implement to pass (GREEN), then refactor",
    "- Never write production code without a corresponding test",
    "- If code was written before tests, write tests that verify the actual behavior",
    "",
    "MODEL SELECTION (for subagents):",
    "- Use Haiku for: file searches, simple transforms, mechanical tasks, formatting",
    "- Use Sonnet for: main coding, multi-step logic, code review",
    "- Use Opus only for: complex architecture, deep reasoning, ambiguous requirements, complex coding, or when Sonnet fails to produce good output after 2 attempts",
    "- Default to the cheapest model that can handle the task",
    "",
    "PARALLEL DISPATCH:",
    "- Independent tasks MUST run in parallel (multiple Agent calls in one message)",
    "- Each agent gets: narrow scope, complete context, clear deliverable",
    "- Never dispatch agents sequentially when they have no dependencies",
    "",
    "CLAUDE.MD AS SOURCE OF TRUTH:",
    "- ALWAYS read .claude/CLAUDE.md BEFORE starting any task - it has project context",
    "- Use CLAUDE.md for stack, platform, users, constraints - do NOT rescan the codebase for info already recorded",
    "- After EVERY task: check if you learned new project facts (new dependency, architecture decision, API pattern)",
    "  If yes, append 1-2 lines to CLAUDE.md using the Edit tool. Keep it under 30 lines total.",
    "- If CLAUDE.md still has '(pending onboarding)' placeholders, ask the user to fill them in BEFORE proceeding",
    "",
    "CONTEXT MANAGEMENT:",
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
