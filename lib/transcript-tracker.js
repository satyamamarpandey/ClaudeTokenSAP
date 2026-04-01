const fs = require("fs");

/**
 * Reads the Claude Code session transcript (JSONL) and estimates
 * input tokens (user messages) and output tokens (assistant messages).
 *
 * Claude Code transcript format: one JSON object per line, with a
 * `role` or `type` field and a `content` or `text` field.
 */
function estimateTranscriptTokens(transcriptPath) {
  if (!transcriptPath) return null;

  let raw;
  try {
    raw = fs.readFileSync(transcriptPath, "utf8");
  } catch {
    return null;
  }

  let inputChars = 0;
  let outputChars = 0;
  let inputMessages = 0;
  let outputMessages = 0;

  const lines = raw.split("\n").filter((l) => l.trim());

  for (const line of lines) {
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }

    // Determine role from multiple possible formats
    const role = entry.role || entry.type || "";

    // Extract text content from various shapes:
    // { text: "..." } | { content: "..." } | { content: [{type:"text",text:"..."},...] }
    let text = "";
    if (typeof entry.text === "string") {
      text = entry.text;
    } else if (typeof entry.content === "string") {
      text = entry.content;
    } else if (Array.isArray(entry.content)) {
      text = entry.content
        .map((c) => {
          if (typeof c === "string") return c;
          if (c && typeof c.text === "string") return c.text;
          // Tool use / tool result blocks - count their JSON size too
          return JSON.stringify(c);
        })
        .join(" ");
    } else if (entry.message) {
      // Nested message object
      const msg = entry.message;
      if (typeof msg.content === "string") text = msg.content;
      else if (Array.isArray(msg.content)) {
        text = msg.content
          .map((c) => (typeof c.text === "string" ? c.text : JSON.stringify(c)))
          .join(" ");
      }
    }

    if (!text) continue;

    const chars = text.length;
    if (role === "user" || role === "human") {
      inputChars += chars;
      inputMessages++;
    } else if (role === "assistant") {
      outputChars += chars;
      outputMessages++;
    }
    // "system" / "tool" messages are overhead — skip for simplicity
  }

  // 1 token ≈ 4 chars
  const inputTokens = Math.round(inputChars / 4);
  const outputTokens = Math.round(outputChars / 4);

  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    inputMessages,
    outputMessages,
  };
}

module.exports = { estimateTranscriptTokens };
