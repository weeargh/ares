# ARES

AI-native codebase assessment for Claude Code.

ARES installs a `/ares` skill into Claude Code, then gives Claude a structured
playbook for reviewing a repository the way an experienced agentic-readiness
reviewer would. The main product is not a lint pass. It is a rubric-driven,
evidence-backed repo assessment that ends with:

- a short summary inside Claude Code
- a full markdown report written into the repository

ARES also keeps the original deterministic local scanner as a secondary tool for
teams that want an offline structural pass or machine-readable baseline output.

## Install

```bash
npm install -g ares-scan
```

If the npm package is not yet published or you want the latest GitHub version:

```bash
npm install -g github:weeargh/ares
```

The npm install automatically installs a personal Claude Code skill at:

```bash
~/.claude/skills/ares
```

If you need to reinstall or refresh it manually:

```bash
ares install-skill
```

## Public Usage

Once installed, a user can open Claude Code in any repository and run:

```text
/ares
```

That triggers the bundled ARES skill from `~/.claude/skills/ares`, produces a
short in-chat assessment summary, and writes a full markdown report into the
repo.

## Claude Code Workflow

Open Claude Code in a repository and run:

```bash
/ares
/ares docs/agentic-readiness.md
```

What `/ares` does:

- inspects the current repository with Claude Code tools
- reads the important files and configs
- scores the repo against the ARES rubric
- explains strengths, weaknesses, and likely agent failure modes
- writes a full local markdown report

Default report path: `ares-report.md`

## How The Assessment Works

ARES is designed around judgment, not just file detection.

The bundled `/ares` skill tells Claude to:

1. generate a compact repository snapshot
2. inspect the highest-signal files
3. evaluate the repo against the ARES rubric
4. produce a concise in-chat verdict
5. write a full markdown report into the repo

The rubric asks questions like:

- Can an AI coding agent understand this repo quickly?
- Can it discover how to run, test, and change the code safely?
- Are the boundaries, workflows, and instructions explicit enough?
- How likely is Claude Code to succeed here without constant human rescue?

The assessment uses evidence from the actual repository and is expected to cite
real files in the report.

## Deterministic Scanner

The shell CLI remains available if you want a local structural scan alongside
the AI-native review.

```bash
ares scan <path>                # Scan and print terminal output
ares <path> --md                # Alias: save markdown report to ares-report.md
ares <path> --json              # Save JSON report to ares-report.json
ares <path> --out report.md     # Save to a specific file
ares <path> --type service      # Override repo type detection
ares <path> --category MRC,TEST # Run selected categories only
ares <path> --quiet             # Suppress terminal output
ares <path> --llm               # Optional: author scanner markdown with your own LLM command
```

Examples:

```bash
ares scan .
ares . --md
ares . --json --out ares-report.json
```

## Rubric Categories

ARES scores 10 categories:

- `MRC`: Context & Intent
- `NAV`: Navigability & Discoverability
- `TSC`: Contracts & Explicitness
- `TEST`: Validation Infrastructure
- `ENV`: Local Operability
- `MOD`: Change Boundaries & Modularity
- `CON`: Conventions & Example Density
- `ERR`: Diagnostics & Recoverability
- `CICD`: Automated Feedback Loops
- `AGT`: Agent Guidance & Guardrails

The Claude Code skill uses these categories as judgment prompts. The
deterministic scanner uses the scoring rules in
[docs/rubric.md](docs/rubric.md).

## What `/ares` Produces

Inside Claude Code:

- overall score and rating
- strongest areas
- biggest risks
- first fixes to make

Written to the repo:

- executive summary
- category-by-category scorecard
- strengths and gaps
- likely agent failure modes
- prioritized fixes
- safe starting commands for future agents

## What The Scanner Does

- scans locally without network access
- walks tracked and untracked repo files
- classifies files by role
- detects common language and tooling markers
- applies heuristic analyzers per category
- emits terminal, Markdown, or JSON output
- reports package summaries for monorepos

## What ARES Does Not Claim

- It does not guarantee task success.
- It does not replace code review, security review, or runtime validation.
- The scanner does not run the application.
- The `/ares` skill should only claim what it can support with repo evidence.

## Optional Scanner LLM Report Authoring

The deterministic scanner computes its score without an LLM.

`--llm` only changes how the scanner markdown report is written. It expects a
command that reads a prompt from `stdin` and writes Markdown to `stdout`.

Example:

```bash
ARES_LLM_COMMAND="your-llm-command" ares . --llm
```

## Programmatic Use

```js
import { generateMarkdown, installClaudeSkill, scan } from "ares-scan";

installClaudeSkill();

const result = scan("/path/to/repo");
console.log(result.overallScore);
console.log(result.rating);

const markdown = generateMarkdown(result);
```

## Development

```bash
npm install
npm run lint
npm test
npm run smoke
npm run check
```

## Release

This repo is set up to publish `ares-scan` from GitHub Actions.

Typical release flow:

```bash
npm run check
npm version patch --no-git-tag-version
git push origin main
```

The publish workflow on `main` will:

- run lint, tests, and smoke checks
- create a git tag and GitHub release
- publish the new npm version if that version is not already on npm

## License

MIT
