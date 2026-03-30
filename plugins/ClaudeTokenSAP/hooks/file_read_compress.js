const fs = require("fs");
const path = require("path");
const { appendDebugLog } = require("../lib/debug-log");

const MAX_ANALYZE_BYTES = 250 * 1024;

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

    if (
      /ERROR|WARN|FATAL|EXCEPTION|TIMEOUT|FAILED|TRACEBACK|STACK/i.test(line) &&
      highSignal.length < 8
    ) {
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
    "- Reason over these patterns instead of the repeated low-signal lines. Request exact ranges only if needed."
  ].join("\n");
}

function inferShape(value, depth = 0) {
  if (depth > 2) return typeof value;
  if (Array.isArray(value)) {
    if (value.length === 0) return "array<empty>";
    return `array<${inferShape(value[0], depth + 1)}>`;
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value).slice(0, 8);
    return {
      type: "object",
      keys,
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

    let details = [];
    if (Array.isArray(parsed)) {
      details.push(`- root type: array (${parsed.length} items in analyzed slice)`);
      if (parsed.length > 0) {
        details.push(`- sample item shape: ${JSON.stringify(inferShape(parsed[0]))}`);
      }
    } else if (parsed && typeof parsed === "object") {
      details.push(`- root type: object`);
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
      "- Prefer targeted key/section reads for exact values instead of re-reading the full JSON."
    ].join("\n");
  } catch {
    return [
      `Token Optimizer summary for ${path.basename(filePath)}:`,
      "- JSON parse failed in analyzed slice.",
      "- Treat this as structured text and read only the relevant ranges or keys."
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
    "- Prefer focused column/sample inspection instead of loading the full table."
  ].join("\n");
}

function summarizeGeneric(text, filePath) {
  const lines = text.split(/\r?\n/);
  return [
    `Token Optimizer summary for ${path.basename(filePath)}:`,
    `- approx lines analyzed: ${lines.length}`,
    `- approx chars analyzed: ${text.length}`,
    "- If this file is repetitive or generated, prefer focused reads over full dumps."
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
  if ([".log", ".txt"].includes(ext)) {
    summary = summarizeLog(text, filePath);
  } else if ([".json", ".jsonl", ".ndjson"].includes(ext)) {
    summary = summarizeJson(text, filePath);
  } else if ([".csv", ".tsv"].includes(ext)) {
    summary = summarizeCsv(text, filePath);
  } else {
    summary = summarizeGeneric(text, filePath);
  }

  appendDebugLog("file_read_compress", {
    filePath,
    ext,
    sizeBytes: stat.size,
    analyzedChars: text.length,
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