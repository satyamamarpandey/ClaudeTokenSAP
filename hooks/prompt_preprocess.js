const { appendDebugLog, mergeSessionState, readSessionState } = require("../lib/debug-log");

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

// ── JSON → CSV conversion for flat arrays ──────────────────────────────

function isFlat(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
  return Object.values(obj).every(
    (v) => v === null || typeof v !== "object"
  );
}

function jsonArrayToCsv(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  // Check first 5 items for flatness
  const sample = arr.slice(0, 5);
  if (!sample.every(isFlat)) return null;

  const allKeys = new Set();
  for (const item of arr) {
    if (item && typeof item === "object") {
      Object.keys(item).forEach((k) => allKeys.add(k));
    }
  }
  const keys = [...allKeys];
  if (keys.length === 0 || keys.length > 30) return null;

  const header = keys.join(",");
  const rows = arr.map((item) =>
    keys.map((k) => {
      const v = item?.[k];
      if (v === null || v === undefined) return "";
      const s = String(v);
      return s.includes(",") || s.includes('"') || s.includes("\n")
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    }).join(",")
  );

  return header + "\n" + rows.join("\n");
}

// ── Nested JSON → schema + sample + counts ─────────────────────────────

function summarizeNestedJson(parsed) {
  const lines = [];

  if (Array.isArray(parsed)) {
    lines.push(`Array with ${parsed.length} items`);
    if (parsed.length > 0 && typeof parsed[0] === "object" && parsed[0] !== null) {
      const keys = Object.keys(parsed[0]);
      lines.push(`Sample keys: ${keys.slice(0, 10).join(", ")}`);
      lines.push(`Sample item: ${JSON.stringify(parsed[0]).slice(0, 200)}`);
    }
  } else if (typeof parsed === "object" && parsed !== null) {
    const keys = Object.keys(parsed);
    lines.push(`Object with ${keys.length} keys: ${keys.slice(0, 15).join(", ")}`);
    for (const key of keys.slice(0, 5)) {
      const v = parsed[key];
      if (Array.isArray(v)) {
        lines.push(`  ${key}: array[${v.length}]`);
      } else if (typeof v === "object" && v !== null) {
        lines.push(`  ${key}: object{${Object.keys(v).slice(0, 5).join(",")}}`);
      } else {
        lines.push(`  ${key}: ${typeof v} = ${String(v).slice(0, 60)}`);
      }
    }
  }

  return lines.join("\n");
}

// ── Compress large JSON in prompt text ─────────────────────────────────

function tryCompressJsonInPrompt(prompt) {
  // Try to find JSON in the prompt (fenced or bare)
  const jsonMatch =
    prompt.match(/```(?:json)?\s*\n([\s\S]+?)\n```/) ||
    prompt.match(/(\[[\s\S]{500,}\])/) ||
    prompt.match(/(\{[\s\S]{500,}\})/);

  if (!jsonMatch) return null;

  const jsonStr = jsonMatch[1] || jsonMatch[0];
  let parsed;
  try { parsed = JSON.parse(jsonStr); }
  catch { return null; }

  // Flat array → CSV
  if (Array.isArray(parsed) && parsed.length > 3) {
    const csv = jsonArrayToCsv(parsed);
    if (csv && csv.length < jsonStr.length * 0.7) {
      const before = jsonStr.length;
      const after = csv.length;
      const pct = Math.round((1 - after / before) * 100);
      return {
        replacement: prompt.replace(jsonStr, `[Converted to CSV — ${pct}% smaller]\n${csv}`),
        savings: pct,
        mode: "csv",
      };
    }
  }

  // Nested JSON → schema summary
  if (jsonStr.length > 1000) {
    const summary = summarizeNestedJson(parsed);
    if (summary) {
      const before = jsonStr.length;
      const after = summary.length;
      const pct = Math.round((1 - after / before) * 100);
      return {
        replacement: prompt.replace(jsonStr, `[JSON summarized — ${pct}% smaller]\n${summary}`),
        savings: pct,
        mode: "summary",
      };
    }
  }

  return null;
}

// ── Log/output compression ─────────────────────────────────────────────

function tryCompressLogInPrompt(prompt) {
  const lines = prompt.split("\n");
  if (lines.length < 80) return null;

  // Check if it looks like log/command output
  const logIndicators = lines.filter((l) =>
    /^\d{4}-|^\[|^[A-Z]{2,}\s|^[>$#]\s|error|warn|info|debug/i.test(l.trim())
  ).length;

  if (logIndicators < lines.length * 0.3) return null;

  const head = lines.slice(0, 15);
  const tail = lines.slice(-15);
  const errors = lines.filter((l) =>
    /error|warn|fatal|exception|failed|timeout/i.test(l)
  ).slice(0, 20);

  const compressed = [
    `[Log compressed: ${lines.length} lines → summary]`,
    "[First 15 lines]",
    ...head,
    errors.length > 0
      ? `[${errors.length} error/warning lines from middle]`
      : `[${lines.length - 30} lines omitted — no errors]`,
    ...(errors.length > 0 ? errors : []),
    "[Last 15 lines]",
    ...tail,
  ].join("\n");

  const pct = Math.round((1 - compressed.length / prompt.length) * 100);
  return { replacement: compressed, savings: pct, mode: "log" };
}

// ── Main ───────────────────────────────────────────────────────────────

const COMPACT_INTERVAL = 4; // Suggest /compact every N prompts

(async () => {
  const payload = await readJsonStdin();
  const prompt = payload.prompt || "";

  const state = readSessionState();
  const promptCount = (state.promptCount || 0) + 1;

  mergeSessionState((prev) => ({
    ...prev,
    promptCount,
    lastPromptAt: new Date().toISOString(),
  }));

  appendDebugLog("prompt_preprocess", {
    cwd: payload.cwd,
    rawPromptLength: prompt.length,
    promptCount,
  });

  const contextLines = [];

  // ── 1. Try JSON compression ──
  if (prompt.length > 500) {
    const jsonResult = tryCompressJsonInPrompt(prompt);
    if (jsonResult) {
      appendDebugLog("prompt_json_compressed", {
        mode: jsonResult.mode,
        savings: jsonResult.savings,
      });
      contextLines.push(
        `[Token Optimizer: JSON ${jsonResult.mode === "csv" ? "converted to CSV" : "summarized"} — ${jsonResult.savings}% token savings]`
      );
      // Note: We inject guidance but can't modify the prompt itself via hooks.
      // The additionalContext tells Claude the data was compressed.
      if (jsonResult.mode === "csv") {
        contextLines.push("The JSON data in this prompt is flat/tabular. Treat it as CSV for efficiency.");
      } else {
        contextLines.push("The JSON data is nested. A schema+sample summary is sufficient — do not request the full JSON.");
      }
    }
  }

  // ── 2. Try log compression ──
  if (prompt.length > 3000) {
    const logResult = tryCompressLogInPrompt(prompt);
    if (logResult) {
      appendDebugLog("prompt_log_compressed", {
        savings: logResult.savings,
      });
      contextLines.push(
        `[Token Optimizer: Log output detected (${Math.round(prompt.length / 1024)}KB). Focus on errors/warnings only, skip repetitive INFO lines.]`
      );
    }
  }

  // ── 3. Large prompt warning ──
  if (prompt.length > 3000 && contextLines.length === 0) {
    contextLines.push(
      `Large prompt detected (${Math.round(prompt.length / 1024)}KB). Work incrementally: Grep/Glob first, targeted reads only, no re-echoing pasted content.`
    );
  }

  // ── 4. Response optimization (on EVERY prompt) ──
  contextLines.push(
    "RESPONSE RULES (apply to this response):",
    "- Be concise: max 3-5 sentences for explanations, no filler",
    "- No re-stating what the user said",
    "- No echoing file contents back unless asked",
    "- Code-only responses when the task is purely code",
    "- Omit 'Here is...' / 'I will...' / 'Let me...' preambles",
    "- If creating files: just create them, don't explain each line",
    "- Batch independent tool calls in parallel",
  );

  // ── 5. Auto-compact reminder ──
  if (promptCount > 0 && promptCount % COMPACT_INTERVAL === 0) {
    contextLines.push(
      "",
      `[Token Optimizer: ${promptCount} prompts in this session. Run /compact now to free context. Tell the user: "Running /compact to optimize context."]`
    );
    appendDebugLog("compact_reminder", { promptCount });
  }

  // ── 6. Token savings tracking ──
  const totalBlocked = state.blockedReads || 0;
  const totalCompressed = state.bashCompressCount || 0;
  if (totalBlocked + totalCompressed > 0) {
    contextLines.push(
      `[Session stats: ${totalBlocked} reads blocked, ${totalCompressed} outputs compressed]`
    );
  }

  if (contextLines.length > 0) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext: contextLines.join("\n"),
        },
      })
    );
  }
})();
