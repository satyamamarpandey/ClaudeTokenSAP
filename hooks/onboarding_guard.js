const fs = require("fs");
const path = require("path");
const { appendDebugLog, mergeSessionState, readSessionState } = require("../lib/debug-log");

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
    "<!-- Token Optimizer: onboarding in progress — Claude will update this file -->",
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

  appendDebugLog("onboarding_done", { cwd, projectName, created });

  // Inject directive telling Claude to ask onboarding questions
  // and then update CLAUDE.md using the Edit tool
  const directive = [
    "IMPORTANT — First-run onboarding required. Before doing ANYTHING else:",
    "",
    "1. Ask the user these questions in a SINGLE concise message (numbered list):",
    "   a) What are you building? (web app / mobile app / tablet app / watch app / CLI / API / game / other)",
    "   b) What language and framework? (e.g., React+TypeScript, Python+FastAPI, Flutter, etc.)",
    "   c) Who are the target users? (e.g., developers, consumers, internal team)",
    "   d) Do you need a database? If yes, which? (PostgreSQL, MongoDB, SQLite, none, etc.)",
    "   e) Any key constraints or preferences? (e.g., must be offline-capable, no external APIs)",
    "",
    "2. After the user answers, use the Edit tool to update `.claude/CLAUDE.md`:",
    "   - Replace '(pending onboarding)' placeholders with real answers",
    "   - Keep the file SHORT — max 15 lines of content",
    "   - Do NOT add verbose descriptions or long explanations",
    "",
    "3. Then proceed with the user's original request: " + prompt.slice(0, 200),
    "",
    "Keep the questions SHORT. Do not explain why you're asking. Just ask.",
    "Files created: " + created.join(", "),
  ].join("\n");

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: directive,
      },
    })
  );
})();
