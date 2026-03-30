# Contributing to Token Optimizer

Thanks for your interest in improving Token Optimizer!

## Setup

```bash
git clone https://github.com/satyamamarpandey/ClaudeTokenSAP
cd token-optimizer
# No npm install needed - zero dependencies
```

## Project structure

```
hooks/          Hook scripts (Node.js, run by Claude Code)
lib/            Shared compression utilities
.claude/        Template copied into user projects on first run
.claude-plugin/ Marketplace manifest
```

## Testing locally

Copy the plugin into Claude Code's plugins directory:

```bash
# Windows
xcopy /E /I . "%APPDATA%\Claude\plugins\token-optimizer"

# macOS / Linux
cp -r . ~/.config/Claude/plugins/token-optimizer
```

Restart Claude Code, then paste a large JSON blob or log output - you should see the savings banner.

**Test cases to verify:**
1. Flat JSON array (5+ identical-key objects) → `flat array → CSV` banner
2. Nested JSON object → `nested JSON → summary` banner
3. 50+ lines with timestamps → `log output → summary` banner
4. Markdown with lots of blank lines → `plain text → condensed` banner
5. Delete `.claude/.onboarding_complete` → onboarding questions reappear

## Making changes

- All compression logic lives in `lib/compress.js` - add new strategies there first
- Hooks import from `lib/compress.js` - keep hooks thin
- Always add a `return` after emitting output in `prompt_preprocess.js` to prevent fall-through
- Never break the `process.exit(0)` safety - hooks must never block Claude

## Submitting a PR

1. Fork the repo and create a feature branch
2. Test all 5 test cases above manually
3. Update `CHANGELOG.md` under `[Unreleased]`
4. Open a PR with a clear description of what changed and why

## License

By contributing, you agree your changes will be licensed under the [MIT License](LICENSE).
