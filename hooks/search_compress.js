const { appendDebugLog, mergeSessionState } = require("../lib/debug-log");
const { addTokens, recordSavings } = require("../lib/token-budget");

const MAX_RESULTS_SHOWN = 25;
const MIN_RESULTS_TO_COMPRESS = 40;

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

function compressSearchResults(output, toolName) {
  if (!output || typeof output !== "string") return null;

  const lines = output.split("\n").filter((l) => l.trim());
  if (lines.length < MIN_RESULTS_TO_COMPRESS) return null;

  // For Grep: group by file, show top files with match counts
  if (toolName === "Grep") {
    const fileMatches = {};
    for (const line of lines) {
      // Grep output format: "file:line:content" or just file paths
      const match = line.match(/^(.+?)(?::\d+:|$)/);
      if (match) {
        const file = match[1].trim();
        fileMatches[file] = (fileMatches[file] || 0) + 1;
      }
    }

    const sortedFiles = Object.entries(fileMatches)
      .sort((a, b) => b[1] - a[1]);

    if (sortedFiles.length <= 5) return null; // Not enough to compress

    const topFiles = sortedFiles.slice(0, MAX_RESULTS_SHOWN);
    const remaining = sortedFiles.length - MAX_RESULTS_SHOWN;

    const compressed = [
      `[Search results compressed: ${lines.length} matches across ${sortedFiles.length} files]`,
      "",
      `Top ${topFiles.length} files by match count:`,
      ...topFiles.map(([file, count]) => `  ${file} (${count} matches)`),
    ];

    if (remaining > 0) {
      compressed.push(`  ... and ${remaining} more files`);
    }

    // Show first few actual match lines for context
    const sampleLines = lines.slice(0, 10);
    compressed.push("", "Sample matches:", ...sampleLines);

    return {
      compressed: compressed.join("\n"),
      originalLines: lines.length,
      compressedLines: compressed.length,
    };
  }

  // For Glob: show top results + count
  if (toolName === "Glob") {
    const topResults = lines.slice(0, MAX_RESULTS_SHOWN);
    const remaining = lines.length - MAX_RESULTS_SHOWN;

    // Group by directory for summary
    const dirCounts = {};
    for (const line of lines) {
      const dir = line.replace(/\\/g, "/").split("/").slice(0, -1).join("/") || ".";
      dirCounts[dir] = (dirCounts[dir] || 0) + 1;
    }

    const topDirs = Object.entries(dirCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    const compressed = [
      `[File search compressed: ${lines.length} files found]`,
      "",
      "By directory:",
      ...topDirs.map(([dir, count]) => `  ${dir}/ (${count} files)`),
      "",
      `First ${topResults.length} results:`,
      ...topResults,
    ];

    if (remaining > 0) {
      compressed.push(`  ... and ${remaining} more files`);
    }

    return {
      compressed: compressed.join("\n"),
      originalLines: lines.length,
      compressedLines: compressed.length,
    };
  }

  return null;
}

(async () => {
  const payload = await readJsonStdin();
  const toolName = payload.tool_name;

  if (toolName !== "Grep" && toolName !== "Glob") {
    process.exit(0);
  }

  const output = payload?.tool_response?.output || payload?.tool_response?.content || "";
  if (!output || typeof output !== "string") {
    process.exit(0);
  }

  // Track tokens consumed by search results
  addTokens("search", output.length);

  const result = compressSearchResults(output, toolName);
  if (!result) {
    process.exit(0);
  }

  // Record savings
  const savedChars = output.length - result.compressed.length;
  if (savedChars > 0) recordSavings("search_compress", savedChars);

  appendDebugLog("search_compress", {
    tool: toolName,
    originalLines: result.originalLines,
    compressedLines: result.compressedLines,
    query: payload?.tool_input?.pattern?.slice(0, 80) || payload?.tool_input?.glob?.slice(0, 80),
  });

  mergeSessionState((prev) => ({
    ...prev,
    searchCompressCount: (prev.searchCompressCount || 0) + 1,
  }));

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: result.compressed,
      },
    })
  );
})();
