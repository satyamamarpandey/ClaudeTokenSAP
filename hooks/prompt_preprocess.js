const fs = require("fs");
const path = require("path");
const { appendDebugLog, mergeSessionState, readSessionState } = require("../lib/debug-log");
const { checkOnboardingCompleteness } = require("../lib/prompt-analyzer");
const { addTokens, getWarning, shouldCompact } = require("../lib/token-budget");
const { estimateTranscriptTokens } = require("../lib/transcript-tracker");

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
        replacement: prompt.replace(jsonStr, `[Converted to CSV - ${pct}% smaller]\n${csv}`),
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
        replacement: prompt.replace(jsonStr, `[JSON summarized - ${pct}% smaller]\n${summary}`),
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
      : `[${lines.length - 30} lines omitted - no errors]`,
    ...(errors.length > 0 ? errors : []),
    "[Last 15 lines]",
    ...tail,
  ].join("\n");

  const pct = Math.round((1 - compressed.length / prompt.length) * 100);
  return { replacement: compressed, savings: pct, mode: "log" };
}

// ── Main ───────────────────────────────────────────────────────────────

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

  // Track prompt tokens consumed
  if (prompt.length > 0) {
    addTokens("prompt", prompt.length);
  }

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
        `[Token Optimizer: JSON ${jsonResult.mode === "csv" ? "converted to CSV" : "summarized"} - ${jsonResult.savings}% token savings]`
      );
      // Note: We inject guidance but can't modify the prompt itself via hooks.
      // The additionalContext tells Claude the data was compressed.
      if (jsonResult.mode === "csv") {
        contextLines.push("The JSON data in this prompt is flat/tabular. Treat it as CSV for efficiency.");
      } else {
        contextLines.push("The JSON data is nested. A schema+sample summary is sufficient - do not request the full JSON.");
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
    "- ALWAYS produce visible text output the user can see - never go silent",
    "- Be concise: max 3-5 sentences for explanations, no filler",
    "- No re-stating what the user said",
    "- No echoing file contents back unless asked",
    "- Code-only responses when the task is purely code",
    "- Omit 'Here is...' / 'I will...' / 'Let me...' preambles",
    "- If creating files: just create them, don't explain each line",
    "- Batch independent tool calls in parallel",
    "- When the requested task is COMPLETE: say 'Done.' + one-line summary of what was created/changed. Then STOP. Do not continue with unrelated tasks.",
  );

  // ── 5. Follow-up detection (prompts 2-4): check CLAUDE.md completeness ──
  // NOTE: Non-blocking - just notes gaps, does NOT tell Claude to stop and ask.
  // This prevents the flow from stalling after onboarding answers.
  if (promptCount >= 2 && promptCount <= 4) {
    const cwd = payload.cwd || process.cwd();
    const claudeMdPath = path.join(cwd, ".claude", "CLAUDE.md");
    try {
      const claudeMd = fs.readFileSync(claudeMdPath, "utf8");
      const gaps = checkOnboardingCompleteness(claudeMd);
      if (gaps.length > 0 && !gaps.every((g) => g === "too_sparse")) {
        const pendingFields = gaps.filter((g) => !["too_sparse", "missing", "generic_pending"].includes(g));
        if (pendingFields.length > 0) {
          contextLines.push(
            "",
            `[Token Optimizer: CLAUDE.md has incomplete fields: ${pendingFields.join(", ")}. Fill these in when convenient, but do NOT block the user's current request.]`
          );
          appendDebugLog("followup_gaps", { gaps: pendingFields, promptCount });
        }
      }
    } catch {
      // CLAUDE.md doesn't exist yet - skip
    }
  }

  // ── 5b. Architecture tracking - inject summary of what was modified ──
  if (promptCount >= 3) {
    const archSignals = state.archSignals || {};
    const archNotes = [];
    if (archSignals.depsModified) archNotes.push(`${archSignals.depsModified} dependency changes (${archSignals.lastDepFile || "?"})`);
    if (archSignals.dbModified) archNotes.push(`${archSignals.dbModified} DB/schema changes`);
    if (archSignals.apiModified) archNotes.push(`${archSignals.apiModified} API route changes`);
    if (archNotes.length > 0 && promptCount % 5 === 0) {
      contextLines.push(
        "",
        `[Session architecture changes: ${archNotes.join(", ")}. Consider updating CLAUDE.md if these reflect new patterns.]`
      );
    }
  }

  // ── 6. Transcript-based input/output token tracking ──
  const transcriptPath = payload.transcript_path || null;
  const transcriptStats = estimateTranscriptTokens(transcriptPath);

  let transcriptInputTokens = 0;
  let transcriptOutputTokens = 0;
  if (transcriptStats) {
    transcriptInputTokens = transcriptStats.inputTokens;
    transcriptOutputTokens = transcriptStats.outputTokens;
    const totalTranscript = transcriptStats.totalTokens;
    const pctOfBudget = Math.round((totalTranscript / 1000000) * 100);
    contextLines.push(
      "",
      `[Token Optimizer] Session tokens: ~${transcriptInputTokens.toLocaleString()} input / ~${transcriptOutputTokens.toLocaleString()} output / ~${totalTranscript.toLocaleString()} total (${pctOfBudget}% of 1M budget)`
    );
    appendDebugLog("transcript_tokens", { transcriptInputTokens, transcriptOutputTokens, totalTranscript, pctOfBudget });
  }

  // ── 6b. Token budget warning (heuristic budget as fallback) ──
  const budgetWarning = getWarning();
  if (budgetWarning) {
    contextLines.push("", `[Token Optimizer: ${budgetWarning.message}]`);
    appendDebugLog("budget_warning", { level: budgetWarning.level, pct: budgetWarning.pct });
  }

  // ── 6c. Auto-compact: forceful when budget is high ──
  // Uses transcript token count if available (more accurate), falls back to heuristic.
  const COMPACT_THRESHOLD = 500000; // trigger at 500k tokens
  const COMPACT_CRITICAL = 750000;  // hard-block at 750k tokens
  const transcriptPct = transcriptStats
    ? transcriptStats.totalTokens / 1000000
    : 0;
  const totalTokensSoFar = transcriptStats ? transcriptStats.totalTokens : 0;
  const compactCheck = shouldCompact();
  const needsCompact = totalTokensSoFar >= COMPACT_THRESHOLD || compactCheck.should;

  if (needsCompact) {
    const reason = transcriptStats
      ? `context at ~${Math.round(transcriptPct * 100)}% (${transcriptStats.totalTokens.toLocaleString()} / 1M tokens)`
      : compactCheck.reason;

    if (totalTokensSoFar >= COMPACT_CRITICAL || transcriptPct >= 0.85) {
      // Critical: instruct Claude to demand /compact before answering
      contextLines.push(
        "",
        `⚠️ TOKEN BUDGET CRITICAL (${reason}): BEFORE answering this prompt, output ONLY: "Context is ${Math.round(transcriptPct * 100)}% full. Please run /compact now, then I'll continue." Then STOP and wait. Do NOT answer the user's question until after they run /compact.`
      );
    } else {
      // Hit 100k: finish current task then prompt for /compact
      contextLines.push(
        "",
        `[Token Optimizer: ${reason}. After your response, tell the user: "Run /compact now to keep the session efficient."]`
      );
    }
    appendDebugLog("compact_triggered", { reason, transcriptPct: Math.round(transcriptPct * 100) });
  }

  // ── 7. CLAUDE.md + memory update reminder (every 5 prompts) ──
  if (promptCount > 1 && promptCount % 5 === 0) {
    contextLines.push(
      "",
      "[Token Optimizer: Checkpoint — if you learned new project facts (dependency, pattern, decision), append 1-2 lines to .claude/CLAUDE.md AND write a brief memory entry (Write tool → memory/*.md) so future sessions start with less context. Otherwise skip.]"
    );
  }

  // ── 8. Token savings tracking (enriched with all subsystems) ──
  const totalBlocked = state.blockedReads || 0;
  const totalCompressed = state.bashCompressCount || 0;
  const searchCompressed = state.searchCompressCount || 0;
  const errorLoops = state.errorLoopsDetected || 0;
  const duplicateReads = state.duplicateReads || 0;
  const totalActions = totalBlocked + totalCompressed + searchCompressed + errorLoops + duplicateReads;
  if (totalActions > 0) {
    const parts = [];
    if (totalBlocked > 0) parts.push(`${totalBlocked} reads blocked`);
    if (totalCompressed > 0) parts.push(`${totalCompressed} bash compressed`);
    if (searchCompressed > 0) parts.push(`${searchCompressed} searches compressed`);
    if (errorLoops > 0) parts.push(`${errorLoops} error loops caught`);
    if (duplicateReads > 0) parts.push(`${duplicateReads} duplicate reads`);
    contextLines.push(`[Session savings: ${parts.join(", ")}]`);
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
