# ARES Rubric

ARES is a static, heuristic scoring system for repository readiness for AI
coding agents. It does not benchmark real task completion, runtime correctness,
or team maturity.

Use the score as an agentic-readiness estimate. The recommendations and
category breakdown are usually more important than the single number. A `10.0`
should be extremely rare and correspond to frontier-lab-grade repo quality for
autonomous coding agents.

## What ARES Scores

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

Each category produces:

- a `0.0–10.0` category score
- a list of findings with positive, neutral, or negative `impact`
- recommendations derived from the weakest signals

## Overall Score

### Step 1: Compute Category Scores

Each analyzer sums finding impacts, applies a category-specific normalization
formula, and clamps the result to `0–10`.

General pattern:

```text
category_score = clamp_0_10(round_1_decimal((sum_of_impacts + offset) * scale))
```

The `offset` and `scale` differ by category.

### Step 2: Apply Repo-Type Weights

ARES then applies repo-type weights to the 10 category scores:

```text
weighted_overall_score =
  round_1_decimal(sum(category_score * category_weight) / sum(category_weight))
```

It also reports:

- `rawOverallScore`: plain average of category scores before weighting
- `overallScore`: weighted average after repo-type weighting

### Step 3: Map To Rating Bands

- `0.0–3.4`: Fragile Repo Readiness
- `3.5–5.4`: Limited Repo Readiness
- `5.5–7.4`: Practical Repo Readiness
- `7.5–8.9`: Strong Repo Readiness
- `9.0–10.0`: Frontier-Grade Repo Readiness

## Repo Type Detection

ARES auto-detects repo type before weighting:

- `monorepo`: `pnpm-workspace.yaml`, `turbo.json`, package workspaces, or
  multiple `package.json` files
- `cli`: `package.json.bin`, `bin/` entrypoints, or CLI dependency markers
- `service`: backend framework dependencies or server/controller/api markers
- `app`: frontend/mobile framework dependencies or app/public/pages markers
- `library`: package export metadata or source layout fallback

If no stronger signal exists, ARES falls back to `library`.

### Size Classes

ARES also tracks a size class from source file count:

- `small`: `<= 25`
- `medium`: `<= 150`
- `large`: `> 150`

Some analyzers use size class to soften or strengthen recommendations.

## Repo-Type Weights

| Category | Default | CLI | Library | App | Service | Monorepo |
|----------|--------:|----:|--------:|---:|--------:|---------:|
| MRC | 1.20 | 1.25 | 1.15 | 1.15 | 1.15 | 1.15 |
| NAV | 1.10 | 1.25 | 1.10 | 1.05 | 1.05 | 1.20 |
| TSC | 0.90 | 0.70 | 1.10 | 0.95 | 1.00 | 0.95 |
| TEST | 1.25 | 1.15 | 1.20 | 1.20 | 1.25 | 1.20 |
| ENV | 1.25 | 1.00 | 1.00 | 1.25 | 1.30 | 1.25 |
| MOD | 1.20 | 0.95 | 1.10 | 1.10 | 1.20 | 1.30 |
| CON | 0.60 | 0.60 | 0.65 | 0.60 | 0.60 | 0.60 |
| ERR | 0.85 | 0.80 | 0.80 | 0.90 | 1.00 | 0.90 |
| CICD | 0.95 | 0.75 | 0.85 | 1.00 | 1.10 | 1.00 |
| AGT | 1.15 | 1.10 | 1.10 | 1.15 | 1.15 | 1.20 |

Interpretation:

- ARES now emphasizes agent success fundamentals over polish: context,
  validation, operability, change boundaries, and agent guidance.
- `CON` is intentionally de-emphasized. Style consistency matters, but it
  should not outweigh runability, safety, or feedback loops.
- Small CLIs get lighter weighting on TSC and CI, but not enough to excuse
  missing guidance or unclear workflows.
- Services and monorepos are judged more strongly on validation, operability,
  and blast-radius control.

## Category Formulas

These are the current normalization formulas after summing impacts.

| Category | Formula |
|----------|---------|
| MRC | `clamp((impact_sum) * 1.3)` |
| NAV | `clamp((impact_sum + 3) * 1.1)` |
| TSC | `clamp((impact_sum + 1.5) * 1.0)` |
| TEST | `clamp((impact_sum + 1.5) * 1.1)` |
| ENV | `clamp((impact_sum + 1) * 1.15)` |
| MOD | `clamp((impact_sum + 3) * 1.1)` |
| CON | `clamp((impact_sum + 3) * 1.15)` |
| ERR | `clamp((impact_sum + 1.5) * 1.0)` |
| CICD | `clamp((impact_sum + 1) * 1.1)` |
| AGT | `clamp((impact_sum) * 1.15)` |

Where `clamp` means:

```text
clamp(x) = min(10, max(0, round_to_1_decimal(x)))
```

## Detailed Category Signals

### MRC: Context & Intent

Measures whether the repo explains itself clearly.

Signals:

- README existence: `-3` if missing, `+1` if present
- README depth: `+1` if `> 500` words, `+0.5` if `> 200`
- README architecture/structure section: `+1.5`
- README setup/getting-started section: `+0.5`
- `CONTRIBUTING.md`: `+0.5`
- `docs/` docs count:
  - `+1.5` if `> 10`
  - `+1` if `> 3`
  - `+0.5` if `> 0`
- ADR files: `+0.5`
- API schemas (`OpenAPI`, `Swagger`, `GraphQL schema`, `.proto`): `+0.5`
- Agent instruction file (`CLAUDE.md`, `AGENTS.md`, etc.): `+1`

Normalization:

```text
score = clamp((impact_sum) * 1.3)
```

### NAV: Navigability & Discoverability

Measures whether an agent can find the right files quickly.

Signals:

- Files over `500` lines:
  - `+2` if none
  - `+1` if `<= 3`
  - `0` if `<= 10`
  - `-1` otherwise
- Files over `1000` lines:
  - `+0.5` if none
  - otherwise `-0.5 * min(count, 5)`
- Median source file size:
  - `+1` if `< 150`
  - `+0.5` if `< 300`
- Catch-all directories like `utils/`, `helpers/`, `common/`, `shared/`:
  - `+1` if none
  - `0` if `<= 2`
  - `-0.5` otherwise
- Test colocation:
  - `+1.5` if `> 80%`
  - `+1` if `> 50%`
  - `+0.5` if `> 20%`
- Max nesting depth:
  - `+0.5` if `<= 6`
  - `0` if `<= 10`
  - `-0.5` otherwise
- Dominant naming consistency:
  - `+1` if `> 80%`
  - `+0.5` if `> 60%`
- Barrel/entrypoint files (`index`, `mod`, `__init__`, `main`): `+0.5` if any

Normalization:

```text
score = clamp((impact_sum + 3) * 1.1)
```

### TSC: Contracts & Explicitness

Measures whether interfaces are explicit and machine-readable.

Signals:

- Inherently typed primary language (`rust`, `go`, `java`, `kotlin`, `csharp`,
  `swift`, `dart`): `+3`
- TypeScript dominant: `+2`
- Mixed TS/JS: `+1`
- Untyped JavaScript:
  - `0` for small CLIs
  - `-0.25` for small repos with decent tests
  - `-0.5` for medium repos
  - `-1` for larger riskier cases
- JavaScript surface area without TS:
  - `+0.75` if small
  - `+0.25` if medium
- JSDoc/type hint references in JS:
  - `+1` if `> 20`
  - `+0.5` if `> 5`
  - `+0.25` if `> 0`
- TypeScript strict mode:
  - `+2` for `strict: true`
  - `+1` for `noImplicitAny`
- Python type checking:
  - `+2` for strict mypy
  - `+1` for mypy configured
- Python type hints:
  - `+1` if `> 80%` of sample
  - `+0.5` if `> 50%`
- TypeScript `any` usage:
  - `+1.5` if none
  - `+0.5` if low
  - `0` if moderate
  - `-1` if heavy
- `@ts-ignore` / `@ts-expect-error`:
  - `+0.5` if none
  - `0` if `<= 5`
  - `-0.5` otherwise
- Python `# type: ignore`:
  - `+0.5` if none
  - `0` if `<= 10`
  - `-0.5` otherwise
- Runtime validation libraries: `+1`
- Pydantic in Python repos: `+1`

Normalization:

```text
score = clamp((impact_sum + 1.5) * 1.0)
```

### TEST: Validation Infrastructure

Measures whether automated validation exists and appears usable.

Signals:

- Test file count:
  - `-2` if none
  - `+0.5` if `< 5`
  - `+1` otherwise
- Test-to-source ratio:
  - `+2` if `> 0.8`
  - `+1.5` if `> 0.5`
  - `+1` if `> 0.3`
  - `+0.5` if `> 0.1`
- Test framework detected: `+1`
- Working `test` script in `package.json`: `+1`
- Broken or placeholder test script: `-0.5`
- `smoke` script: `+0.75`
- `check` script: `+0.75`
- Coverage config: `+0.5`
- Coverage report file: `+0.5`
- Test utilities:
  - `+1` if `> 3`
  - `+0.5` if `> 0`
- E2E/integration tests: `+0.5`

Normalization:

```text
score = clamp((impact_sum + 1.5) * 1.1)
```

### ENV: Local Operability

Measures reproducibility and setup friction.

Signals:

- `.env.example`:
  - `+1` if present
  - `-0.5` if `.env` files exist without an example
- Lockfile:
  - `+1` if present
  - `-0.5` if absent
- Docker/Compose:
  - `+1.5` for Compose
  - `+0.5` for Dockerfile only
- Devcontainer: `+1.5`
- Nix config: `+1`
- Task runner (`Makefile`, `justfile`, `Taskfile`): `+0.75`
- Setup/bootstrap script: `+0.5`
- Useful npm scripts:
  - `+0.25` for lint
  - `+0.25` for test
  - `+0.5` for check
  - `+0.25` for smoke
  - service/app only: `+0.25` for dev/start and `+0.25` for build
- Seed/fixture data: `+0.5`

Normalization:

```text
score = clamp((impact_sum + 1) * 1.15)
```

### MOD: Change Boundaries & Modularity

Measures whether scoped changes can remain scoped.

Signals:

- Top 5 files' code concentration:
  - `+1.5` if `< 10%`
  - `+1` if `< 20%`
  - `0` if `< 35%`
  - `-1` otherwise
- Cross-directory imports:
  - `+1.5` if `< 5%`
  - `+0.5` if `< 15%`
  - `0` if `< 30%`
  - `-1` otherwise
- Top-level directories with colocated tests:
  - `+1.5` if `> 70%`
  - `+0.5` if `> 40%`
- Oversized `service`/`manager`/`controller`/`handler` files:
  - `+1` if none
  - `0` if `<= 2`
  - `-1` otherwise
- Database access sprawl:
  - `+1` if `<= 2` directories
  - `0` if `<= 5`
  - `-0.5` otherwise
- Circular dependency note: `0` currently, informational only

Normalization:

```text
score = clamp((impact_sum + 3) * 1.1)
```

### CON: Conventions & Example Density

Measures whether the repo communicates coding patterns and workflow clearly.

Signals:

- Linter config:
  - `+1.5` if present
  - `-1` if absent
- Formatter config:
  - `+1` if present
  - `-0.5` if absent
- `.editorconfig`: `+0.5`
- Pre-commit hooks / lint-staged: `+1`
- Lint suppressions:
  - `+1` if none
  - `+0.5` if `< 20`
  - `0` if `< 50`
  - `-0.5` otherwise
- Multiple HTTP clients: `-0.5`
- Multiple logging stacks: `-0.5`

Normalization:

```text
score = clamp((impact_sum + 3) * 1.15)
```

### ERR: Diagnostics & Recoverability

Measures whether failures are visible, typed, and diagnosable.

Signals:

- Empty catch blocks:
  - `+2` if none
  - `+1` if `<= 3`
  - `0` if `<= 10`
  - `-1` otherwise
- Console logging:
  - `+1` if none
  - `+0.5` if structured logger exists
  - `0` if low console logging without structure
  - `-0.5` if heavy console logging without structure
- Custom error classes:
  - `+1.5` if `> 5`
  - `+1` if `> 0`
- Error codes: `+0.5`
- Result/Either patterns: `+1`
- Specific error types over generic `Error`:
  - `+1` if `> 60%`
  - `+0.5` if `> 30%`
- Validation patterns:
  - `+1` if `> 5`
  - `+0.5` if `> 0`

Normalization:

```text
score = clamp((impact_sum + 1.5) * 1.0)
```

### CICD: Automated Feedback Loops

Measures automated feedback loops and reliability signals.

Signals:

- CI presence:
  - `+1.5` if CI exists
  - `-0.5` if no CI but strong local feedback
  - `-1` if no CI with some local feedback
  - `-2` if no CI and no local feedback
- CI stage count:
  - `+2` if `>= 4`
  - `+1.5` if `>= 3`
  - `+1` if `>= 2`
  - `+0.5` if `>= 1`
- Security scanning in CI: `+0.5`
- Coverage reporting in CI: `+0.5`
- Preview deployments: `+0.5`
- Local executable feedback (`lint`, `test`, `smoke`, `check`):
  - `+2` if `4`
  - `+1.5` if `3`
  - `+1` if `2`
  - `+0.5` if `1`
- Pre-commit hooks: `+0.5`
- Dependency automation: `+0.5`
- `CODEOWNERS`: `+0.5`

Normalization:

```text
score = clamp((impact_sum + 1) * 1.1)
```

### AGT: Agent Guidance & Guardrails

Measures explicit investment in helping coding agents operate safely.

Signals:

- Canonical agent doc (`CLAUDE.md`, `AGENTS.md`):
  - `+2.5` if present
- Agent doc includes commands: `+1`
- Agent doc includes patterns/conventions: `+1`
- Agent doc includes anti-patterns: `+0.5`
- Agent doc includes common workflows/examples: `+0.5`
- Agent doc depth:
  - `+0.75` if `> 1000` words
  - `+0.5` if `> 500`
  - `+0.25` if `> 200`
- Cursor rules: `+0.25`
- Copilot instructions: `+0.25`
- Multi-agent support (2+ instruction systems): `+0.25`
- PR template: `+0.5`
- Code generators/scaffolding: `+0.5`

Normalization:

```text
score = clamp((impact_sum) * 1.15)
```

## Monorepos

For monorepos, ARES:

- detects workspace packages
- scans each package separately
- reports package summaries
- computes `packageAverageScore` from scorable packages only

The top-level repo still gets its own overall score with monorepo weights.

## Unscorable Targets

If ARES finds `0` scannable files, it reports:

- `rating: "Unscorable / Invalid Target"`
- `overallScore: null`
- `rawOverallScore: null`

This avoids assigning a misleading heuristic score to an empty or invalid path.

## Important Limits

- Static only: ARES does not execute builds, tests, or apps.
- Heuristic only: ARES uses patterns and file signals, not deep semantic
  understanding.
- Language support is uneven: some ecosystems still have deeper heuristic
  support than others, even though ARES increasingly tries to score intent and
  engineering capability rather than specific tool names.
- Recommendations are directional: they should be reviewed by a human before
  being treated as policy.
- The exact numeric score is less reliable than the category breakdown and top
  recommendations.
