const { appendDebugLog, readSessionState } = require("../lib/debug-log");

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

/**
 * Stop hook: Verification Before Completion
 * Inspired by superpowers/verification-before-completion.
 * Prevents false "done" claims that waste tokens on rework.
 */
(async () => {
  const payload = await readJsonStdin();
  const state = readSessionState();

  const totalWrites = state.totalWrites || 0;
  const promptCount = state.promptCount || 0;

  // Skip during onboarding (steps 1-5) or if no meaningful work done
  const onboardingStep = state.onboardingStep || 0;
  if (onboardingStep > 0 && onboardingStep < 6) process.exit(0);
  if (totalWrites === 0 && promptCount < 3) process.exit(0);

  appendDebugLog("verification_guard", { totalWrites, promptCount });

  const archSignals = state.archSignals || {};
  const extras = [];
  if (archSignals.depsModified) extras.push("verify install/lock file");
  if (archSignals.dbModified) extras.push("verify migrations");

  const msg = [
    `[Token Optimizer] Verify before done: run tests/build, check files exist${extras.length ? ", " + extras.join(", ") : ""}. Then say: 'Done. [summary]. Ready to test.'`,
  ].join("");

  process.stdout.write(
    JSON.stringify({
      systemMessage: msg,
    })
  );
})();
