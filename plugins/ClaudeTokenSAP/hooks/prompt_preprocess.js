const { appendDebugLog } = require("../lib/debug-log");

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
  const prompt = payload.prompt || "";

  appendDebugLog("prompt_preprocess", {
    cwd: payload.cwd,
    rawPromptLength: prompt.length,
  });

  // For very large prompts (pasted content, logs, etc.) remind Claude to
  // work incrementally rather than loading even more context.
  if (prompt.length > 3000) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext: `- Large prompt detected (${Math.round(prompt.length / 1000)}KB). Work incrementally: use Grep/Glob before Read, read only relevant ranges, and avoid re-echoing the pasted content back.`,
        },
      })
    );
  }
  // Normal prompts: exit silently — no output, no token cost.
})();
