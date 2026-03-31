const { readSessionState, mergeSessionState } = require("./debug-log");

const MAX_TRACKED_FILES = 50;

/**
 * Record that a file was read in this session.
 * Returns { isDuplicate, readCount, firstReadAt } for the file.
 */
function recordRead(filePath) {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();
  const state = readSessionState();
  const reads = state.fileReads || {};
  const existing = reads[normalized];

  const now = new Date().toISOString();
  const entry = existing
    ? { ...existing, count: existing.count + 1, lastReadAt: now }
    : { count: 1, firstReadAt: now, lastReadAt: now };

  const isDuplicate = entry.count > 1;

  // Prune oldest entries if we exceed max
  const updatedReads = { ...reads, [normalized]: entry };
  const keys = Object.keys(updatedReads);
  if (keys.length > MAX_TRACKED_FILES) {
    const sorted = keys.sort(
      (a, b) => new Date(updatedReads[a].lastReadAt) - new Date(updatedReads[b].lastReadAt)
    );
    for (const old of sorted.slice(0, keys.length - MAX_TRACKED_FILES)) {
      delete updatedReads[old];
    }
  }

  mergeSessionState((prev) => ({
    ...prev,
    fileReads: updatedReads,
    duplicateReads: (prev.duplicateReads || 0) + (isDuplicate ? 1 : 0),
  }));

  return { isDuplicate, readCount: entry.count, firstReadAt: entry.firstReadAt };
}

/**
 * Check if a file was already read this session (without recording).
 */
function checkDuplicate(filePath) {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();
  const state = readSessionState();
  const reads = state.fileReads || {};
  const existing = reads[normalized];
  return existing
    ? { isDuplicate: true, readCount: existing.count, firstReadAt: existing.firstReadAt }
    : { isDuplicate: false, readCount: 0 };
}

/**
 * Get summary stats for dedup tracking.
 */
function getDedupStats() {
  const state = readSessionState();
  const reads = state.fileReads || {};
  const totalFiles = Object.keys(reads).length;
  const totalReads = Object.values(reads).reduce((sum, r) => sum + r.count, 0);
  const duplicates = Object.values(reads).filter((r) => r.count > 1).length;
  return { totalFiles, totalReads, duplicates, duplicateReads: state.duplicateReads || 0 };
}

module.exports = { recordRead, checkDuplicate, getDedupStats };
