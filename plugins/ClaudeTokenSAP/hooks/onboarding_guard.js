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

// Derive ONE focused question based on what the user is asking to build.
// Returns null if the prompt is too vague or not a "build" prompt.
function deriveQuestion(prompt) {
  const p = prompt.toLowerCase();

  if (/\b(website|web app|webapp|frontend|react|next\.?js|vue|svelte|dashboard|landing page|portfolio)\b/.test(p)) {
    return "Stack? 1) Next.js (full-stack) 2) React (SPA) 3) Static HTML — I'll default to Next.js";
  }
  if (/\b(api|backend|server|rest|graphql|endpoint|microservice|service)\b/.test(p)) {
    return "Runtime? 1) Node.js/Express 2) Python/FastAPI 3) Node.js/Hono — I'll default to Node.js/Express";
  }
  if (/\b(calculator|calc|converter|formatter|tool|utility)\b/.test(p)) {
    return "Complexity? 1) Basic 2) Scientific/advanced 3) Domain-specific — I'll default to Basic";
  }
  if (/\b(cli|command.?line|terminal|script|automation)\b/.test(p)) {
    return "Language? 1) Node.js 2) Python 3) Bash — I'll default to Node.js";
  }
  if (/\b(game|puzzle|quiz|trivia)\b/.test(p)) {
    return "Platform? 1) Browser (HTML5/Canvas) 2) Terminal/CLI 3) Mobile — I'll default to Browser";
  }
  if (/\b(mobile|ios|android|react native|flutter)\b/.test(p)) {
    return "Framework? 1) React Native 2) Flutter 3) Expo — I'll default to React Native";
  }
  if (/\b(chat|chatbot|bot|assistant|ai)\b/.test(p)) {
    return "Interface? 1) Web chat UI 2) Slack/Discord bot 3) CLI — I'll default to Web chat UI";
  }
  if (/\b(blog|cms|content|store|shop|e-?commerce)\b/.test(p)) {
    return "Stack? 1) Next.js + Markdown 2) Next.js + CMS 3) Static site — I'll default to Next.js + Markdown";
  }
  if (/\b(database|schema|migration|model|orm)\b/.test(p)) {
    return "DB? 1) PostgreSQL 2) SQLite 3) MongoDB — I'll default to PostgreSQL";
  }

  // Generic create/build prompt — ask for platform
  if (/\b(create|build|make|write|generate|develop|implement|design)\b/.test(p)) {
    return "What type? 1) Web app 2) API/service 3) CLI tool 4) Script — I'll default to Web app";
  }

  return null; // Not a build prompt — no onboarding question needed
}

(async () => {
  const payload = await readJsonStdin();
  const cwd = payload.cwd || process.cwd();
  const prompt = payload.prompt || "";

  // Skip if .claude/CLAUDE.md already exists — onboarding was done previously
  const claudeMdPath = path.join(cwd, ".claude", "CLAUDE.md");
  if (fs.existsSync(claudeMdPath)) {
    appendDebugLog("onboarding_guard_skip", { reason: "CLAUDE.md exists", cwd });
    process.exit(0);
  }

  // Skip if we already injected the onboarding directive this session
  const state = readSessionState();
  if (state.onboardingAsked) {
    appendDebugLog("onboarding_guard_skip", { reason: "already asked this session" });
    process.exit(0);
  }

  const question = deriveQuestion(prompt);

  appendDebugLog("onboarding_guard_trigger", { cwd, promptLength: prompt.length, question });

  mergeSessionState((prev) => ({ ...prev, onboardingAsked: true }));

  const directive = question
    ? [
        "FIRST-RUN ONBOARDING:",
        `Ask the user this ONE question before starting: "${question}"`,
        "After they reply (or if they say skip/default), immediately create:",
        "  1. .claude/CLAUDE.md — max 12 lines: what is being built, inferred target users, platform/stack, model strategy (use lightweight models for simple tasks), key constraints",
        "  2. .claude/settings.json — with deny rules for: node_modules/**, dist/**, build/**, .next/**, coverage/**, .turbo/**, vendor/**, out/**, **/*.lock, **/*.log, **/*.map, **/*.min.js",
        "Then proceed with the original request. Do NOT ask any other questions.",
      ].join("\n")
    : [
        "FIRST-RUN SETUP:",
        "Before starting, create these two files:",
        "  1. .claude/CLAUDE.md — max 12 lines: infer what is being built from the prompt, target users, platform, model strategy, key constraints",
        "  2. .claude/settings.json — with deny rules for: node_modules/**, dist/**, build/**, .next/**, coverage/**, .turbo/**, vendor/**, out/**, **/*.lock, **/*.log, **/*.map, **/*.min.js",
        "Then proceed immediately. Do NOT ask any questions.",
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
