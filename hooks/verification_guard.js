const { appendDebugLog, readSessionState } = require("../lib/debug-log");
const { estimateTranscriptTokens } = require("../lib/transcript-tracker");

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

  // Token count from transcript
  const transcriptPath = payload.transcript_path || payload.transcriptPath || null;
  const tokens = estimateTranscriptTokens(transcriptPath);
  const tokenLine = tokens
    ? `~${tokens.inputTokens.toLocaleString()} in / ~${tokens.outputTokens.toLocaleString()} out / ~${tokens.totalTokens.toLocaleString()} total`
    : null;

  const msg = tokenLine
    ? `[Token Optimizer] Done. Test it. Ready to test. | Tokens: ${tokenLine}`
    : `[Token Optimizer] Done. Test it. Ready to test.`;
  process.stderr.write(msg + "\n");
  process.stdout.write(JSON.stringify({ systemMessage: msg }));
})();
