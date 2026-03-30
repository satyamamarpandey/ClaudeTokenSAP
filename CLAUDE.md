# Token Optimizer Plugin - Build Rules

## Goal
Build a production-ready Claude Code plugin that minimizes token usage across a session while preserving user control.

## Primary objectives
1. Create a Claude Code plugin, not a skill-only solution.
2. Keep startup context very small.
3. Automatically set up the project on first run.
4. Ask the user a few onboarding questions only once, then generate a short project-specific `CLAUDE.md`.
5. Use lightweight processing first whenever possible.
6. Respect user control for optional files like images, videos, and logs.

## Plugin requirements
The plugin must include:

- `.claude-plugin/plugin.json`
- `.claude/settings.json`
- `.claude/CLAUDE.md`
- `.claude/skills/token-optimizer/SKILL.md`
- `.claude/skills/token-optimizer/resources/ignore_rules.json`
- `hooks/instructions_loaded.py`
- `hooks/prompt_preprocess.py`
- `README.md`

## First-run onboarding
On the first session only:
1. Detect whether project onboarding is incomplete.
2. Ask the user a few short questions:
   - What are you building?
   - Who are the target users?
   - Which platforms are you targeting?
   - Which Claude model do you expect to use most?
   - Any important constraints or coding preferences?
3. Use the answers to generate a very short project-specific `CLAUDE.md`.
4. Save onboarding state so the questions are not asked again unless reset.

## CLAUDE.md generation rules
Generated `CLAUDE.md` must be short and high-signal.
It should include only:
- what is being built
- target users
- platforms
- preferred model strategy
- key constraints
- instruction to keep context usage low

Do not generate a long `CLAUDE.md`.

## settings.json rules
Use `.claude/settings.json` to define:
- deny rules for bulky folders and irrelevant generated content
- ask rules for files the user may still want to include

### Deny by default
Prefer denying:
- `node_modules`
- `dist`
- `build`
- `.next`
- `.cache`
- `coverage`
- archives and other bulky generated artifacts

### Ask instead of deny
Use `ask` for:
- images
- videos
- logs
- other user-controlled assets

Do not fully block files the user may intentionally want to include.

## Prompt preprocessing rules
The prompt hook must inspect large pasted content and choose the best compact representation.

### If JSON is flat and tabular
Convert to CSV.

### If JSON is nested or irregular
Do not convert to CSV.
Instead produce:
- small sample
- schema
- counts / key frequency / depth summary

### If JSON is large but not clearly tabular
Prune irrelevant keys and truncate long strings.

### If input is logs or command output
Return:
- first lines
- last lines
- error / warning summary
- concise metrics

## Mode selection rules
Use the following priority:
1. CSV for flat repeated records
2. sample + schema + counts for nested JSON
3. pruned JSON for large non-tabular JSON
4. log summary for logs / command output
5. pass-through if optimization is not needed

## Model usage strategy
Use the lightest possible approach first.

### Preferred order
1. Local deterministic preprocessing
2. Lightweight Claude Haiku-style processing for summarization or compact transformation
3. Heavier reasoning only when required

Do not use a stronger model for preprocessing if deterministic logic or lightweight summarization is enough.

## Token-saving rules
Always optimize for session-wide token reduction, not just single-prompt reduction.

Prioritize:
- smaller startup context
- narrow file reads
- deny/ask controls
- preprocessing before reasoning
- concise outputs
- avoiding repeated explanations
- preserving only useful context

## Skill usage
A small skill is allowed and recommended, but the plugin is the primary mechanism.
The skill should remain tiny and only explain how Claude should interpret:
- CSV
- sample + schema + counts
- pruned JSON
- log summaries

Do not move core enforcement into the skill alone.

## Implementation standards
- Keep code modular and readable.
- Prefer simple deterministic logic over overengineered solutions.
- Add comments only where they help.
- Avoid bloated files.
- Keep hooks robust and defensive.
- Make the plugin easy to test locally.

## Testing requirements
Support local testing for:
1. first-run onboarding
2. `.claude` folder creation
3. `settings.json` generation
4. `CLAUDE.md` generation
5. flat JSON to CSV conversion
6. nested JSON summary mode
7. log summarization
8. ask-vs-deny behavior
9. repeated session behavior without re-onboarding

## Output rules while building
When making progress:
- prefer exact file edits
- keep responses concise
- explain what changed and why
- do not dump unnecessary long text
- prioritize working implementation over theory

## Final quality bar
The plugin should feel production-ready for Claude Code token optimization.
It should maximize token savings while keeping user control and flexibility.
