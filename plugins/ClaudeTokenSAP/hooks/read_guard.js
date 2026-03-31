const fs = require("fs");
const path = require("path");
const {
  appendDebugLog,
  mergeSessionState,
} = require("../lib/debug-log");

const LARGE_FILE_BYTES = 120 * 1024;
const VERY_LARGE_FILE_BYTES = 400 * 1024;
const LARGE_SOURCE_FILE_BYTES = 300 * 1024;
const LARGE_LOCK_FILE_BYTES = 60 * 1024;

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
  ".min.js",
  ".min.css",
]);

const SOURCE_CODE_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".py",
  ".kt",
  ".swift",
  ".java",
  ".go",
  ".rs",
  ".rb",
  ".php",
  ".c",
  ".cpp",
  ".cs",
  ".html",
  ".css",
  ".scss",
]);

const NOISY_DIRS = [
  "node_modules",
  "dist",
  "build",
  ".next",
  "coverage",
  ".turbo",
  "vendor",
  "out",
];

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
    "pattern",
    "grep",
    "query",
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

function isInNoisyDir(filePath) {
  const normalized = filePath.split(path.sep).map((part) => part.toLowerCase());
  return NOISY_DIRS.some((dir) => normalized.includes(dir.toLowerCase()));
}

function isLockFile(filePath) {
  const lower = path.basename(filePath).toLowerCase();
  return [
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "bun.lockb",
    "cargo.lock",
  ].includes(lower);
}

function buildGuidance(filePath, sizeBytes, ext, mode = "noisy") {
  const kb = Math.round(sizeBytes / 1024);
  const label = ext ? ext.replace(/^\./, "") : "text";

  const strategy = [
    `Token Optimizer blocked a full read on a large ${label} file (${kb} KB) to protect your Claude context.`,
    "",
    "Use a narrower strategy instead:",
  ];

  if (mode === "source") {
    strategy.push(
      "1. Inspect imports, exports, functions, classes, or routes first.",
      "2. Read only the symbol, range, or section you actually need.",
      "3. Avoid dumping the whole file unless exact raw code is necessary."
    );
  } else if (ext === ".json" || ext === ".jsonl" || ext === ".ndjson") {
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
      "3. Summarize repeated or null-heavy patterns instead of loading everything."
    );
  } else {
    strategy.push(
      "1. Inspect file size, structure, and high-signal sections first.",
      "2. Read only the relevant ranges.",
      "3. Avoid pulling the full file unless exact raw content is required."
    );
  }

  strategy.push("", `File: ${filePath}`);
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
  const noisyType = NOISY_EXTENSIONS.has(ext) || isLikelyMinified(filePath) || isInNoisyDir(filePath);
  const sourceCodeType = SOURCE_CODE_EXTENSIONS.has(ext);
  const lockFile = isLockFile(filePath);

  const shouldBlockNoisy =
    (lockFile && stat.size >= LARGE_LOCK_FILE_BYTES) ||
    (noisyType && stat.size >= LARGE_FILE_BYTES) ||
    stat.size >= VERY_LARGE_FILE_BYTES;

  const shouldBlockSource =
    sourceCodeType &&
    (stat.size >= LARGE_SOURCE_FILE_BYTES || isLikelyMinified(filePath) || isInNoisyDir(filePath));

  const shouldBlock = shouldBlockNoisy || shouldBlockSource;
  const mode = shouldBlockSource ? "source" : "noisy";

  appendDebugLog("read_guard_check", {
    filePath,
    ext,
    sizeBytes: stat.size,
    noisyType,
    sourceCodeType,
    lockFile,
    shouldBlock,
    mode,
  });

  if (!shouldBlock) {
    process.exit(0);
  }

  mergeSessionState((prev) => ({
    ...prev,
    blockedReads: (prev.blockedReads || 0) + 1,
    lastBlockedFile: {
      filePath,
      ext,
      sizeBytes: stat.size,
      at: new Date().toISOString(),
      mode,
    },
  }));

  process.stderr.write(buildGuidance(filePath, stat.size, ext, mode));
  process.exit(2);
})();
