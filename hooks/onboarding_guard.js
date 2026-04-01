const fs = require("fs");
const path = require("path");
const { appendDebugLog, mergeSessionState, readSessionState } = require("../lib/debug-log");
const { analyzePrompt } = require("../lib/prompt-analyzer");

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

const DENY_RULES = [
  "Read(node_modules/**)",
  "Read(dist/**)",
  "Read(build/**)",
  "Read(.next/**)",
  "Read(coverage/**)",
  "Read(.turbo/**)",
  "Read(vendor/**)",
  "Read(out/**)",
  "Read(**/*.lock)",
  "Read(**/*.log)",
  "Read(**/*.map)",
  "Read(**/*.min.js)",
  "Read(**/*.min.css)",
  "Read(.git/**)",
  "Read(**/*.wasm)",
  "Read(**/*.pb)",
];

const ASK_RULES = [
  "Read(**/*.png)",
  "Read(**/*.jpg)",
  "Read(**/*.jpeg)",
  "Read(**/*.gif)",
  "Read(**/*.svg)",
  "Read(**/*.mp4)",
  "Read(**/*.mp3)",
  "Read(**/*.wav)",
];

// One question per turn - presented one at a time
const QUESTIONS = [
  {
    key: "appType",
    label: "What type of app are you building?",
    options: ["Web app", "Mobile app", "CLI tool", "API / Backend", "Desktop app"],
  },
  {
    key: "stack",
    label: "Language and framework?",
    options: ["React + TypeScript", "Next.js", "Vue / Nuxt", "Python", "Flutter / Dart", "Node.js / Express"],
  },
  {
    key: "users",
    label: "Who are the target users?",
    options: ["Developers", "Students", "General consumers", "Business users"],
  },
  {
    key: "database",
    label: "Database?",
    options: ["None", "PostgreSQL", "SQLite", "MongoDB", "MySQL"],
  },
  {
    key: "constraints",
    label: "Any constraints or preferences?",
    options: ["None", "Dark theme", "Mobile-first / responsive", "Performance-critical", "Accessibility (WCAG)"],
  },
];

function resolveOption(text, options) {
  const t = (text || "").trim();
  if (!t) return null; // blank → caller uses default
  const n = parseInt(t, 10);
  if (n >= 1 && n <= options.length) return options[n - 1];
  return t; // free-text answer
}

function formatQuestion(q, stepNum, totalSteps, detectedDefault) {
  const lines = [
    `[ ${stepNum} / ${totalSteps} ]  ${q.label}`,
    "",
  ];
  q.options.forEach((opt, i) => {
    lines.push(`  ${i + 1}.  ${opt}`);
  });
  lines.push("");
  if (detectedDefault) {
    lines.push(`  Auto-detected: ${detectedDefault}`);
    lines.push(`  Type 1 to confirm, or type another number / custom answer`);
  } else {
    lines.push(`  Type 1-${q.options.length}, or enter a custom answer`);
  }
  return lines.join("\n");
}

function emit(directiveStr) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: directiveStr,
      },
    })
  );
}

(async () => {
  const payload = await readJsonStdin();
  const cwd = payload.cwd || process.cwd();
  const prompt = (payload.prompt || "").trim();

  const claudeMdPath = path.join(cwd, ".claude", "CLAUDE.md");

  // Already onboarded - skip entirely
  if (fs.existsSync(claudeMdPath)) {
    process.exit(0);
  }

  const state = readSessionState();
  const step = state.onboardingStep || 0;

  // Completed onboarding this session - skip
  if (step >= 6) {
    process.exit(0);
  }

  appendDebugLog("onboarding_step", { step, cwd });

  // ── Step 0: first trigger - save original prompt, ask Q1 ──────────────
  if (step === 0) {
    const detected = analyzePrompt(prompt.slice(0, 500));
    mergeSessionState((prev) => ({
      ...prev,
      onboardingStep: 1,
      onboardingOriginalPrompt: prompt.slice(0, 400),
      detectedSignals: detected,
      onboardingAnswers: {},
    }));

    appendDebugLog("onboarding_start", { originalPrompt: prompt.slice(0, 100) });

    const qText = formatQuestion(QUESTIONS[0], 1, 5, detected.appType || null);

    emit([
      "⛔ ONBOARDING - Ask ONLY this question. Do NOT write code or start the task yet.",
      "",
      qText,
      "",
      "Present this question clearly, then STOP and wait for the user's answer.",
    ].join("\n"));
    return;
  }

  // ── Steps 1–5: capture answer to Q(step-1), ask Q(step) or finalize ───
  const answers = { ...(state.onboardingAnswers || {}) };
  const prevQ = QUESTIONS[step - 1];
  answers[prevQ.key] = resolveOption(prompt, prevQ.options) || prevQ.options[0];

  if (step < 5) {
    mergeSessionState((prev) => ({
      ...prev,
      onboardingStep: step + 1,
      onboardingAnswers: answers,
    }));

    const detected = state.detectedSignals || {};
    let detectedDefault = null;
    if (step === 1) detectedDefault = detected.framework || null;
    if (step === 3) detectedDefault = detected.database || null;

    const qText = formatQuestion(QUESTIONS[step], step + 1, 5, detectedDefault);

    emit([
      `⛔ ONBOARDING - Ask Question ${step + 1}. Do NOT write code yet.`,
      "",
      qText,
      "",
      "Present this question, then STOP and wait for the user's answer.",
    ].join("\n"));
    return;
  }

  // ── Step 5 complete: all answers collected - create files ──────────────
  mergeSessionState((prev) => ({
    ...prev,
    onboardingStep: 6,
    onboardingDone: true,
    onboardingAnswers: answers,
  }));

  appendDebugLog("onboarding_complete", { answers });

  const projectName = path.basename(cwd) || "Project";
  const originalPrompt = state.onboardingOriginalPrompt || "";
  const constraints = (answers.constraints === "None") ? "None" : (answers.constraints || "None");

  const settingsContent = JSON.stringify({
    model: "opusplan",
    permissions: { deny: DENY_RULES, ask: ASK_RULES },
  }, null, 2);

  const claudeignoreContent = [
    "node_modules/", "dist/", "build/", ".next/", "coverage/",
    ".turbo/", "vendor/", "out/", ".git/", ".cache/", ".parcel-cache/",
    "__pycache__/", "target/",
    "*.lock", "*.log", "*.map", "*.min.js", "*.min.css",
    "*.wasm", "*.pb", "*.tsbuildinfo", "*.pyc", "*.class",
  ].join("\n");

  emit([
    "✅ ONBOARDING COMPLETE - Create the project files now, then execute the original request.",
    "",
    `Collected answers:`,
    `  App type:    ${answers.appType}`,
    `  Stack:       ${answers.stack}`,
    `  Users:       ${answers.users}`,
    `  Database:    ${answers.database}`,
    `  Constraints: ${constraints}`,
    "",
    "Step 1: Bash: mkdir -p .claude",
    "Step 2: Write .claude/CLAUDE.md (keep under 20 lines):",
    `  # ${projectName}`,
    `  Building: ${answers.appType}`,
    `  Stack: ${answers.stack}`,
    `  Users: ${answers.users}`,
    `  Database: ${answers.database}`,
    `  Constraints: ${constraints}`,
    `  # AI strategy`,
    `  Use Haiku for simple tasks; Sonnet for main dev; Opus for complex arch or if Sonnet fails 2x.`,
    `  Keep context low: Grep before Read, targeted reads only.`,
    `  # Rules`,
    `  Concise responses. No overengineering. No unrequested extras.`,
    "",
    "Step 3: Write .claude/settings.json:",
    settingsContent,
    "",
    "Step 4: Write .claudeignore in project ROOT (not .claudeignore.md):",
    claudeignoreContent,
    "",
    `Step 5: Announce: 'Setup complete. Now building: ${originalPrompt.slice(0, 100)}'`,
    `Step 6: Execute the original request: "${originalPrompt}"`,
    "Step 7 when done: 'Done. [1-line summary]. Ready to test.' Then STOP.",
  ].join("\n"));
})();
