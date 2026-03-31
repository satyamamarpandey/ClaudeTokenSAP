const { readSessionState, mergeSessionState } = require("./debug-log");

// Approximate context window for Claude models
const DEFAULT_BUDGET = 200000;
const WARN_THRESHOLD_1 = 0.6; // 60% - first warning
const WARN_THRESHOLD_2 = 0.8; // 80% - urgent warning

/**
 * Estimate tokens from a character count (rough: 1 token ≈ 4 chars).
 */
function charsToTokens(chars) {
  return Math.round(chars / 4);
}

/**
 * Add estimated tokens consumed by an operation.
 * category: "read", "bash", "prompt", "response", "search", "write"
 */
function addTokens(category, charCount) {
  const tokens = charsToTokens(charCount);
  const state = readSessionState();
  const budget = state.tokenBudget || {
    total: DEFAULT_BUDGET,
    consumed: 0,
    breakdown: {},
  };

  budget.consumed += tokens;
  budget.breakdown[category] = (budget.breakdown[category] || 0) + tokens;

  mergeSessionState((prev) => ({
    ...prev,
    tokenBudget: budget,
  }));

  return budget;
}

/**
 * Record tokens that were SAVED (not consumed) by optimization.
 */
function recordSavings(category, charsSaved) {
  const tokens = charsToTokens(charsSaved);
  mergeSessionState((prev) => {
    const savings = prev.tokenSavings || { total: 0, breakdown: {} };
    savings.total += tokens;
    savings.breakdown[category] = (savings.breakdown[category] || 0) + tokens;
    return { ...prev, tokenSavings: savings };
  });
}

/**
 * Get current usage and any warning that should be shown.
 */
function getUsage() {
  const state = readSessionState();
  const budget = state.tokenBudget || { total: DEFAULT_BUDGET, consumed: 0, breakdown: {} };
  const pct = budget.consumed / budget.total;
  return {
    consumed: budget.consumed,
    total: budget.total,
    pct: Math.round(pct * 100),
    breakdown: budget.breakdown,
    savings: state.tokenSavings || { total: 0, breakdown: {} },
  };
}

/**
 * Get warning message if threshold crossed, or null.
 */
function getWarning() {
  const state = readSessionState();
  const budget = state.tokenBudget || { total: DEFAULT_BUDGET, consumed: 0 };
  const pct = budget.consumed / budget.total;
  const lastWarningLevel = state.lastBudgetWarning || 0;

  if (pct >= WARN_THRESHOLD_2 && lastWarningLevel < 2) {
    mergeSessionState((prev) => ({ ...prev, lastBudgetWarning: 2 }));
    return {
      level: "critical",
      pct: Math.round(pct * 100),
      message: `CRITICAL: ~${Math.round(pct * 100)}% of context budget consumed (~${budget.consumed.toLocaleString()} tokens). Run /compact NOW. Use maximum brevity. Skip non-essential reads.`,
    };
  }

  if (pct >= WARN_THRESHOLD_1 && lastWarningLevel < 1) {
    mergeSessionState((prev) => ({ ...prev, lastBudgetWarning: 1 }));
    return {
      level: "warning",
      pct: Math.round(pct * 100),
      message: `WARNING: ~${Math.round(pct * 100)}% of context budget consumed (~${budget.consumed.toLocaleString()} tokens). Be more selective with reads. Consider /compact soon.`,
    };
  }

  return null;
}

/**
 * Check if compaction should be triggered based on budget, not naive prompt count.
 */
function shouldCompact() {
  const state = readSessionState();
  const budget = state.tokenBudget || { total: DEFAULT_BUDGET, consumed: 0 };
  const pct = budget.consumed / budget.total;
  const promptCount = state.promptCount || 0;

  // Strategic compaction: trigger at 70% OR every 6 prompts (whichever comes first)
  if (pct >= 0.7) return { should: true, reason: `context at ${Math.round(pct * 100)}%` };
  if (promptCount > 0 && promptCount % 6 === 0) return { should: true, reason: `${promptCount} prompts` };
  return { should: false };
}

module.exports = { charsToTokens, addTokens, recordSavings, getUsage, getWarning, shouldCompact };
