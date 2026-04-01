# Privacy Policy

**Effective date:** March 31, 2026

This Privacy Policy explains how **ClaudeTokenSAP** handles information when you install and use the plugin.

## Privacy-first design

ClaudeTokenSAP is built with a **local-first and privacy-first approach**.

By default:

- no personal data is collected
- no data is sent to external servers operated by the plugin author
- no telemetry or analytics is enabled
- all optimization happens locally inside Claude Code hooks

## What the plugin processes

To optimize Claude Code sessions, the plugin may locally process:

- user prompts
- logs and command output
- JSON, CSV, and text files
- grep / search results
- temporary session summaries
- compaction memory
- debug traces

This processing is used only for:

- reducing token usage
- compressing noisy content
- improving context quality
- preserving session continuity

## Local storage

The plugin may create temporary local files such as:

- `.claude/`
- debug logs
- temporary state files
- hook metadata
- deduplication trackers

These remain fully under the user’s control.

## No external transmission

ClaudeTokenSAP does **not** transmit prompts, files, logs, or session data to any external service managed by the plugin author.

No cloud database, analytics platform, telemetry system, or third-party tracking service is used.

## Third-party platform

ClaudeTokenSAP runs inside **Claude Code**, which is provided by Anthropic.

Use of Claude Code itself is subject to Anthropic’s own privacy policy and terms.

This privacy policy applies specifically to **ClaudeTokenSAP**.

## Open source transparency

The source code is publicly available:

https://github.com/satyamamarpandey/ClaudeTokenSAP

Users can inspect all processing logic directly.

## User control

Users retain complete control over:

- installation
- removal
- generated files
- local logs
- optimization hooks
- temporary summaries

Removing the plugin stops all processing by ClaudeTokenSAP.

## Contact

For privacy-related questions, please contact:

**Satyam Pandey**  
**Email:** satyamamarpandey@gmail.com
