const fs = require("fs");
const path = require("path");
const {
  appendDebugLog,
  mergeSessionState,
} = require("../lib/debug-log");

const MAX_ANALYZE_BYTES = 250 * 1024;

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
    payload?.tool_response?.filePath;

  if (!fromInput) return null;
  if (path.isAbsolute(fromInput)) return fromInput;
  return path.resolve(payload.cwd || process.cwd(), fromInput);
}

function readLimitedFile(filePath) {
  const stat = fs.statSync(filePath);
  const size = Math.min(stat.size, MAX_ANALYZE_BYTES);
  const fd = fs.openSync(filePath, "r");
  const buffer = Buffer.alloc(size);
  const bytesRead = fs.readSync(fd, buffer, 0, size, 0);
  fs.closeSync(fd);
  return buffer.toString("utf8", 0, bytesRead);
}

function summarizeLog(text, filePath) {
  const lines = text.split(/\r?\n/);
  const counts = { ERROR: 0, WARN: 0, INFO: 0, DEBUG: 0, FATAL: 0 };
  const repeated = new Map();
  const highSignal = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const upper = line.toUpperCase();
    for (const key of Object.keys(counts)) {
      if (upper.includes(key)) counts[key] += 1;
    }

    repeated.set(line, (repeated.get(line) || 0) + 1);

    if (/ERROR|WARN|FATAL|EXCEPTION|TIMEOUT|FAILED|TRACEBACK|STACK/i.test(line) && highSignal.length < 8) {
      highSignal.push(line);
    }
  }

  const topRepeated = [...repeated.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([line, count]) => `- ${count}x: ${line.slice(0, 140)}`);

  return [
    `Token Optimizer summary for ${path.basename(filePath)}:`,
    `- approx lines analyzed: ${lines.length}`,
    `- counts: ERROR=${counts.ERROR}, WARN=${counts.WARN}, INFO=${counts.INFO}, DEBUG=${counts.DEBUG}, FATAL=${counts.FATAL}`,
    topRepeated.length ? "- top repeated lines:\n" + topRepeated.join("\n") : "- top repeated lines: none",
    highSignal.length ? "- high-signal lines:\n" + highSignal.map((line) => `- ${line.slice(0, 180)}`).join("\n") : "- high-signal lines: none",
    "- Reason over these patterns instead of the repeated low-signal lines. Request exact ranges only if needed.",
  ].join("\n");
}

function inferShape(value, depth = 0) {
  if (depth > 2) return typeof value;
  if (Array.isArray(value)) {
    if (value.length === 0) return "array<empty>";
    return `array<${inferShape(value[0], depth + 1)}>`;
  }
  if (value && typeof value === "object") {
    return {
      type: "object",
      keys: Object.keys(value).slice(0, 8),
    };
  }
  return typeof value;
}

function summarizeJson(text, filePath) {
  try {
    const parsed = JSON.parse(text);
    const topKeys =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? Object.keys(parsed).slice(0, 20)
        : [];

    const details = [];
    if (Array.isArray(parsed)) {
      details.push(`- root type: array (${parsed.length} items in analyzed slice)`);
      if (parsed.length > 0) {
        details.push(`- sample item shape: ${JSON.stringify(inferShape(parsed[0]))}`);
      }
    } else if (parsed && typeof parsed === "object") {
      details.push("- root type: object");
      details.push(`- top-level keys: ${topKeys.join(", ") || "(none)"}`);

      for (const key of topKeys.slice(0, 8)) {
        const value = parsed[key];
        if (Array.isArray(value)) {
          details.push(`- ${key}: array (${value.length} items)`);
        } else if (value && typeof value === "object") {
          details.push(`- ${key}: object with keys ${Object.keys(value).slice(0, 8).join(", ")}`);
        } else {
          details.push(`- ${key}: ${typeof value}`);
        }
      }
    } else {
      details.push(`- root type: ${typeof parsed}`);
    }

    return [
      `Token Optimizer summary for ${path.basename(filePath)}:`,
      ...details,
      "- Prefer targeted key or section reads for exact values instead of re-reading the full JSON.",
    ].join("\n");
  } catch {
    return [
      `Token Optimizer summary for ${path.basename(filePath)}:`,
      "- JSON parse failed in analyzed slice.",
      "- Treat this as structured text and read only the relevant ranges or keys.",
    ].join("\n");
  }
}

function summarizeCsv(text, filePath) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const header = lines[0] || "";
  const columns = header.split(",").map((col) => col.trim()).filter(Boolean);
  return [
    `Token Optimizer summary for ${path.basename(filePath)}:`,
    `- approx rows analyzed: ${Math.max(lines.length - 1, 0)}`,
    `- columns: ${columns.join(", ") || "(none detected)"}`,
    "- Prefer focused column or sample inspection instead of loading the full table.",
  ].join("\n");
}

function detectGeneratedOrMinified(text) {
  const newlineCount = (text.match(/\n/g) || []).length;
  return text.length > 2000 && newlineCount <= 2;
}

function summarizeSourceCode(text, filePath, ext) {
  const lines = text.split(/\r?\n/);
  const imports = new Set();
  const exportsFound = new Set();
  const functions = new Set();
  const classes = new Set();
  const todos = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (ext === ".py") {
      if (/^(from\s+\S+\s+import\s+.+|import\s+.+)$/.test(line)) imports.add(line);
      const defMatch = line.match(/^def\s+([A-Za-z_][A-Za-z0-9_]*)/);
      if (defMatch) functions.add(defMatch[1]);
      const classMatch = line.match(/^class\s+([A-Za-z_][A-Za-z0-9_]*)/);
      if (classMatch) classes.add(classMatch[1]);
    } else if (ext === ".html") {
      const tagMatch = line.match(/^<([a-zA-Z0-9-]+)/);
      if (tagMatch) classes.add(`<${tagMatch[1]}>`);
    } else if (ext === ".css" || ext === ".scss") {
      if (/{\s*$/.test(line) && !line.startsWith("@")) functions.add(line.replace(/\s*{\s*$/, ""));
    } else {
      if (/^import\s+.+from\s+['"].+['"]/.test(line) || /^import\s+['"].+['"]/.test(line)) imports.add(line);
      if (/^export\s+/.test(line)) exportsFound.add(line.slice(0, 120));
      const fnMatch =
        line.match(/^(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)/) ||
        line.match(/^(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s*)?\(/) ||
        line.match(/^([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s*)?\(/);
      if (fnMatch) functions.add(fnMatch[1]);
      const classMatch = line.match(/^class\s+([A-Za-z_$][A-Za-z0-9_$]*)/);
      if (classMatch) classes.add(classMatch[1]);
    }

    if (/TODO|FIXME|HACK|BUG/i.test(line) && todos.length < 5) {
      todos.push(line.slice(0, 180));
    }
  }

  const generated = detectGeneratedOrMinified(text);
  const importList = [...imports].slice(0, 6);
  const exportList = [...exportsFound].slice(0, 6);
  const functionList = [...functions].slice(0, 10);
  const classList = [...classes].slice(0, 10);

  return [
    `Token Optimizer source summary for ${path.basename(filePath)}:`,
    `- approx lines analyzed: ${lines.length}`,
    generated ? "- looks generated or minified: yes" : "- looks generated or minified: no",
    importList.length ? "- imports:\n" + importList.map((v) => `- ${v}`).join("\n") : "- imports: none detected",
    exportList.length ? "- exports:\n" + exportList.map((v) => `- ${v}`).join("\n") : "- exports: none detected",
    functionList.length ? "- functions or selectors:\n" + functionList.map((v) => `- ${v}`).join("\n") : "- functions or selectors: none detected",
    classList.length ? "- classes or top-level tags:\n" + classList.map((v) => `- ${v}`).join("\n") : "- classes or top-level tags: none detected",
    todos.length ? "- TODO or FIXME markers:\n" + todos.map((v) => `- ${v}`).join("\n") : "- TODO or FIXME markers: none detected",
    "- Prefer targeted symbol or range reads if exact raw code is needed.",
  ].join("\n");
}

function summarizeGeneric(text, filePath) {
  const lines = text.split(/\r?\n/);
  return [
    `Token Optimizer summary for ${path.basename(filePath)}:`,
    `- approx lines analyzed: ${lines.length}`,
    `- approx chars analyzed: ${text.length}`,
    "- If this file is repetitive or generated, prefer focused reads over full dumps.",
  ].join("\n");
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

  const stat = fs.statSync(filePath);
  const ext = path.extname(filePath).toLowerCase();

  let text;
  try {
    text = readLimitedFile(filePath);
  } catch (error) {
    appendDebugLog("file_read_compress_error", {
      filePath,
      error: String(error),
    });
    process.exit(0);
  }

  let summary;
  let summaryType;
  if ([".log", ".txt"].includes(ext)) {
    summaryType = "log";
    summary = summarizeLog(text, filePath);
  } else if ([".json", ".jsonl", ".ndjson"].includes(ext)) {
    summaryType = "json";
    summary = summarizeJson(text, filePath);
  } else if ([".csv", ".tsv"].includes(ext)) {
    summaryType = "csv";
    summary = summarizeCsv(text, filePath);
  } else if (SOURCE_CODE_EXTENSIONS.has(ext)) {
    summaryType = "source";
    summary = summarizeSourceCode(text, filePath, ext);
  } else {
    summaryType = "generic";
    summary = summarizeGeneric(text, filePath);
  }

  appendDebugLog("file_read_compress", {
    filePath,
    ext,
    sizeBytes: stat.size,
    analyzedChars: text.length,
    summaryType,
  });

  mergeSessionState((prev) => {
    const existing = prev.recentlyReadFiles || [];
    const nextRead = {
      filePath,
      ext,
      sizeBytes: stat.size,
      summaryType,
      at: new Date().toISOString(),
    };

    return {
      ...prev,
      recentlyReadFiles: [nextRead, ...existing].slice(0, 8),
      lastReadFile: nextRead,
    };
  });

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: summary,
      },
    })
  );
})();
