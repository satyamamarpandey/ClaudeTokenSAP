<div align="center">

# ClaudeTokenSAP

### A Claude Code marketplace for leaner context, sharper build starts, and smarter long-running sessions

<p>
  <a href="#installation"><img src="https://img.shields.io/badge/install-2%20commands-111827?style=for-the-badge" alt="Install in 2 commands"></a>
  <a href="#whats-new-in-v140"><img src="https://img.shields.io/badge/version-v1.4.0-2563eb?style=for-the-badge" alt="Version 1.4.0"></a>
  <a href="#supported-platforms"><img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-0f766e?style=for-the-badge" alt="Windows macOS Linux"></a>
  <a href="#requirements"><img src="https://img.shields.io/badge/node-%E2%89%A5%2018-7c3aed?style=for-the-badge" alt="Node 18+"></a>
</p>

<p>
  <img src="https://img.shields.io/badge/Marketplace-Claude%20Code-111827?style=flat-square" alt="Claude Code Marketplace">
  <img src="https://img.shields.io/badge/Plugin-token--optimizer-16a34a?style=flat-square" alt="token-optimizer">
  <img src="https://img.shields.io/badge/Hooks-6%20active-f59e0b?style=flat-square" alt="6 active hooks">
  <img src="https://img.shields.io/badge/Design-cross--platform-2563eb?style=flat-square" alt="Cross platform">
</p>

</div>

---

> **ClaudeTokenSAP** is a Claude Code plugin marketplace.
>
> Its first plugin, **Token Optimizer**, improves how Claude Code handles vague build prompts, oversized file reads, and long sessions.
>
> It is built to reduce context waste **without** making Claude feel dumber, more generic, or overly interruptive.

The core idea is simple:

- ask better questions before coding when the request is vague
- stop huge noisy reads before they flood context
- summarize useful file reads in a compact way
- preserve lightweight session memory around compaction
- log what happened so the workflow can be tuned over time

---

## Why this exists

Claude Code is strongest when context contains **signal**, not bulk.

In real development workflows, context gets wasted by things like:

- prompts such as `create a calculator`
- large logs where only a few lines matter
- big JSON files where only the shape or a few keys matter
- repeated file reads that dump raw bulk into the session
- long conversations that lose thread after compaction

That creates three practical problems:

1. **Higher token usage**
2. **Lower reasoning quality**
3. **More time wasted clarifying basic build direction after code has already started**

**Token Optimizer** is designed to intervene at exactly those points.

---

## What’s new in v1.4.0

Version `1.4.0` adds the latest workflow upgrades:

### Clarification gate for vague build prompts
If a user prompt is underspecified, the plugin pushes Claude to ask focused follow-up questions **before** writing code.

The questions are:

- compact
- OpenCode-style
- limited to missing details only
- capped at 4 questions
- always include **Custom** as the last option

### Read guard for large noisy files
Large full-file reads for noisy files such as `.log`, `.json`, `.csv`, `.txt`, `.jsonl`, `.ndjson`, `.lock`, and `.map` are blocked when they would likely waste context.

Instead of dumping the whole file, Claude is guided toward narrower strategies such as:

- reading only relevant lines
- inspecting structure first
- focusing on errors, keys, columns, or repeated patterns

### Post-read summaries
After a useful `Read`, the plugin adds compact summaries for:

- logs
- JSON
- CSV / TSV
- generic text files

### PreCompact and PostCompact hooks
The plugin now keeps a lightweight memory layer around Claude Code compaction.

This helps long sessions preserve useful recent state such as:

- recent events
- recent file-read summaries
- high-signal debug activity

### Repo summary at session start
At session start, the plugin adds a short repo-level file-type summary so Claude gets a quick sense of project shape without scanning the whole workspace.

### Debug logging and telemetry foundation
Hook activity is written to a local temp log so you can validate behavior and measure the impact of optimizations over time.

---

## What Token Optimizer actually does

Token Optimizer is not a general IDE plugin.

It is a **context optimizer and build-start gatekeeper** for Claude Code.

That means it focuses on five things:

### 1. Clarify before building
When the user asks Claude to build something but leaves out important details, the plugin can stop the build from starting too early.

For example, if the prompt is:

```text
create a calculator
```

Claude is guided to ask for missing details such as:

- platform
- scope
- UI direction
- must-have features

If the prompt is already specific enough, Claude proceeds normally.

### 2. Prevent wasteful full-file reads
If Claude attempts a full read on a large noisy file, the plugin blocks it and provides a better strategy.

Instead of flooding context, Claude is nudged to:

- inspect structure first
- read only relevant sections
- summarize repeated or low-signal content

### 3. Add compact summaries after useful reads
When a file read is still worth doing, the plugin adds a summary layer so Claude reasons over a smaller, clearer representation.

Examples:

- **logs** → counts, repeated lines, high-signal lines
- **JSON** → root type, top-level keys, object/array shape
- **CSV / TSV** → column names and approximate row count
- **text** → approximate size and line count

### 4. Preserve memory around compaction
Long coding sessions can drift when Claude compacts context.

The plugin adds lightweight pre/post compaction notes so important recent signals are less likely to disappear.

### 5. Provide a fast repo snapshot on new sessions
On session start, Claude gets a quick top-level repository summary based on file extensions. This helps it orient faster in a new repo.

---

## Hook lifecycle

The current plugin uses **6 active hooks**.

| Hook | Purpose |
|---|---|
| `SessionStart` | Adds policy guidance, debug log location, and a lightweight repo file summary |
| `UserPromptSubmit` | Logs prompt shape and runs the Sonnet-based clarification gate for vague build prompts |
| `PreToolUse (Read)` | Blocks oversized noisy full-file reads and suggests narrower read strategies |
| `PostToolUse (Read)` | Adds compact summaries for logs, JSON, CSV/TSV, and text |
| `PreCompact` | Captures recent high-signal session activity before compaction |
| `PostCompact` | Adds a small summary after compaction for continuity |

---

## Why this is useful in practice

Most developers do not lose context because they lack model intelligence.

They lose it because the session is full of things like:

- repeated logs
- overscoped file reads
- underspecified feature requests
- re-explaining the repo shape every time

Without optimization, Claude spends more context **reading raw bulk**.

With optimization, Claude spends more context **thinking about the problem**.

That is the practical difference.

---

## Example flows

### Example 1: vague build request

#### Input

```text
create a calculator
```

#### Result

Instead of jumping into code immediately, Claude is encouraged to ask compact clarification questions such as:

1. What platform should this target?
   - Web
   - Android
   - iOS
   - Desktop
   - OpenCode
   - Custom

2. What kind of calculator is it?
   - Basic
   - Scientific
   - With history
   - With keyboard support
   - Custom

This prevents low-quality default scaffolding when the request is clearly underspecified.

---

### Example 2: large noisy log file

#### Input

Claude attempts to fully read a very large `.log` file.

#### Result

The plugin blocks the full read and returns guidance like:

```text
Token Optimizer blocked a full read on a large log file to protect your Claude context.

Use a narrower strategy instead:
1. Search for ERROR, WARN, FATAL, exception, timeout, or stack traces first.
2. Read only the surrounding lines for the real failures.
3. Collapse repetitive INFO/debug noise into counts or patterns.
```

This saves context before the waste happens.

---

### Example 3: compact JSON summary after read

#### Input

Claude reads a JSON file that is useful but still large enough to be noisy.

#### Result

The plugin adds a compact summary such as:

```text
Token Optimizer summary for config.json:
- root type: object
- top-level keys: settings, services, routes
- services: array (12 items)
- routes: object with keys auth, admin, public
- Prefer targeted key/section reads for exact values instead of re-reading the full JSON.
```

---

### Example 4: compaction continuity

When Claude Code compacts a long session, Token Optimizer can add summaries such as:

```text
Token Optimizer pre-compact summary:
Recent events:
- file_read_compress
- read_guard_check
- prompt_preprocess
```

and then:

```text
Token Optimizer post-compact summary:
Total events logged this session: 27
```

This helps the session keep recent high-signal memory without dragging forward raw bulk.

---

## Token savings: what to claim honestly

Token Optimizer is built to reduce waste, but savings depend heavily on the input type.

The safest way to describe it is:

> It can reduce token usage substantially on noisy logs, oversized JSON, repeated file reads, and vague build starts. In highly repetitive cases, reductions can exceed 70%, but savings vary by workflow and input quality.

That wording is strong **and** defensible.

Do **not** promise a flat 70% reduction for every session.

---

## Installation

### 1. Add the marketplace

```bash
claude plugin marketplace add https://github.com/satyamamarpandey/ClaudeTokenSAP.git
```

### 2. Install the plugin

```bash
claude plugin install token-optimizer@claudetokensap-marketplace
```

### 3. Restart Claude Code

Restart Claude Code once so the hooks load cleanly for the next session.

---

## Quick start

After installation, you do not need a new workflow.

Just use Claude Code normally.

Typical examples:

- ask Claude to build something
- inspect logs
- read large JSON files
- work through long development sessions

The plugin runs in the background and adjusts the context flow automatically.

---

## Requirements

| Requirement | Status |
|---|---|
| Claude Code | Required |
| Node.js 18+ | Required |
| Manual setup after install | Not required |

---

## Supported platforms

| Platform | Status |
|---|---|
| Windows | Supported |
| macOS | Supported |
| Linux | Supported |

The plugin uses cross-platform Node-based hook scripts and simple filesystem logic, so it is designed to work across all three major operating systems.

---

## Repository structure

```text
ClaudeTokenSAP/
├── .claude-plugin/
│   └── marketplace.json
├── plugins/
│   └── ClaudeTokenSAP/
│       ├── .claude-plugin/
│       │   └── plugin.json
│       ├── hooks/
│       │   ├── hooks.json
│       │   ├── instructions_loaded.js
│       │   ├── prompt_preprocess.js
│       │   ├── read_guard.js
│       │   ├── file_read_compress.js
│       │   ├── precompact.js
│       │   └── postcompact.js
│       └── lib/
│           └── debug-log.js
├── README.md
├── CHANGELOG.md
├── CONTRIBUTING.md
├── LICENSE
└── SECURITY.md
```

### Structure overview

| Path | Purpose |
|---|---|
| `.claude-plugin/marketplace.json` | Marketplace index |
| `plugins/ClaudeTokenSAP/.claude-plugin/plugin.json` | Plugin identity, version, and metadata |
| `plugins/ClaudeTokenSAP/hooks/hooks.json` | Hook registration |
| `plugins/ClaudeTokenSAP/hooks/` | Runtime hook entry points |
| `plugins/ClaudeTokenSAP/lib/debug-log.js` | Shared debug logging utility |

---

## Design principles

### Preserve signal, not bulk
The plugin should reduce noise without flattening important meaning.

### Ask before building when the prompt is vague
Bad defaults cost more than a quick focused clarification round.

### Block waste early
The cheapest token is the one that never enters context.

### Stay lightweight
The plugin should not spend large amounts of model budget trying to save budget.

### Stay useful during long sessions
Compaction should not reset the session’s working memory every time.

### Remain cross-platform
The same marketplace and hook flow should work across Windows, macOS, and Linux.

---

## Typical use cases

### Build requests
- stop vague prompts from turning into low-quality scaffolds
- ask the missing questions first
- reduce backtracking later

### Debugging sessions
- avoid flooding context with huge logs
- surface real errors faster
- collapse repeated noise

### Data-heavy workflows
- summarize large JSON and CSV reads
- preserve shape and high-signal structure
- encourage targeted follow-up reads

### Long-running sessions
- keep lightweight continuity around compaction
- retain a better sense of recent actions and session state

### New repos and unfamiliar codebases
- give Claude a quick repo-level file-type overview at session start
- reduce the time spent re-orienting in each new session

---

## Troubleshooting

<details>
<summary><strong>The plugin is installed but does not seem active</strong></summary>

Check the following:

- Claude Code was restarted after install or update
- the plugin name used during install is correct
- the plugin appears as enabled in `/plugin`
- the marketplace was refreshed after version changes

</details>

<details>
<summary><strong>The old plugin name still shows an error</strong></summary>

If you previously installed an older plugin entry such as `ClaudeTokenSAP@claudetokensap-marketplace`, uninstall that stale entry and keep only:

```text
token-optimizer@claudetokensap-marketplace
```

</details>

<details>
<summary><strong>Large reads are being blocked too often</strong></summary>

That usually means Claude is attempting full-file reads where targeted reads would be better.

The current behavior is intentional. The plugin is biased toward narrower reads on noisy large files.

</details>

<details>
<summary><strong>I want to verify the hooks are firing</strong></summary>

Check the temp debug log created by `debug-log.js`.

That log records hook activity and is the easiest way to confirm:

- session start
- prompt preprocessing
- read guard checks
- read summaries
- compaction hooks

</details>

---

## Development notes

The current plugin is intentionally narrow.

It is not trying to be:

- an IDE replacement
- a linter
- a full repo automation framework
- a code generator by itself

It is specifically built to improve **Claude Code session quality** by controlling how context enters and survives the session.

### Strong next extension ideas

- search-first policy before large reads
- file hash tracking for smarter summaries
- repo map cache beyond top-level file extensions
- per-file-type telemetry and reduction reporting
- subagent budget control
- framework-aware repo instructions

---

## FAQ

### Does it rewrite my real files?
No. It changes how content is handled in Claude Code hooks. It does not rewrite workspace files just to save tokens.

### Does it always ask clarification questions?
No. It asks only when the request is still underspecified enough that starting to code would likely be wasteful.

### Does it work for new Claude Code sessions automatically?
Yes. Once installed and enabled, the hooks run automatically in new sessions.

### Can it help with large files?
Yes. That is one of its main jobs. It is especially useful for noisy logs, large JSON, CSV-like data, and other bulky text files where full reads are wasteful.

### Can it save 70% of token usage?
Sometimes, yes, especially on highly repetitive or noisy inputs. But that should be treated as a best-case scenario, not a guaranteed universal number.

---

## License

This project is licensed under the **MIT License**.

---

## Author

Built and maintained by **[Satyam Pandey](https://github.com/satyamamarpandey)**.

---

<div align="center">

### ClaudeTokenSAP

**Less waste. Better signal. Smarter Claude Code sessions.**

</div>
