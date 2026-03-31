/**
 * PostToolUse hook for Write/Edit - tracks file modifications in session state.
 * Used by precompact.js for richer context preservation and CLAUDE.md auto-updates.
 */

const path = require("path");
const { appendDebugLog, mergeSessionState } = require("../lib/debug-log");

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

const MAX_TRACKED_FILES = 20;

// Detect file category for architecture tracking
function categorizeFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const base = path.basename(filePath).toLowerCase();
  const dir = filePath.replace(/\\/g, "/").toLowerCase();

  if (base === "package.json" || base === "cargo.toml" || base === "go.mod" || base === "requirements.txt" || base === "pyproject.toml" || base === "pubspec.yaml" || base === "build.gradle" || base === "pom.xml") {
    return "dependency";
  }
  if (base.includes(".config.") || base.includes(".rc") || base === "tsconfig.json" || base === ".env" || base === ".env.local") {
    return "config";
  }
  if (dir.includes("/test") || dir.includes("__test") || dir.includes(".test.") || dir.includes(".spec.")) {
    return "test";
  }
  if (dir.includes("/migration") || dir.includes("/schema") || base.includes("schema") || base.includes("migration")) {
    return "database";
  }
  if (dir.includes("/api/") || dir.includes("/routes/") || dir.includes("/endpoint")) {
    return "api";
  }
  if (dir.includes("/component") || dir.includes("/ui/") || dir.includes("/view") || dir.includes("/screen") || dir.includes("/page")) {
    return "ui";
  }
  if ([".ts", ".tsx", ".js", ".jsx", ".py", ".rs", ".go", ".java", ".kt", ".swift", ".dart", ".rb", ".php", ".cs", ".cpp", ".c"].includes(ext)) {
    return "source";
  }
  if ([".md", ".mdx", ".txt", ".rst"].includes(ext)) {
    return "docs";
  }
  return "other";
}

(async () => {
  const payload = await readJsonStdin();
  const toolInput = payload.tool_input || {};
  const filePath = toolInput.file_path || toolInput.path || "";

  if (!filePath) {
    process.exit(0);
  }

  const category = categorizeFile(filePath);
  const baseName = path.basename(filePath);
  const now = new Date().toISOString();

  mergeSessionState((prev) => {
    const modifiedFiles = prev.modifiedFiles || [];
    // Avoid duplicates - update timestamp if already tracked
    const existing = modifiedFiles.findIndex((f) => f.path === filePath);
    if (existing >= 0) {
      modifiedFiles[existing] = { ...modifiedFiles[existing], lastModified: now, count: (modifiedFiles[existing].count || 1) + 1 };
    } else {
      modifiedFiles.push({ path: filePath, baseName, category, firstModified: now, lastModified: now, count: 1 });
    }

    // Track architecture signals
    const archSignals = prev.archSignals || {};

    if (category === "dependency") {
      archSignals.depsModified = (archSignals.depsModified || 0) + 1;
      archSignals.lastDepFile = baseName;
    }
    if (category === "database") {
      archSignals.dbModified = (archSignals.dbModified || 0) + 1;
    }
    if (category === "api") {
      archSignals.apiModified = (archSignals.apiModified || 0) + 1;
    }
    if (category === "config") {
      archSignals.configModified = (archSignals.configModified || 0) + 1;
    }

    return {
      ...prev,
      modifiedFiles: modifiedFiles.slice(-MAX_TRACKED_FILES),
      archSignals,
      totalWrites: (prev.totalWrites || 0) + 1,
    };
  });

  appendDebugLog("write_tracked", { filePath: baseName, category });

  // Silent - no output to Claude, just state tracking
  process.exit(0);
})();
