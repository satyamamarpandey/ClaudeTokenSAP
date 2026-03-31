# Changelog

All notable changes to Token Optimizer are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [2.2.1] - 2026-03-31

### Fixed
- **PreCompact/PostCompact hook schema validation**. Replaced invalid `hookSpecificOutput` with `hookEventName: "PreCompact"/"PostCompact"` (not recognized by Claude Code) with valid `systemMessage` field. Hooks now pass schema validation and inject context correctly during compaction.

---

## [2.2.0] - 2026-03-31

### Added
- **Token budget tracking** (`lib/token-budget.js`). Estimates token consumption across reads, prompts, bash, and search. Progressive warnings at 60%/80%. Strategic compaction at 70% budget replaces naive every-4-prompts interval.
- **Error loop detection** (`hooks/error_loop_guard.js`). PostToolUse hook on Bash normalizes error signatures (strips timestamps, paths, numbers) and intervenes after 3 identical failures with actionable guidance.
- **Search result compression** (`hooks/search_compress.js`). PostToolUse hook for Grep/Glob compresses 40+ results - groups by file (Grep) or directory (Glob), shows top 25 with match counts and sample lines.
- **Duplicate read prevention** (`lib/dedup-tracker.js`). Tracks every file read per session with LRU eviction at 50 files. Warns when a file has been read 3+ times.
- **Binary file blocking** in read guard. Instantly blocks .png, .jpg, .exe, .zip, .mp4, .pdf, .woff2, and 30+ binary extensions - they waste tokens as text.
- **Structured post-compact briefing.** Resume briefing includes token budget status, efficiency metrics from all subsystems, architecture changes, and file modification categories.

### Changed
- **Prompt preprocessor uses strategic compaction.** Replaced `COMPACT_INTERVAL = 4` with `shouldCompact()` from token-budget.js - triggers at 70% budget OR every 6 prompts.
- **Budget warnings injected into prompt context.** `getWarning()` adds progressive alerts at 60% and 80% consumption.
- **Session stats enriched.** Prompt preprocessor now reports all subsystem metrics: blocked reads, bash compressed, searches compressed, error loops caught, duplicate reads.
- **Read guard tracks all reads.** Every read is recorded via dedup-tracker for session-wide visibility.

---

## [2.1.0] - 2026-03-31

### Added
- **Smart prompt analysis engine** (`lib/prompt-analyzer.js`). Detects app type, framework, language, database, platform, and domain from the user's first prompt using score-based keyword matching with inference maps.
- **Context-aware onboarding hints.** Onboarding questions now show auto-detected defaults and contextual hints based on prompt analysis (e.g., "[detected: Next.js]").
- **Write/edit tracking** (`hooks/write_tracker.js`). Silent PostToolUse hook categorizes every file Claude modifies into dependency, config, test, database, api, ui, source, or docs - tracks architecture signals in session state.
- **Follow-up gap detection.** Prompts 2-4 check CLAUDE.md for `(pending onboarding)` placeholders and inject targeted follow-up questions.
- **Architecture change summaries.** Every 5th prompt shows a summary of dependency, DB, API, and config changes detected by write_tracker.
- **Enriched compaction memory.** Pre-compact now preserves file modifications grouped by category, architecture signal counts, and detected project context across compaction.

---

## [2.0.2] - 2026-03-31

### Fixed
- **Onboarding questions now enforced.** Rewrote the onboarding directive with consequence-framing so Claude cannot skip questions and jump straight to building.
- **`.claudeignore` auto-created on first run.** Blocks noisy directories at file-discovery level alongside `settings.json` deny rules.
- **Version string updated everywhere.** plugin.json, session banner, UAT runner, and README all reflect current version.

### Added
- **CLAUDE.md as living source of truth.** SessionStart policy instructs Claude to read `.claude/CLAUDE.md` before any task and use it instead of rescanning the codebase.
- **Continuous CLAUDE.md improvement.** Prompt preprocessor reminds Claude every 3 prompts to append new project facts to CLAUDE.md.
- **Pending onboarding detection.** If CLAUDE.md has `(pending onboarding)` placeholders, Claude asks the user to fill them in first.
- **Interactive onboarding questions.** First-run setup asks 5 questions (app type, language/framework, target users, database, constraints) before proceeding.
- **Prompt counting and auto-compact.** Every 4 prompts, a `/compact` reminder is injected automatically.
- **Response optimization directives.** Concise-output rules injected on every prompt.
- **JSON→CSV conversion.** Flat JSON arrays detected and CSV treatment advised.
- **Nested JSON summarization.** Large nested JSON gets schema+sample summary directive.
- **Log output detection.** Large log output triggers head+tail+errors summary guidance.
- **Progressive CLAUDE.md updates.** Pre/post-compact hooks instruct Claude to update CLAUDE.md with new project info.
- **Stack auto-detection.** Detects project stack from manifest files and injects into context.
- **Ask rules for media files.** Ask-before-read rules for images, videos, audio instead of flat deny.
- **Session efficiency metrics.** Post-compact summary shows total savings actions.
- **Expanded deny rules.** Added `.git/**`, `*.min.css`, `*.wasm`, `*.pb` to default deny list.

### Changed
- **Onboarding guard rewritten.** Creates placeholder CLAUDE.md immediately, then injects blocking directive for questions.
- **SessionStart policy restructured.** Clear sections: SEARCH FIRST, CONCISE OUTPUT, TASK-SPECIFIC, EFFICIENCY, CONTEXT MANAGEMENT.
- **Prompt preprocessor runs on every prompt.** Response optimization rules on every turn.

### Target
- **70% token savings per session** through combined optimizations.

---

## [1.9.0] - 2026-03-30

### Fixed
- **First-run onboarding no longer gets stuck.** Previously `onboarding_guard.js` injected a directive telling Claude to ask the user a question and then create `.claude/CLAUDE.md` and `.claude/settings.json`. This required a 2-turn interaction that broke down because the directive was only injected on the first turn - so after the user answered Claude had no instruction to create files and would stall or loop. The hook now creates both files directly (inferring project type from the prompt), then tells Claude "setup complete, proceed." No user questions, no multi-turn dependency.

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
