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

function normalize(text) {
  return (text || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function extractSignals(text) {
  const buildVerb = hasAny(text, [
    /\bcreate\b/,
    /\bbuild\b/,
    /\bmake\b/,
    /\bgenerate\b/,
    /\bscaffold\b/,
    /\bstart\b/,
    /\bimplement\b/,
    /\bdevelop\b/,
  ]);

  const buildNoun = hasAny(text, [
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

  const buildIntent = buildVerb && buildNoun;

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
    /\breact native\b/,
    /\bcross-platform\b/,
    /\bmobile\b/,
    /\bopencode\b/,
    /\bclaude code\b/,
  ]);

  const frameworkMentioned = hasAny(text, [
    /\breact\b/,
    /\breact native\b/,
    /\bexpo\b/,
    /\bflutter\b/,
    /\bvue\b/,
    /\bnext\b/,
    /\bangular\b/,
    /\bkotlin\b/,
    /\bswift\b/,
    /\belectron\b/,
    /\bvanilla js\b/,
  ]);

  const uiMentioned = hasAny(text, [
    /\bmodern\b/,
    /\bsleek\b/,
    /\bminimal\b/,
    /\bclean\b/,
    /\bdark\b/,
    /\blight\b/,
    /\bios-like\b/,
    /\bmaterial\b/,
    /\bpremium\b/,
    /\bopencode-like\b/,
  ]);

  const featureMentioned = hasAny(text, [
    /\bhistory\b/,
    /\bkeyboard\b/,
    /\boffline\b/,
    /\bmemory\b/,
    /\bscientific\b/,
    /\bunit conversion\b/,
    /\btheme\b/,
    /\bthemes\b/,
    /\bdark mode\b/,
    /\ball features\b/,
    /\ball functions\b/,
    /\badvanced math\b/,
  ]);

  const simplestRequested = hasAny(text, [
    /\bsimple\b/,
    /\bbasic\b/,
    /\bdefault\b/,
    /\bquickest\b/,
    /\bminimal\b/,
  ]);

  const explicitProceedPermission = hasAny(text, [
    /\bchoose your own framework\b/,
    /\bchoose your own\b/,
    /\bbest one\b/,
    /\bpick for me\b/,
    /\byou choose\b/,
    /\bchoose for me\b/,
    /\ball features\b/,
    /\ball functions\b/,
  ]);

  const looksLikeOptionSelection =
    text.length > 0 &&
    text.length < 220 &&
    (text.includes(",") ||
      hasAny(text, [
        /\bweb\b/,
        /\bdesktop\b/,
        /\bmobile\b/,
        /\bcustom\b/,
        /\bmodern\b/,
        /\bminimal\b/,
        /\bdark\b/,
        /\bhistory\b/,
        /\bkeyboard\b/,
        /\bscientific\b/,
        /\bfinancial\b/,
      ]));

  const isClarificationAnswer =
    !buildIntent &&
    (looksLikeOptionSelection || explicitProceedPermission);

  return {
    promptLength: text.length,
    buildIntent,
    platformMentioned,
    frameworkMentioned,
    uiMentioned,
    featureMentioned,
    simplestRequested,
    explicitProceedPermission,
    looksLikeOptionSelection,
    isClarificationAnswer,
  };
}

function computeAmbiguityScore(signals) {
  if (!signals.buildIntent && !signals.isClarificationAnswer) {
    return 0;
  }

  let score = 0;

  if (!signals.platformMentioned) score += 1;
  if (!signals.uiMentioned) score += 1;
  if (!signals.featureMentioned && !signals.simplestRequested) score += 1;

  return score;
}

function decideMode(signals) {
  const ambiguityScore = computeAmbiguityScore(signals);

  let mode = "pass";

  if (signals.buildIntent) {
    if (
      signals.platformMentioned &&
      (signals.featureMentioned || signals.simplestRequested)
    ) {
      mode = "proceed";
    } else if (ambiguityScore >= 2) {
      mode = "clarify";
    } else {
      mode = "proceed";
    }
  }

  if (signals.isClarificationAnswer) {
    mode = "proceed_with_defaults";
  }

  if (signals.explicitProceedPermission) {
    mode = "proceed_with_defaults";
  }

  return {
    mode,
    ambiguityScore,
    shouldUseSmartDefaults:
      signals.isClarificationAnswer || signals.explicitProceedPermission,
  };
}

(async () => {
  const payload = await readJsonStdin();
  const prompt = payload.prompt || "";
  const normalized = normalize(prompt);

  const signals = extractSignals(normalized);
  const decision = decideMode(signals);

  appendDebugLog("prompt_preprocess", {
    cwd: payload.cwd,
    rawPromptLength: prompt.length,
    ...signals,
    ...decision,
  });

  // This hook stays deterministic and low-cost on purpose.
  // It does not block directly. It only records richer telemetry so the
  // UserPromptSubmit model hook can stay simple and robust.
})();