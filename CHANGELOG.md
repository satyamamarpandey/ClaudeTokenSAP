# Changelog

All notable changes to Token Optimizer are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [2.0.0] - 2026-03-31

### Added
- **Interactive onboarding questions.** First-run setup now asks the user 5 questions (app type, language/framework, target users, database needs, constraints) before proceeding. Answers are written into `.claude/CLAUDE.md` via the Edit tool. No more auto-inference.
- **Prompt counting and auto-compact.** Session state tracks prompt count. Every 4 prompts, a `/compact` reminder is injected automatically to keep context lean.
- **Response optimization directives.** Every prompt now injects concise-output rules: no preambles, no echoing, no filler, code-only when appropriate, parallel tool calls enforced.
- **JSON→CSV conversion.** Flat JSON arrays in user prompts are detected and the hook advises Claude to treat them as CSV for token savings.
- **Nested JSON summarization.** Large nested JSON in prompts gets a schema+sample summary directive instead of full parsing.
- **Log output detection.** Large log/command output in prompts triggers head+tail+errors summary guidance.
- **Progressive CLAUDE.md updates.** Pre-compact and post-compact hooks now instruct Claude to update `.claude/CLAUDE.md` with any new project information learned during the session.
- **Stack auto-detection.** SessionStart hook detects project stack from manifest files (package.json, Cargo.toml, go.mod, etc.) and injects it into context.
- **Ask rules for media files.** Settings.json now includes ask-before-read rules for images, videos, and audio files instead of flat deny.
- **Session efficiency metrics.** Post-compact summary shows total savings actions (blocked reads, compressed outputs, compactions).
- **Expanded deny rules.** Added `.git/**`, `*.min.css`, `*.wasm`, `*.pb` to default deny list.

### Changed
- **Onboarding guard rewritten.** Creates a placeholder CLAUDE.md immediately (prevents re-triggering), then injects a directive for Claude to ask questions and update the file with real answers.
- **SessionStart policy restructured.** Organized into clear sections (SEARCH FIRST, CONCISE OUTPUT, TASK-SPECIFIC, EFFICIENCY, CONTEXT MANAGEMENT) for better adherence.
- **Prompt preprocessor now runs on every prompt.** Previously only activated for prompts >3000 chars. Now injects response optimization rules on every turn.

### Target
- **70% token savings per session** through combined effects of: concise output rules, auto-compact, blocked reads, compressed bash output, JSON→CSV conversion, and targeted-read enforcement.

---

## [1.9.0] - 2026-03-30

### Fixed
- **First-run onboarding no longer gets stuck.** Previously `onboarding_guard.js` injected a directive telling Claude to ask the user a question and then create `.claude/CLAUDE.md` and `.claude/settings.json`. This required a 2-turn interaction that broke down because the directive was only injected on the first turn — so after the user answered Claude had no instruction to create files and would stall or loop. The hook now creates both files directly (inferring project type from the prompt), then tells Claude "setup complete, proceed." No user questions, no multi-turn dependency.

---

## [1.6.0] - 2026-03-30

### Added
- **Plain text condensation** (`condenseProse`) - removes whitespace noise, HTML comments, horizontal rules, and excessive spacing from large user messages. Fires when ≥10% savings are achievable.
- **Project type detection** in SessionStart hook - auto-detects Node.js, Python, Rust, Go, Java, Kotlin, PHP, Ruby, Dart, C/C++, Elixir from manifest files.
- **`.claudeignore` support** - SessionStart hook reads `.claudeignore` patterns and merges them as deny rules into `.claude/settings.json` automatically each session.
- **Haiku model delegation** for onboarding - first-run setup instructs Claude to use `claude-haiku-4-5-20251001` via the Agent tool for file generation (CLAUDE.md, .claudeignore, settings.json update).
- **Four generated files on onboarding** - CLAUDE.md, .claudeignore, updated settings.json, and `.onboarding_complete` marker.

### Fixed
- Missing `return` after log summarisation in `prompt_preprocess.js` - prevented log-summarised messages from falling through to plain-text processing.

---

## [1.1.0] - 2026-03-29

### Added
- **PostToolUse hook** (`file_read_compress.js`) - fires after every `Read` tool call on `.json`, `.log`, and `.txt` files and injects a compact summary into Claude's context.
- **Shared `lib/compress.js`** - extracted all compression logic into a shared module used by both hooks.
- **Visual savings banner** - ASCII progress bar displayed on every compressed prompt or file read.
- **JSON-in-text extraction** - detects JSON inside fenced code blocks or bare `{`/`[` after prose and compresses it in place.
- **`ignore_rules.json`** - configurable drop-keys list and max string length for pruned JSON mode.

### Changed
- Hook commands in `settings.json` updated to use `${CLAUDE_PLUGIN_ROOT}` variable instead of relative paths for cross-user compatibility.

---

## [1.0.0] - 2026-03-28

### Added
- Initial release.
- **UserPromptSubmit hook** (`prompt_preprocess.js`) - inspects large prompts and compresses JSON payloads (CSV / summary / pruned) and log output before Claude sees them.
- **SessionStart hook** (`instructions_loaded.js`) - copies `.claude` template into new projects and runs first-run onboarding.
- **Flat JSON → CSV** compression for tabular arrays.
- **Nested JSON → sample + schema + counts** summary mode.
- **Pruned JSON** fallback with configurable key dropping and string truncation.
- **Log summariser** - head (20 lines) + tail (20 lines) + error/warning/info counts.
- **Deny + ask rules** in `settings.json` - blocks 20+ noise sources, asks before reading logs and media.
- **Token Optimizer skill** (`SKILL.md`) - guides Claude on interpreting all compressed data formats.
