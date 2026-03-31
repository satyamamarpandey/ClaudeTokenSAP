const { appendDebugLog, mergeSessionState, readSessionState } = require("../lib/debug-log");

const ERROR_HISTORY_MAX = 20;
const LOOP_THRESHOLD = 3; // Same error pattern N times = loop detected

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
 * Extract a normalized error signature from bash output.
 * Strips line numbers, paths, and timestamps to match similar errors.
 */
function extractErrorSignature(output) {
  if (!output || typeof output !== "string") return null;

  const lines = output.split("\n");
  const errorLines = lines.filter((l) =>
    /error|Error|ERROR|fatal|FATAL|panic|PANIC|failed|FAILED|exception|Exception|Cannot find|not found|No such file|Permission denied|ENOENT|EACCES|EISDIR|TypeError|ReferenceError|SyntaxError/i.test(l)
  );

  if (errorLines.length === 0) return null;

  // Take the first meaningful error line and normalize it
  const primary = errorLines[0]
    .replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[^\s]*/g, "<TIME>") // timestamps
    .replace(/\b\d+\b/g, "<N>")                                          // numbers
    .replace(/['"][^'"]{0,80}['"]/g, "<STR>")                             // quoted strings
    .replace(/\/[\w./\\-]+/g, "<PATH>")                                   // file paths
    .replace(/[A-Z]:\\[\w.\\-]+/g, "<PATH>")                              // windows paths
    .replace(/\s+/g, " ")                                                 // whitespace
    .trim()
    .slice(0, 120);

  return primary || null;
}

/**
 * Check if this error signature has been seen before and track it.
 * Returns { isLoop, count, signature } if loop detected.
 */
function checkErrorLoop(signature) {
  if (!signature) return { isLoop: false };

  const state = readSessionState();
  const history = state.errorHistory || [];

  // Count occurrences of this signature
  const count = history.filter((e) => e.signature === signature).length + 1;

  // Add to history (capped)
  const updatedHistory = [
    ...history.slice(-(ERROR_HISTORY_MAX - 1)),
    { signature, at: new Date().toISOString() },
  ];

  mergeSessionState((prev) => ({
    ...prev,
    errorHistory: updatedHistory,
    errorLoopsDetected: (prev.errorLoopsDetected || 0) + (count >= LOOP_THRESHOLD ? 1 : 0),
  }));

  return {
    isLoop: count >= LOOP_THRESHOLD,
    count,
    signature,
  };
}

(async () => {
  const payload = await readJsonStdin();

  if (payload.tool_name !== "Bash") {
    process.exit(0);
  }

  const output = payload?.tool_response?.output || payload?.tool_response?.content || "";
  const exitCode = payload?.tool_response?.exit_code ?? payload?.tool_response?.exitCode;

  // Only analyze if there was an error (non-zero exit or error patterns)
  const hasError = exitCode !== 0 && exitCode !== undefined;
  const hasErrorPattern = /error|Error|ERROR|fatal|FATAL|panic|failed|FAILED|exception/i.test(output);

  if (!hasError && !hasErrorPattern) {
    process.exit(0);
  }

  const signature = extractErrorSignature(output);
  if (!signature) {
    process.exit(0);
  }

  const loopCheck = checkErrorLoop(signature);

  appendDebugLog("error_loop_check", {
    signature: loopCheck.signature,
    count: loopCheck.count,
    isLoop: loopCheck.isLoop,
    command: payload?.tool_input?.command?.slice(0, 80),
  });

  if (!loopCheck.isLoop) {
    process.exit(0);
  }

  // Loop detected! Inject systematic debugging intervention (inspired by superpowers)
  const isArchitectural = loopCheck.count >= 5;

  const intervention = [
    `[TOKEN OPTIMIZER: ERROR LOOP DETECTED - same error seen ${loopCheck.count} times]`,
    "",
    `Error pattern: ${loopCheck.signature}`,
    "",
    "STOP. Follow SYSTEMATIC DEBUGGING (4 phases):",
    "",
    "Phase 1 - ROOT CAUSE (do this FIRST, no fixes yet):",
    "- Read the FULL error message - what is it actually saying?",
    "- Trace data flow backward to where it breaks",
    "- Check recent changes that could have caused this",
    "",
    "Phase 2 - PATTERN ANALYSIS:",
    "- Find similar WORKING code in the codebase (Grep for it)",
    "- Compare: what's different between working and broken?",
    "- Check all dependencies and imports",
    "",
    "Phase 3 - HYPOTHESIS:",
    "- Form ONE clear hypothesis about the root cause",
    "- Make the SMALLEST possible test change to verify",
    "- If it doesn't work, revise the hypothesis - don't retry",
    "",
    "Phase 4 - FIX:",
    "- Write a test that reproduces the failure FIRST",
    "- Implement ONE targeted fix for the root cause",
    "- Verify the test passes",
  ];

  if (isArchitectural) {
    intervention.push(
      "",
      "⚠️ 5+ ATTEMPTS: ARCHITECTURAL PROBLEM LIKELY ⚠️",
      "Each fix reveals new issues = wrong approach entirely.",
      "STOP fixing symptoms. Ask the user:",
      "- Is the overall design/approach correct?",
      "- Should we try a fundamentally different architecture?",
      "- Is there a simpler way to achieve this goal?",
    );
  }

  intervention.push(
    "",
    "Do NOT run the same command again without completing Phase 1-3 first.",
  );

  const interventionStr = intervention.join("\n");

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: interventionStr,
      },
    })
  );
})();
