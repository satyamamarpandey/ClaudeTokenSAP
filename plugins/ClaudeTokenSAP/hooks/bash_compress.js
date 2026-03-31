const { appendDebugLog, mergeSessionState } = require("../lib/debug-log");

const HEAD_LINES = 20;
const TAIL_LINES = 20;
const MIN_LINES_TO_COMPRESS = 60;

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

function isErrorOrWarning(line) {
  return /error|warning|warn|fatal|exception|traceback|failed|fail\b|errno|panic|abort/i.test(line);
}

function compressOutput(raw) {
  const lines = raw.split("\n");
  if (lines.length <= MIN_LINES_TO_COMPRESS) return null;

  const head = lines.slice(0, HEAD_LINES);
  const tail = lines.slice(-TAIL_LINES);

  // Extract error/warning lines not already in head or tail
  const headSet = new Set(head);
  const tailSet = new Set(tail);
  const errorLines = lines
    .slice(HEAD_LINES, lines.length - TAIL_LINES)
    .filter((l) => isErrorOrWarning(l) && !headSet.has(l) && !tailSet.has(l));

  const skipped = lines.length - HEAD_LINES - TAIL_LINES;
  const parts = [
    `[first ${HEAD_LINES} lines]`,
    ...head,
  ];

  if (errorLines.length > 0) {
    parts.push(`[errors/warnings from middle ${skipped} lines]`);
    parts.push(...errorLines.slice(0, 30)); // cap error lines at 30
  } else {
    parts.push(`[${skipped} lines omitted — no errors/warnings detected]`);
  }

  parts.push(`[last ${TAIL_LINES} lines]`);
  parts.push(...tail);

  return {
    compressed: parts.join("\n"),
    originalLines: lines.length,
    compressedLines: parts.length,
  };
}

(async () => {
  const payload = await readJsonStdin();

  const output = payload?.tool_response?.output || payload?.tool_response?.content || "";
  if (!output || typeof output !== "string") {
    process.exit(0);
  }

  const result = compressOutput(output);
  if (!result) {
    // Output was short enough — pass through
    process.exit(0);
  }

  appendDebugLog("bash_compress", {
    originalLines: result.originalLines,
    compressedLines: result.compressedLines,
    command: payload?.tool_input?.command?.slice(0, 80),
  });

  mergeSessionState((prev) => ({
    ...prev,
    bashCompressCount: (prev.bashCompressCount || 0) + 1,
    lastCompressedBash: {
      command: payload?.tool_input?.command?.slice(0, 120),
      originalLines: result.originalLines,
      compressedLines: result.compressedLines,
      at: new Date().toISOString(),
    },
  }));

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: `[Bash output compressed: ${result.originalLines} → ${result.compressedLines} lines]\n${result.compressed}`,
      },
    })
  );
})();
