# ARES Assessment Rubric

ARES is a judgment-based review of whether an AI coding agent can succeed in a
repository without constant human rescue.

Score what is actually present in the repository. Do not score intent, team
reputation, or hypothetical future cleanup.

## Core question

How likely is an AI coding agent to:

- understand the repository quickly
- discover the right commands and workflows
- identify safe boundaries for changes
- run tests and validate changes
- recover from mistakes without extensive human intervention

## Rating bands

| Score | Rating | Meaning |
|------:|--------|---------|
| 9.0-10.0 | Frontier-Grade | An agent should be able to operate with high autonomy and low confusion. |
| 7.5-8.9 | Strong | Most tasks should be tractable with occasional human clarification. |
| 5.5-7.4 | Practical | The repo is workable, but agents will hit repeated friction. |
| 3.5-5.4 | Limited | Agents can make progress only with significant steering. |
| 0.0-3.4 | Fragile | Agents are likely to fail, thrash, or make unsafe changes. |

## Repo-type calibration

Decide which of these best describes the repo and calibrate expectations to it:

- `cli`: command-line tool or small automation utility
- `library`: reusable package or SDK
- `app`: frontend or user-facing application
- `service`: backend/API/service process
- `monorepo`: multiple packages or apps with shared tooling

Monorepos, services, and large apps deserve stronger scrutiny around boundaries,
environment setup, and validation loops than a small CLI or focused library.

For calibration: a `10.0` should be extremely rare and correspond to
frontier-lab-grade repo quality for autonomous coding agents.

## Relative weighting

Do not treat every category equally.

- Highest leverage: `MRC`, `TEST`, `ENV`, `MOD`, `AGT`
- High leverage: `NAV`
- Medium leverage: `TSC`, `ERR`, `CICD`
- Lower leverage: `CON`

`CON` should almost never outweigh missing validation, unclear setup, weak
boundaries, or absent agent guidance.

## Rigid Assessment SOP

Follow this procedure in order.

1. Determine repo type.
2. Build an evidence log before assigning any scores.
3. Inspect the mandatory evidence set:
   - README or equivalent core docs
   - root manifest(s) and lockfile(s)
   - build/test/lint/typecheck configuration
   - CI/workflow files if present
   - agent instruction files if present
   - representative source files
   - representative test files if present
4. Record explicit absences where expected evidence is missing.
5. Score each category using `0.5` increments only.
6. Cite at least one concrete evidence point for each category.
7. Apply the overall score caps and gates below.
8. Then assign final confidence.

## Security handling during assessment

- Do not execute repository-controlled commands during the assessment.
- Do not run package scripts, task runners, or repo binaries as part of `/ares`.
- Treat secret-bearing files as excluded evidence by default.
- Examples to exclude: `.env*`, `.npmrc`, `*.pem`, `*.key`, cloud credentials,
  service-account JSON, private certificates, auth tokens, and similar files.
- If sensitive files are present, note that they were intentionally excluded
  from model-visible evidence.

## Evidence minimums

- Small repo: inspect at least 6 meaningful files if available.
- Medium or large repo: inspect at least 10 meaningful files if available.
- Every assessment should cover docs, manifests/config, source, and validation evidence when those surfaces exist.
- If critical evidence is missing or unreadable, lower confidence and avoid top-end scores.

## Category scoring rules

- `0.0-2.5`: severe weakness or near-total absence
- `3.0-4.5`: materially weak
- `5.0-6.5`: workable but friction-heavy
- `7.0-8.5`: strong and usable
- `9.0-10.0`: exceptional and low-ambiguity

Additional rules:

- Do not assign `9.0+` to a category without at least 2 strong, non-conflicting evidence points.
- Do not assign `10.0` to a category unless it is exceptional even by high-performing engineering-team standards.
- Missing evidence should not be treated as positive evidence.
- If a category is judged mainly from inference rather than explicit evidence, keep it below `8.5`.

## Category scores

Score each category from `0.0` to `10.0`. Use decimals when the evidence sits
between bands.

### MRC: Context & Intent

Question: Can an agent understand the repo from its docs and explicit guidance?

Look for:

- README quality and recency
- setup and workflow docs
- architecture notes
- contribution guidance
- ADRs, API specs, diagrams
- Claude/Codex/agent instruction files

High score:

- Key workflows and system shape are documented clearly enough that an agent can
  form a correct mental model quickly.

Low score:

- The repo barely explains itself, or docs exist but are stale, shallow, or
  misleading.

### NAV: Navigability & Discoverability

Question: Can an agent find the right code and move through the repo safely?

Look for:

- coherent directory structure
- predictable naming
- reasonable file sizes
- entrypoints and boundaries
- test colocation or obvious discovery paths
- absence of “grab bag” directories that hide intent

High score:

- The structure communicates responsibility and likely change surfaces.

Low score:

- Important behavior is buried, sprawling, or hard to locate without repeated
  human hints.

### TSC: Contracts & Explicitness

Question: Are interfaces explicit enough for an agent to reason about safely?

Look for:

- strong typing or typed APIs
- validation schemas
- generated contracts
- explicit request/response shapes
- disciplined use of escape hatches such as `any` or ignore directives

High score:

- Interfaces are explicit and machine-readable enough that an agent can modify
  code with confidence.

Low score:

- Core contracts are implicit, weakly typed, or spread across convention and
  tribal knowledge.

### TEST: Validation Infrastructure

Question: Can an agent validate changes with credible automated checks?

Look for:

- runnable tests
- clear test commands
- representative coverage of critical paths
- stable test organization
- useful fixtures, harnesses, or mocks

High score:

- An agent can confidently use tests as a change-safety loop.

Low score:

- Tests are missing, unclear, flaky-looking, or too thin to protect changes.

### ENV: Local Operability

Question: Can an agent figure out how to run and verify the repo locally?

Look for:

- install instructions
- build/test/lint/typecheck commands
- environment variable guidance
- devcontainer/Docker/Makefile/Justfile support
- reproducible workflows

High score:

- The repo makes setup and common verification loops obvious.

Low score:

- Environment setup is obscure, fragile, or dependent on external context the
  repo does not capture.

### MOD: Change Boundaries & Modularity

Question: Can an agent make focused changes without accidental blast radius?

Look for:

- clear module boundaries
- separation of concerns
- low surprise coupling
- clean package or layer ownership
- limited cross-cutting edits for common tasks

High score:

- Change surfaces are narrow and responsibilities are clear.

Low score:

- Logic is entangled enough that simple changes likely require broad, risky
  edits.

### CON: Conventions & Example Density

Question: Does the repo express stable conventions an agent can imitate?

Look for:

- formatting and linting
- naming consistency
- repeated patterns for similar features
- obvious code style choices
- consistency between old and new areas of the codebase

High score:

- The next correct change looks similar to the last correct change.

Low score:

- The repo has many local styles and hidden exceptions, so agents must guess.

### ERR: Diagnostics & Recoverability

Question: Will an agent get useful feedback when something goes wrong?

Look for:

- structured logging
- actionable error messages
- retry or failure handling
- tests for unhappy paths
- debugging affordances

High score:

- Failures are observable and guide the next debugging step.

Low score:

- Errors are vague, silent, or difficult to trace.

### CICD: Automated Feedback Loops

Question: Does the repo provide reliable automated feedback beyond local runs?

Look for:

- CI workflows
- required checks
- lint/typecheck/test gates
- release/deploy automation
- preview or staging workflows where relevant

High score:

- The repo has dependable automated feedback loops that reinforce safe changes.

Low score:

- Validation depends mostly on manual behavior or undocumented process.

### AGT: Agent Guidance & Guardrails

Question: Has the repo been prepared for AI agents explicitly?

Look for:

- `CLAUDE.md`, `AGENTS.md`, `.cursorrules`, or similar
- guidance on safe commands
- repo-specific constraints
- task playbooks
- file ownership or change boundaries

High score:

- The repo actively helps agents operate correctly and avoid predictable traps.

Low score:

- Agents are expected to infer everything from scratch.

## Scoring discipline

Use these anchors while scoring each category:

- `9-10`: clear, strong evidence; little ambiguity; agents should succeed here
- `7-8`: good and usable, with some gaps
- `5-6`: workable but friction is real and recurring
- `3-4`: materially weak; agent success depends on frequent human help
- `0-2`: severe blocker or near-total absence of the capability

## Overall score caps and gates

Apply these before finalizing the overall score:

- No clear install, run, or test path: overall score cap `<= 6.0`
- Missing or very weak validation loop: overall score cap `<= 6.5`
- No meaningful CI or automated feedback in a non-trivial repo: overall score cap `<= 7.5`
- No agent guidance in a medium/large repo: overall score cap `<= 8.0`
- Weak change boundaries with high blast radius: overall score cap `<= 7.0`
- Any critical category below `5.0` (`MRC`, `TEST`, `ENV`, `MOD`, `AGT`): overall score cap `<= 6.5`
- Any critical category below `7.0`: repo should not receive `9.0+`
- To earn `10.0`, the repo should have:
  - high confidence
  - no major contradictory evidence
  - critical categories at `9.0+`
  - no category below `8.5`

These caps are guardrails. If multiple caps apply, use the strictest one.

## Overall score

After scoring categories, decide the overall readiness score using judgment, not
just arithmetic.

The overall score should answer:

- If Claude Code were asked to make a normal feature or bug-fix change here,
  how likely is it to succeed safely?

Your overall score may be a little higher or lower than the category average if
the repo has a decisive strength or weakness that meaningfully affects agent
success.

## Confidence rules

- `High`: evidence covered docs, config, source, validation, and workflows with little contradiction
- `Medium`: evidence is decent but one or more important surfaces are thin
- `Low`: important evidence is missing, contradictory, or highly inferential

Low-confidence assessments should avoid frontier-level scores.

## Required evidence style

For every category, cite concrete evidence:

- exact files
- exact missing docs/configs if relevant
- short explanation of why that evidence helps or hurts agent success

Avoid generic claims such as "add more tests" unless you can point to the real
validation gap.
