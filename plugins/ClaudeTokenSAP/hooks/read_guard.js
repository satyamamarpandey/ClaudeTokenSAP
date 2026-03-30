const fs = require("fs");
const path = require("path");
const { appendDebugLog } = require("../lib/debug-log");

const LARGE_FILE_BYTES = 120 * 1024;
const VERY_LARGE_FILE_BYTES = 400 * 1024;

const NOISY_EXTENSIONS = new Set([
  ".json",
  ".jsonl",
  ".log",
  ".txt",
  ".csv",
  ".tsv",
  ".ndjson",
  ".lock",
  ".map",
]);

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

function resolveFilePath(payload) {
  const fromInput =
    payload?.tool_input?.file_path ||
    payload?.tool_input?.path ||
    payload?.tool_input?.filename;

  if (!fromInput) return null;
  if (path.isAbsolute(fromInput)) return fromInput;
  return path.resolve(payload.cwd || process.cwd(), fromInput);
}

function hasTargetedRead(toolInput = {}) {
  const targetedKeys = [
    "offset",
    "limit",
    "start_line",
    "end_line",
    "startLine",
    "endLine",
    "lines",
    "range",
    "from",
    "to",
  ];

  return targetedKeys.some((key) => toolInput[key] !== undefined && toolInput[key] !== null);
}

function isLikelyMinified(filePath) {
  try {
    const fd = fs.openSync(filePath, "r");
    const buffer = Buffer.alloc(4000);
    const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
    fs.closeSync(fd);

    const head = buffer.toString("utf8", 0, bytesRead);
    const newlineCount = (head.match(/\n/g) || []).length;
    return bytesRead > 2000 && newlineCount <= 2;
  } catch {
    return false;
  }
}

function buildGuidance(filePath, sizeBytes, ext) {
  const kb = Math.round(sizeBytes / 1024);
  // Normalize the extension into a human‑friendly label. Remove the leading dot when present.
  const label = ext ? ext.replace(/^\./, "") : "text";

  let strategy = [
    // Provide a clear, friendly first line. Use lower‑case file type names and avoid technical jargon.
    `Token Optimizer blocked a full read on a large ${label} file (${kb} KB) to protect your Claude context.`,
    "",
    "Use a narrower strategy instead:",
  ];

  if (ext === ".json" || ext === ".jsonl" || ext === ".ndjson") {
    strategy.push(
      "1. Inspect top-level structure first (keys, object shape, array sizes).",
      "2. Read only the relevant keys or sections.",
      "3. Summarize repeated records instead of dumping the entire file."
    );
  } else if (ext === ".log" || ext === ".txt") {
    strategy.push(
      "1. Search for ERROR, WARN, FATAL, exception, timeout, or stack traces first.",
      "2. Read only the surrounding lines for the real failures.",
      "3. Collapse repetitive INFO/debug noise into counts or patterns."
    );
  } else if (ext === ".csv" || ext === ".tsv") {
    strategy.push(
      "1. Inspect headers and row counts first.",
      "2. Read only sample rows or the relevant columns.",
      "3. Summarize repeated/null-heavy patterns instead of loading everything."
    );
  } else {
    strategy.push(
      "1. Inspect file size, structure, and high-signal sections first.",
      "2. Read only the relevant ranges.",
      "3. Avoid pulling the full file unless exact raw content is required."
    );
  }

  strategy.push(
    "",
    `File: ${filePath}`
  );

  return strategy.join("\n");
}

(async () => {
  const payload = await readJsonStdin();

  if (payload.tool_name !== "Read") {
    process.exit(0);
  }

  const filePath = resolveFilePath(payload);
  if (!filePath || !fs.existsSync(filePath)) {
    process.exit(0);
  }

  if (hasTargetedRead(payload.tool_input)) {
    appendDebugLog("read_guard_allow_targeted", { filePath });
    process.exit(0);
  }

  const stat = fs.statSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const noisyType = NOISY_EXTENSIONS.has(ext) || isLikelyMinified(filePath);

  const shouldBlock =
    (noisyType && stat.size >= LARGE_FILE_BYTES) ||
    stat.size >= VERY_LARGE_FILE_BYTES;

  appendDebugLog("read_guard_check", {
    filePath,
    ext,
    sizeBytes: stat.size,
    noisyType,
    shouldBlock,
  });

  if (!shouldBlock) {
    process.exit(0);
  }

  process.stderr.write(buildGuidance(filePath, stat.size, ext));
  process.exit(2);
})();