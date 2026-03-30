# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.2.x   | Yes       |
| < 1.2   | No        |

## Reporting a Vulnerability

**Please do not report security vulnerabilities via public GitHub issues.**

If you discover a security vulnerability in Token Optimizer, please report it by opening a [GitHub Security Advisory](https://github.com/satyamamarpandey/ClaudeTokenSAP/security/advisories/new) on this repository.

Include as much detail as possible:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

You will receive a response within **72 hours** acknowledging receipt. We aim to release a fix within **7 days** for critical issues.

## Scope

This plugin runs locally as Node.js hook scripts inside Claude Code. It:
- Reads stdin from Claude Code hook events (never from user files directly)
- Writes stdout back to Claude Code (never to a network endpoint)
- Reads `.claude/settings.json` and `.claudeignore` from the current working directory
- Has no network access, no npm dependencies, and no external API calls

Out of scope: issues in Claude Code itself, Node.js runtime, or the user's operating system.
