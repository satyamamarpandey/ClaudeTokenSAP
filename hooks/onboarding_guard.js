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

function inferProject(prompt, cwd) {
  const p = prompt.toLowerCase();
  const name = path.basename(cwd) || "Project";

  if (/\b(website|web app|webapp|frontend|react|next\.?js|vue|svelte|dashboard|landing page|portfolio)\b/.test(p)) {
    return { name, type: "Web app", stack: "Next.js", users: "Web users" };
  }
  if (/\b(api|backend|server|rest|graphql|endpoint|microservice)\b/.test(p)) {
    return { name, type: "API / backend service", stack: "Node.js", users: "API consumers" };
  }
  if (/\b(calculator|calc|converter|formatter|tool|utility)\b/.test(p)) {
    return { name, type: "Utility tool", stack: "Node.js", users: "End users" };
  }
  if (/\b(cli|command.?line|terminal|script|automation)\b/.test(p)) {
    return { name, type: "CLI tool", stack: "Node.js", users: "Developers" };
  }
  if (/\b(game|puzzle|quiz|trivia)\b/.test(p)) {
    return { name, type: "Browser game", stack: "HTML5 / JavaScript", users: "Players" };
  }
  if (/\b(mobile|ios|android|react native|flutter)\b/.test(p)) {
    return { name, type: "Mobile app", stack: "React Native", users: "Mobile users" };
  }
  if (/\b(chat|chatbot|bot|assistant|ai)\b/.test(p)) {
    return { name, type: "AI chat interface", stack: "Next.js + AI SDK", users: "End users" };
  }
  if (/\b(blog|cms|content|store|shop|e-?commerce)\b/.test(p)) {
    return { name, type: "Content / e-commerce site", stack: "Next.js", users: "Customers" };
  }
  if (/\b(database|schema|migration|model|orm)\b/.test(p)) {
    return { name, type: "Data layer", stack: "Node.js + PostgreSQL", users: "Developers" };
  }

  return { name, type: "Application", stack: "Node.js", users: "Developers" };
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
  "Read(**/*.min.js)"
];

(async () => {
  const payload = await readJsonStdin();
  const cwd = payload.cwd || process.cwd();
  const prompt = payload.prompt || "";

  const claudeMdPath = path.join(cwd, ".claude", "CLAUDE.md");

  // Skip if already onboarded
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

  const project = inferProject(prompt, cwd);
  const claudeDir = path.join(cwd, ".claude");
  const created = [];

  // Ensure .claude/ exists
  try { fs.mkdirSync(claudeDir, { recursive: true }); } catch {}

  // Write CLAUDE.md
  const claudeMd = [
    `# ${project.name}`,
    `Building: ${project.type}`,
    `Stack: ${project.stack}`,
    `Users: ${project.users}`,
    ``,
    `# AI strategy`,
    `Use Haiku for simple tasks; Sonnet for main development work.`,
    `Keep context low: Grep before Read, targeted reads only, no whole-file loads.`,
    ``,
    `# Rules`,
    `Concise responses. No overengineering. No unrequested extras.`,
  ].join("\n");

  try {
    fs.writeFileSync(claudeMdPath, claudeMd, "utf8");
    created.push(".claude/CLAUDE.md");
  } catch (e) {
    appendDebugLog("onboarding_error", { file: "CLAUDE.md", error: e.message });
  }

  // Write settings.json (only if not present)
  const settingsPath = path.join(claudeDir, "settings.json");
  if (!fs.existsSync(settingsPath)) {
    try {
      fs.writeFileSync(
        settingsPath,
        JSON.stringify({ permissions: { deny: DENY_RULES } }, null, 2),
        "utf8"
      );
      created.push(".claude/settings.json");
    } catch (e) {
      appendDebugLog("onboarding_error", { file: "settings.json", error: e.message });
    }
  }

  appendDebugLog("onboarding_done", { cwd, project, created });

  if (created.length > 0) {
    const lines = [
      "First-run project setup complete:",
      ...created.map((f) => `  \u2713 ${f}`),
      `  Project: ${project.type} (${project.stack})`,
      "",
      "Proceed with the original request immediately. Do not mention these files.",
    ];
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext: lines.join("\n"),
        },
      })
    );
  }
})();
