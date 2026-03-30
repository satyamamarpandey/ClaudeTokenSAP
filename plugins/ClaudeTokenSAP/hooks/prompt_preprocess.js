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

function hasAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function summarizePrompt(prompt) {
  const text = (prompt || "").toLowerCase();

  const buildIntent =
    hasAny(text, [
      /\bcreate\b/,
      /\bbuild\b/,
      /\bmake\b/,
      /\bgenerate\b/,
      /\bscaffold\b/,
      /\bstart\b/,
      /\bimplement\b/,
      /\bdevelop\b/,
    ]) &&
    hasAny(text, [
      /\bapp\b/,
      /\bapplication\b/,
      /\bwebsite\b/,
      /\bsite\b/,
      /\bdashboard\b/,
      /\btool\b/,
      /\bplugin\b/,
      /\bextension\b/,
      /\bbot\b/,
      /\bagent\b/,
      /\bcalculator\b/,
    ]);

  const platformMentioned = hasAny(text, [
    /\bweb\b/,
    /\bwebsite\b/,
    /\bhtml\b/,
    /\bcss\b/,
    /\bjavascript\b/,
    /\btypescript\b/,
    /\breact\b/,
    /\bnext\b/,
    /\bandroid\b/,
    /\bios\b/,
    /\bflutter\b/,
    /\bkotlin\b/,
    /\bswift\b/,
    /\bdesktop\b/,
    /\belectron\b/,
    /\bopencode\b/,
    /\bclaude code\b/,
  ]);

  const uiMentioned = hasAny(text, [
    /\bmodern\b/,
    /\bminimal\b/,
    /\bclean\b/,
    /\bdark\b/,
    /\blight\b/,
    /\bios-like\b/,
    /\bmaterial\b/,
    /\bopencode\b/,
    /\bpremium\b/,
  ]);

  const featureMentioned = hasAny(text, [
    /\bhistory\b/,
    /\bkeyboard\b/,
    /\boffline\b/,
    /\bmemory\b/,
    /\bscientific\b/,
    /\bunit conversion\b/,
    /\btheme\b/,
    /\bdecimal\b/,
  ]);

  const simplestRequested = hasAny(text, [
    /\bsimple\b/,
    /\bbasic\b/,
    /\bdefault\b/,
    /\bquickest\b/,
    /\bminimal\b/,
  ]);

  return {
    promptLength: prompt ? prompt.length : 0,
    buildIntent,
    platformMentioned,
    uiMentioned,
    featureMentioned,
    simplestRequested,
  };
}

(async () => {
  const payload = await readJsonStdin();
  const prompt = payload.prompt || "";
  const summary = summarizePrompt(prompt);

  appendDebugLog("prompt_preprocess", {
    ...summary,
    cwd: payload.cwd,
  });

  // This hook is intentionally log-only.
  // The actual clarification gate is handled by the UserPromptSubmit agent hook.
})();