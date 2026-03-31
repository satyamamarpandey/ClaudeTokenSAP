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

  // Only fire if meaningful work was done this session
  if (totalWrites === 0 && promptCount < 3) {
    process.exit(0);
  }

  appendDebugLog("verification_guard", { totalWrites, promptCount });

  const lines = [
    "VERIFICATION BEFORE COMPLETION (Token Optimizer):",
    "",
    "Before claiming this work is done, confirm:",
    "1. If you modified code: did you run the relevant test/build command and see it pass?",
    "2. If you fixed a bug: did you reproduce the original failure and verify it's gone?",
    "3. If you created files: do they exist and contain the expected content?",
    "",
    "Evidence before claims, always. Do NOT use words like 'should work' or 'probably fixed'.",
    "If you haven't verified, run the verification command NOW before responding.",
    "",
    "AFTER VERIFICATION - ANNOUNCE COMPLETION:",
    "Once verified, tell the user clearly: 'Done. [1-line summary of what was built/fixed/changed]. Ready to test.'",
    "Then STOP. Do not continue with unrelated tasks or loop back to check more things.",
  ];

  // Add session-specific reminders
  const archSignals = state.archSignals || {};
  if (archSignals.depsModified) {
    lines.push("", "Dependencies were modified this session - verify install/lock file is valid.");
  }
  if (archSignals.dbModified) {
    lines.push("", "DB/schema files were modified - verify migrations run cleanly.");
  }

  process.stdout.write(
    JSON.stringify({
      systemMessage: lines.join("\n"),
    })
  );
})();
