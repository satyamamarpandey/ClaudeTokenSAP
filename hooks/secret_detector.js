const { appendDebugLog } = require("../lib/debug-log");

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

const SECRET_PATTERNS = [
  { label: "env var assignment", re: /\b[A-Z_]{4,}(?:KEY|SECRET|TOKEN|PASSWORD|PASS|PWD|AUTH|CREDENTIAL)\s*=\s*\S{6,}/i },
  { label: "OpenAI key",         re: /sk-[a-zA-Z0-9]{20,}/ },
  { label: "GitHub token",       re: /gh[pousr]_[a-zA-Z0-9]{36}/ },
  { label: "AWS key",            re: /AKIA[0-9A-Z]{16}/ },
  { label: "private key block",  re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { label: "Stripe key",         re: /sk_(?:live|test)_[a-zA-Z0-9]{24,}/ },
  { label: "inline api key",     re: /["'](?:api[_-]?key|apikey|access[_-]?token)["']\s*:\s*["'][a-zA-Z0-9\-_.]{8,}["']/i },
];

(async () => {
  const payload = await readJsonStdin();
  const prompt = (payload.prompt || "").slice(0, 8000);

  const hits = SECRET_PATTERNS.filter(({ re }) => re.test(prompt));
  if (hits.length === 0) process.exit(0);

  const labels = hits.map((h) => h.label).join(", ");
  appendDebugLog("secret_detector_hit", { labels, promptLen: prompt.length });

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: `⚠️ [Token Optimizer] Possible secrets in your prompt (${labels}). Never paste API keys or tokens — use env vars instead. Proceeding, but do NOT log, echo, or repeat these values.`,
      },
    })
  );
})();
