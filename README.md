# ARES

**Repository Readiness for AI Coding Agents**

ARES is a local-first CLI that scores how ready a repository is for AI coding
agents such as Claude Code, Codex, Cursor, Copilot, and Devin.

It scans the repository's structure, docs, configs, and validation workflow,
then produces a static readiness score with actionable recommendations.

ARES is a **repo scorer**, not a hosted agent, not a benchmark harness, and not
a claim about company-level engineering maturity.

## What ARES Means by "10/10"

`10/10` means **Frontier-Grade Repo Readiness** based on observable repository
signals alone.

That means the repo looks exceptionally well-prepared for AI coding agents to:

- understand the codebase
- find the right files
- make scoped changes
- run validation
- recover from failures
- hand off work clearly

It does **not** mean:

- "this team is at Anthropic/OpenAI/Block level"
- agents are proven to succeed in production autonomously
- the repo is secure, correct, or release-ready in every way
- ARES has benchmarked real task completion

## What It Does

ARES currently:

- scans the repo locally with no API key or network requirement
- detects the repo archetype: `cli`, `library`, `app`, `service`, `monorepo`
- scores 10 categories relevant to AI coding agents
- produces terminal, Markdown, or JSON output
- surfaces concrete recommendations instead of a score alone
- stays heuristic and fast enough to run as part of normal development

## What It Does Not Do

ARES does not:

- run a live agent benchmark
- execute your tests, builds, or app runtime
- understand code semantically as deeply as a full AST + runtime analyzer
- replace human code review
- replace security review, architecture review, or production readiness review
- guarantee that a higher score means better product quality

## Who It Is For

ARES is useful for:

- repo maintainers preparing a codebase for Claude Code, Codex, or similar tools
- teams deciding where to harden a repo before enabling agent-driven changes
- consultants auditing engineering environments for AI coding adoption
- authors of CLIs, libraries, services, apps, and monorepos who want a fast
  readiness snapshot

ARES is less useful if you want:

- a benchmark of actual agent task success
- a security scanner
- a code quality tool that executes and verifies runtime behavior
- a replacement for CI, tests, or human review

## Package Name vs Command Name

ARES currently ships as:

- npm package: `ares-scan`
- CLI binary: `ares`

That means typical usage is:

```bash
# Run directly from npm
npx ares-scan .

# Or install globally
npm install -g ares-scan
ares .
```

## Quick Start

```bash
# Scan the current repo and print the terminal report
npx ares-scan .

# Save the Markdown report
npx ares-scan . --md

# Save the JSON report
npx ares-scan . --json --out ares-report.json

# Force a scoring profile if auto-detection is wrong
npx ares-scan . --type service
```

## Typical Workflow

### From a Terminal

```bash
npx ares-scan . --md
```

This writes `ares-report.md`, which you can read directly or hand to another
tool.

### From Claude Code or Codex

Ask the agent to run:

```bash
npx ares-scan . --md
```

Then ask it to summarize `ares-report.md` or address the highest-impact gaps.

ARES itself does the scoring. Your coding agent reads the report and helps act
on it.

## What the Report Includes

Each scan includes:

- overall repository readiness score from `0.0` to `10.0`
- rating band, such as `Practical Repo Readiness`
- detected repo type and scoring profile
- category-by-category scores and findings
- top recommendations
- workspace package summaries for monorepos

## Scoring Model

ARES scores 10 categories:

| # | Category | Code | What It Measures |
|---|----------|------|------------------|
| 1 | Machine-Readable Context | MRC | Can an agent understand what the repo is and how to work in it? |
| 2 | Codebase Navigability | NAV | Can an agent find the right files without reading everything? |
| 3 | Type Safety & Contracts | TSC | Can an agent infer interfaces without guesswork? |
| 4 | Test Infrastructure | TEST | Can an agent validate changes with trustworthy automated checks? |
| 5 | Build & Dev Environment | ENV | Can an agent install, build, and run the project with low friction? |
| 6 | Modularity & Coupling | MOD | Can an agent change one area without surprising unrelated areas? |
| 7 | Code Consistency | CON | Can an agent infer the expected style and workflow from the repo itself? |
| 8 | Error Handling | ERR | When something breaks, does the repo help the agent recover? |
| 9 | CI/CD & Feedback | CICD | Does the repo provide reliable automated feedback loops? |
| 10 | Agent-Explicit Config | AGT | Has the repo invested in explicit instructions for coding agents? |

### Repo-Type-Aware Scoring

ARES changes category weighting based on repo archetype.

Examples:

- a tiny CLI is not judged like a production backend service
- a service is held to a higher bar for environment and feedback loops
- a monorepo gets package discovery and workspace summaries

This keeps the standard aligned to the same question:

> How easy is this repository for an AI coding agent to understand, change,
> validate, and hand off safely?

## Score Interpretation

| Range | Rating | Meaning |
|-------|--------|---------|
| 0.0-2.9 | Fragile Repo Readiness | Agents are likely to stall or make unsafe changes without substantial human help. |
| 3.0-4.9 | Limited Repo Readiness | Agents can make progress, but still need close guidance and correction. |
| 5.0-6.9 | Practical Repo Readiness | Agents can handle routine tasks with guidance and validation. |
| 7.0-8.4 | Strong Repo Readiness | Agents can complete most scoped tasks independently. |
| 8.5-10.0 | Frontier-Grade Repo Readiness | Repo exhibits frontier-grade static readiness for AI coding agents. |

## Suitability

ARES is a good fit when:

- you want to compare repo readiness across projects
- you are preparing a repo for AI-assisted coding
- you want a fast, explainable, local-first score
- you want concrete hardening recommendations instead of vague advice

ARES is not the right tool when:

- you need execution-based proof that agents succeed on real tasks
- you need runtime profiling, benchmarking, or production diagnostics
- you need a security scanner or dependency vulnerability audit
- you need language-specific semantic analysis beyond heuristic signals

## CLI Options

```bash
ares <path>                     # Scan and print to terminal
ares <path> --md                # Save Markdown report (ares-report.md)
ares <path> --json              # Save JSON report (ares-report.json)
ares <path> --out report.md     # Save to a specific file
ares <path> --type cli          # Force the scoring profile
ares <path> --category MRC,TEST # Scan only specific categories
ares <path> --quiet             # Suppress terminal output
ares <path> --llm               # Optional: author Markdown with your own LLM command
```

## Optional BYO LLM Output

ARES does not ship with its own hosted model.

If you want the final Markdown report authored by an LLM you already use, you
can pass a local command that:

1. reads a prompt from `stdin`
2. writes Markdown to `stdout`

Example:

```bash
ARES_LLM_COMMAND="your-llm-command" ares . --llm
```

This is optional. The core product remains the static scan and score.

## How It Works

ARES currently works by:

1. walking the file tree
2. classifying files by role such as source, test, config, docs, and CI
3. detecting languages and common tooling
4. applying pattern-based analyzers
5. weighting category scores by repo archetype
6. generating a terminal, Markdown, or JSON report

It is designed to be fast, legible, and easy to reason about.

## Current Limits

ARES is intentionally honest about its limits:

- **Static only.** It does not benchmark real agent task success.
- **Heuristic, not full semantic analysis.** It relies on patterns, configs, and
  repo structure, not full AST or runtime inspection.
- **No command execution.** It checks whether workflows appear to exist, not
  whether they always succeed in every environment.
- **Language depth is uneven.** JavaScript and TypeScript have the deepest
  support today. Other languages are shallower.
- **Monorepo support is still early.** Workspace packages are discovered and
  summarized, but package dependency graphs are not implemented yet.
- **Recommendation quality depends on observable signals.** ARES can tell that a
  README exists more reliably than it can judge whether the README is excellent.

## Development

```bash
npm install
npm run lint
npm test
npm run smoke
npm run check
```

This repo includes:

- Biome for linting and formatting
- GitHub Actions CI for lint, tests, and CLI smoke tests
- Dependabot for npm and GitHub Actions updates
- `CLAUDE.md` for contributor and agent instructions

## Programmatic API

```javascript
import { generateMarkdown, scan } from "ares-scan";

const result = scan("/path/to/repo");

console.log(result.overallScore);
console.log(result.rating);

const markdown = generateMarkdown(result);
```

## Roadmap Direction

Likely future improvements include:

- better calibration across more repo types
- deeper monorepo analysis
- richer language support
- more precise semantic analysis
- optional deeper assessment modes

## License

MIT
