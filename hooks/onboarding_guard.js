const fs = require("fs");
const path = require("path");
const { appendDebugLog, mergeSessionState, readSessionState } = require("../lib/debug-log");
const { analyzePrompt, generateHints, formatDetectedContext } = require("../lib/prompt-analyzer");

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

(async () => {
  const payload = await readJsonStdin();
  const cwd = payload.cwd || process.cwd();
  const prompt = payload.prompt || "";

  const claudeDir = path.join(cwd, ".claude");
  const claudeMdPath = path.join(claudeDir, "CLAUDE.md");
  const settingsPath = path.join(claudeDir, "settings.json");

  // Skip if already onboarded (CLAUDE.md exists)
  if (fs.existsSync(claudeMdPath)) {
    appendDebugLog("onboarding_skip", { reason: "CLAUDE.md exists", cwd });
    process.exit(0);
  }

  // Skip if already ran this session
  const state = readSessionState();
  if (state.onboardingDone) {
    appendDebugLog("onboarding_skip", { reason: "already done this session" });
    process.exit(0);
  }

  mergeSessionState((prev) => ({ ...prev, onboardingDone: true }));

  const projectName = path.basename(cwd) || "Project";

  // Create .claude/ directory
  try { fs.mkdirSync(claudeDir, { recursive: true }); } catch {}

  // Create a minimal placeholder CLAUDE.md so the hook won't re-trigger
  // Claude will update this with real answers after asking questions
  const placeholderMd = [
    `# ${projectName}`,
    "",
    "<!-- Token Optimizer: onboarding in progress - Claude will update this file -->",
    "",
    "## Project Info",
    "- Type: (pending onboarding)",
    "- Platform: (pending onboarding)",
    "- Language: (pending onboarding)",
    "- Target Users: (pending onboarding)",
    "- Database: (pending onboarding)",
    "",
    "## AI Strategy",
    "- Use Haiku for simple tasks, Sonnet for main development",
    "- Keep context low: Grep before Read, targeted reads only",
    "- Concise responses, no overengineering, no unrequested extras",
    "",
  ].join("\n");

  const created = [];

  try {
    fs.writeFileSync(claudeMdPath, placeholderMd, "utf8");
    created.push(".claude/CLAUDE.md");
  } catch (e) {
    appendDebugLog("onboarding_error", { file: "CLAUDE.md", error: e.message });
  }

  // Write settings.json with deny + ask rules
  if (!fs.existsSync(settingsPath)) {
    try {
      fs.writeFileSync(
        settingsPath,
        JSON.stringify({
          permissions: {
            deny: DENY_RULES,
            ask: ASK_RULES,
          },
        }, null, 2),
        "utf8"
      );
      created.push(".claude/settings.json");
    } catch (e) {
      appendDebugLog("onboarding_error", { file: "settings.json", error: e.message });
    }
  }

  // Create .claudeignore for file-discovery-level blocking
  const claudeIgnorePath = path.join(cwd, ".claudeignore");
  if (!fs.existsSync(claudeIgnorePath)) {
    try {
      fs.writeFileSync(claudeIgnorePath, [
        "# Token Optimizer - auto-generated .claudeignore",
        "# Blocks noisy directories and files from Claude Code indexing",
        "",
        "node_modules/",
        "dist/",
        "build/",
        ".next/",
        "coverage/",
        ".turbo/",
        "vendor/",
        "out/",
        ".git/",
        ".cache/",
        ".parcel-cache/",
        "__pycache__/",
        "target/",
        "",
        "# Large/binary files",
        "*.lock",
        "*.log",
        "*.map",
        "*.min.js",
        "*.min.css",
        "*.wasm",
        "*.pb",
        "*.tsbuildinfo",
        "*.pyc",
        "*.class",
      ].join("\n"), "utf8");
      created.push(".claudeignore");
    } catch (e) {
      appendDebugLog("onboarding_error", { file: ".claudeignore", error: e.message });
    }
  }

  appendDebugLog("onboarding_done", { cwd, projectName, created });

  // ── Smart prompt analysis ──
  const savedPrompt = prompt.slice(0, 500);
  const detected = analyzePrompt(savedPrompt);
  const hints = generateHints(detected);
  const detectedSummary = formatDetectedContext(detected);

  appendDebugLog("onboarding_analysis", { detected: { appType: detected.appType, framework: detected.framework, language: detected.language, database: detected.database, platform: detected.platform, domain: detected.domain }, signalCount: detected.signals.length });

  // Save detected signals in session state for follow-up use
  mergeSessionState((prev) => ({ ...prev, detectedSignals: detected, onboardingPrompt: savedPrompt }));

  // ── Build smart directive with contextual hints ──
  const directive = [
    "⛔ MANDATORY ONBOARDING - DO NOT WRITE ANY CODE YET ⛔",
    "",
    "The user said: \"" + savedPrompt + "\"",
    "",
  ];

  // Show what was auto-detected (if anything)
  if (detectedSummary) {
    directive.push(
      "🔍 Auto-detected from prompt: " + detectedSummary,
      "",
      "Some answers may already be clear from the prompt. Show detected values as defaults",
      "so the user can confirm with a quick 'yes' or correct them.",
      ""
    );
  } else {
    directive.push(
      "No clear signals detected in the prompt. Ask all questions without defaults.",
      ""
    );
  }

  directive.push(
    "YOUR ONLY RESPONSE right now must be these 5 questions.",
    "Format each question as a numbered item with a hint line underneath.",
    "If a value was detected, show it as `[default: X]` so the user can just confirm.",
    "",
    "```",
    "1. **What type of app are you building?**",
    detected.appType
      ? `   [detected: ${detected.appType}] - press Enter to confirm or type to change`
      : `   ${hints.appType}`,
    "",
    "2. **Language and framework?**",
    detected.framework
      ? `   [detected: ${detected.framework}${detected.language ? " (" + detected.language + ")" : ""}] - confirm or specify`
      : `   ${hints.framework}`,
    "",
    "3. **Who are the target users?**",
    `   ${hints.users}`,
    "",
    "4. **Database?**",
    detected.database
      ? `   [detected: ${detected.database}] - confirm or correct`
      : `   ${hints.database}`,
    "",
    "5. **Any constraints or preferences?**",
    `   ${hints.constraints}`,
    "```",
    "",
    "AFTER the user answers all 5 questions:",
    "- Use the Edit tool to update `.claude/CLAUDE.md` - replace every '(pending onboarding)' with real answers",
    "- Add detected domain/platform info if confirmed",
    "- Keep CLAUDE.md under 20 lines, high-signal only",
    "- THEN execute the original request: \"" + savedPrompt.slice(0, 200) + "\"",
    "",
    "⚠️ DO NOT write code, create files, or start building until you have ALL 5 answers.",
    "⚠️ DO NOT say \"Let me help you build...\" - just ask the 5 questions immediately.",
    "⚠️ If user answers briefly (e.g., 'yes' or '1. web, 2. react, ...'), accept defaults and proceed.",
    "",
    "Files auto-created: " + created.join(", "),
  );

  const directiveStr = directive.join("\n");

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: directiveStr,
      },
    })
  );
})();
