const {
  appendDebugLog,
  mergeSessionState,
} = require("../lib/debug-log");

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

function uniqueTrimmed(values) {
  return [...new Set(values.filter(Boolean).map((v) => String(v).trim()).filter(Boolean))];
}

function detectPlatform(text) {
  if (/\breact native\b|\bflutter\b|\bcross[- ]platform\b/.test(text)) return "cross-platform mobile";
  if (/\bmobile\b/.test(text)) return "mobile";
  if (/\bandroid\b/.test(text)) return "android";
  if (/\bios\b|\biphone\b|\bipad\b/.test(text)) return "ios";
  if (/\bdesktop\b|\belectron\b/.test(text)) return "desktop";
  if (/\bweb\b|\bwebsite\b|\bhtml\b|\bcss\b|\bjavascript\b|\breact\b|\bnext\b|\bvue\b/.test(text)) return "web";
  if (/\bopencode\b/.test(text)) return "opencode";
  return null;
}

function detectFramework(text) {
  if (/\bflutter\b/.test(text)) return "flutter";
  if (/\breact native\b/.test(text)) return "react-native";
  if (/\breact\b/.test(text)) return "react";
  if (/\bvue\b/.test(text)) return "vue";
  if (/\bnext\b/.test(text)) return "nextjs";
  if (/\bswift\b/.test(text)) return "swift";
  if (/\bkotlin\b/.test(text)) return "kotlin";
  if (/\bvanilla\b/.test(text)) return "vanilla";
  return null;
}

function detectUi(text) {
  const uiMatches = [];
  if (/\bmodern\b/.test(text)) uiMatches.push("modern");
  if (/\bminimal\b/.test(text)) uiMatches.push("minimal");
  if (/\bclean\b/.test(text)) uiMatches.push("clean");
  if (/\bdark\b/.test(text)) uiMatches.push("dark");
  if (/\blight\b/.test(text)) uiMatches.push("light");
  if (/\bios-like\b/.test(text)) uiMatches.push("ios-like");
  if (/\bmaterial\b/.test(text)) uiMatches.push("material");
  if (/\bopencode\b/.test(text)) uiMatches.push("opencode-like");
  if (/\bpremium\b/.test(text)) uiMatches.push("premium");
  return uniqueTrimmed(uiMatches);
}

function detectFeatures(text) {
  const features = [];
  if (/\bhistory\b/.test(text)) features.push("history");
  if (/\bkeyboard\b/.test(text)) features.push("keyboard support");
  if (/\boffline\b/.test(text)) features.push("offline");
  if (/\btheme\b|\bthemes\b/.test(text)) features.push("themes");
  if (/\bdecimal\b/.test(text)) features.push("decimal support");
  if (/\bscientific\b/.test(text)) features.push("scientific");
  if (/\bfinancial\b|\bfinance\b/.test(text)) features.push("financial");
  if (/\bunit conversion\b|\bunit converter\b/.test(text)) features.push("unit conversion");
  return uniqueTrimmed(features);
}

function summarizePrompt(prompt) {
  const original = prompt || "";
  const text = original.toLowerCase().trim();

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

  const platform = detectPlatform(text);
  const framework = detectFramework(text);
  const ui = detectUi(text);
  const features = detectFeatures(text);

  const platformMentioned = Boolean(platform);
  const uiMentioned = ui.length > 0;
  const featureMentioned = features.length > 0 || /\ball features\b|\ball functions\b/.test(text);

  const simplestRequested = hasAny(text, [
    /\bsimple\b/,
    /\bbasic\b/,
    /\bdefault\b/,
    /\bquickest\b/,
    /\bminimal\b/,
  ]);

  const chooseDefaultsPermission = hasAny(text, [
    /\bchoose your own framework\b/,
    /\buse the best one\b/,
    /\bbest one\b/,
    /\byour choice\b/,
    /\byour own framework\b/,
  ]);

  const allFeaturesRequested = hasAny(text, [
    /\ball features\b/,
    /\ball functions\b/,
    /\beverything\b/,
  ]);

  const commaSegments = original
    .split(/[,;\n]/)
    .map((part) => part.trim())
    .filter(Boolean);

  const looksLikeOptionAnswer =
    original.length <= 220 &&
    (commaSegments.length >= 2 ||
      hasAny(text, [
        /\bweb\b/,
        /\bmobile\b/,
        /\bdesktop\b/,
        /\bandroid\b/,
        /\bios\b/,
        /\breact\b/,
        /\bflutter\b/,
        /\bvanilla\b/,
        /\bmodern\b/,
        /\bdark\b/,
        /\bhistory\b/,
      ]));

  const clarificationAnswer =
    !buildIntent &&
    (looksLikeOptionAnswer || chooseDefaultsPermission || allFeaturesRequested);

  const providedSignalCount = [
    platformMentioned,
    Boolean(framework),
    uiMentioned,
    featureMentioned,
    simplestRequested,
    chooseDefaultsPermission,
    allFeaturesRequested,
  ].filter(Boolean).length;

  const ambiguityScore =
    (platformMentioned ? 0 : 2) +
    (framework || chooseDefaultsPermission ? 0 : 1) +
    (uiMentioned ? 0 : 1) +
    (featureMentioned || allFeaturesRequested ? 0 : 1);

  const shouldUseSmartDefaults =
    clarificationAnswer &&
    (chooseDefaultsPermission || allFeaturesRequested || providedSignalCount >= 2);

  return {
    promptLength: original.length,
    buildIntent,
    platformMentioned,
    platform,
    framework,
    uiMentioned,
    ui,
    featureMentioned,
    features,
    simplestRequested,
    chooseDefaultsPermission,
    allFeaturesRequested,
    clarificationAnswer,
    providedSignalCount,
    ambiguityScore,
    shouldUseSmartDefaults,
    promptExcerpt: original.slice(0, 240),
  };
}

(async () => {
  const payload = await readJsonStdin();
  const prompt = payload.prompt || payload.user_prompt || "";
  const summary = summarizePrompt(prompt);

  appendDebugLog("prompt_preprocess", {
    ...summary,
    cwd: payload.cwd,
  });

  mergeSessionState((prev) => {
    const priorAssumptions = prev.assumptions || {};
    const nextAssumptions = {
      ...priorAssumptions,
      ...(summary.platform ? { platform: summary.platform } : {}),
      ...(summary.framework ? { framework: summary.framework } : {}),
      ...(summary.ui.length ? { ui: summary.ui } : {}),
      ...(summary.features.length ? { features: summary.features } : {}),
      ...(summary.chooseDefaultsPermission ? { frameworkSelection: "plugin-may-choose-default" } : {}),
      ...(summary.allFeaturesRequested ? { featureScope: "broad" } : {}),
    };

    return {
      ...prev,
      cwd: payload.cwd || prev.cwd,
      currentTask:
        summary.buildIntent || summary.clarificationAnswer
          ? prompt.slice(0, 240)
          : prev.currentTask,
      lastPromptAnalysis: {
        ...summary,
        at: new Date().toISOString(),
      },
      assumptions: nextAssumptions,
      clarificationRounds:
        summary.clarificationAnswer
          ? Math.max(prev.clarificationRounds || 0, 1)
          : prev.clarificationRounds || 0,
    };
  });

  let additionalContext = "";
  if (summary.clarificationAnswer && summary.shouldUseSmartDefaults) {
    additionalContext = [
      "Signal from Token Optimizer:",
      "- The current user message looks like an answer to an earlier clarification round.",
      "- Do not ask a second full clarification round.",
      "- Proceed with smart defaults for any remaining minor gaps.",
      "- Treat phrases like 'choose your own framework' or 'best one' as permission to pick a sensible default.",
      "- Treat phrases like 'all features' or 'all functions' as permission to include a broad first version.",
    ].join("\n");
  } else if (summary.buildIntent) {
    additionalContext = [
      "Signal from Token Optimizer:",
      "- This looks like a fresh build request.",
      "- Ask at most one clarification round and only for missing categories.",
      "- If the user later replies with short options or comma-separated choices, treat that as a clarification answer and continue with defaults.",
    ].join("\n");
  }

  if (additionalContext) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext,
        },
      })
    );
  }
})();
