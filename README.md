# ARES

Static repository scoring for AI coding agent readiness.

ARES scans a repository locally and scores observable signals such as docs,
tests, CI, environment setup, navigability, and agent-specific instructions.
It does not run the code, benchmark real task completion, or make claims about
team quality.

## Install

### npm

```bash
npm install -g ares-scan
ares --help
```

### GitHub

```bash
npm install -g github:weeargh/ares
ares --help
```

### Local checkout

```bash
git clone https://github.com/weeargh/ares.git
cd ares
npm install
npm install -g .
```

## Usage

```bash
ares <path>                     # Scan and print terminal output
ares <path> --md                # Save markdown report to ares-report.md
ares <path> --json              # Save JSON report to ares-report.json
ares <path> --out report.md     # Save to a specific file
ares <path> --type service      # Override repo type detection
ares <path> --category MRC,TEST # Run selected categories only
ares <path> --quiet             # Suppress terminal output
ares <path> --llm               # Optional: author markdown with your own LLM command
```

Examples:

```bash
ares .
ares . --md
ares . --json --out ares-report.json
ares ~/some-repo --type monorepo
```

## What It Measures

ARES scores 10 categories:

- `MRC`: Machine-Readable Context
- `NAV`: Codebase Navigability
- `TSC`: Type Safety & Interface Contracts
- `TEST`: Test Infrastructure
- `ENV`: Build & Dev Environment
- `MOD`: Modularity & Coupling
- `CON`: Code Consistency & Conventions
- `ERR`: Error Handling & Diagnostics
- `CICD`: CI/CD & Feedback Loops
- `AGT`: Agent-Explicit Configuration

It also detects a repo profile and applies different category weights for:

- `cli`
- `library`
- `app`
- `service`
- `monorepo`

Detailed scoring rules are documented in [docs/rubric.md](docs/rubric.md).

## What It Does

- scans locally without network access
- walks tracked and untracked repo files
- classifies files by role
- detects common language and tooling markers
- applies heuristic analyzers per category
- emits terminal, Markdown, or JSON output
- reports package summaries for monorepos

## What It Does Not Do

- run tests, builds, or the application
- benchmark real agent task completion
- perform deep semantic analysis
- replace code review, security review, or production review

## Output

Each scan returns:

- `overallScore`
- `rawOverallScore`
- rating band
- detected repo type and weighting profile
- per-category scores, findings, and recommendations
- monorepo package summaries when applicable

If the target has no scannable files, ARES reports:

- `Unscorable / Invalid Target`

instead of assigning a numeric score.

## Optional LLM Report Authoring

The score is computed without an LLM.

`--llm` is optional and only changes how the Markdown report is written. It
expects a command that reads a prompt from `stdin` and writes Markdown to
`stdout`.

Example:

```bash
ARES_LLM_COMMAND="your-llm-command" ares . --llm
```

## Programmatic Use

```js
import { generateMarkdown, scan } from "ares-scan";

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

## License

MIT
