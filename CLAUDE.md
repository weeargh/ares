# CLAUDE.md

ARES is an AI-native repository assessment product for Claude Code.

The primary workflow is the `/ares` Claude Code skill installed from npm. The
deterministic CLI scanner still exists, but it is now secondary support rather
than the core product.

## Core Commands

- `npm install`
- `npm run lint`
- `npm test`
- `npm run smoke`
- `npm run check`
- `node bin/ares.mjs install-skill`
- `node bin/ares.mjs . --md --out ares-report.md`

## Repository Structure

- `bin/ares.mjs`: CLI entry point, scanner flags, and Claude skill installer
- `src/claude-skill.mjs`: personal Claude Code skill installer
- `src/scanner.mjs`: top-level scan orchestration
- `src/profile.mjs`: repo-type detection and score weighting
- `src/workspaces.mjs`: monorepo workspace discovery
- `src/report.mjs`: terminal, markdown, and JSON report rendering
- `src/analyzers/*.mjs`: category-specific heuristics
- `skills/ares/`: bundled Claude Code skill, rubric, template, and helper scripts
- `test/*.test.mjs`: regression tests
- `test/fixtures/*.json`: fixture definitions for synthetic repo scans
- `scripts/smoke-cli.mjs`: CLI smoke test used in CI

## Working Rules

- Treat the `/ares` skill as the product surface. It should help Claude make a
  better assessment, not just restate filenames.
- Keep the deterministic scanner useful, inspectable, and offline. It is a
  support tool, not the product definition.
- Treat recommendations as product behavior. Generic advice is a bug when the
  repo archetype makes it low-value.
- Prefer explicit scoring logic and evidence-backed prompting over vague magic.
- TypeScript is optional future work here, not an automatic requirement for every change. Only propose a migration when the maintenance win is clearly worth the build/runtime complexity.
- When changing scoring, preserve the separation between:
  - analyzers (`src/analyzers`)
  - profile weighting (`src/profile.mjs`)
  - monorepo/package discovery (`src/workspaces.mjs`)

## Common Tasks

### Add or adjust a scoring heuristic

1. Update the relevant analyzer in `src/analyzers/`.
2. Add or update a regression test in `test/*.test.mjs`.
3. If the heuristic depends on repo shape, verify whether it belongs in analyzer logic or profile weighting.
4. Do not let the scanner masquerade as the final AI judgment used by `/ares`.

### Change the Claude Code assessment workflow

1. Update `skills/ares/SKILL.md` for behavior.
2. Update `skills/ares/rubric.md` if the scoring guidance changes.
3. Update `skills/ares/report-template.md` if the report shape changes.
4. Add or update tests around `src/claude-skill.mjs` or CLI install behavior.

### Tune repo-type behavior

1. Update detection or weights in `src/profile.mjs`.
2. Add a test that proves the detected type or weighted score.
3. Re-run `npm run check`.

### Add monorepo behavior

1. Keep root-level scoring and per-package scoring separate.
2. Add fixture coverage for the workspace shape.
3. Avoid recursively rescanning workspaces without an explicit guard.

## Conventions

- Use ASCII unless an existing file already requires otherwise.
- Keep files small and composable; avoid turning `scanner.mjs` into a grab bag.
- Prefer fixture-backed tests for scoring behavior so regressions are easy to reason about.
- Document new CLI flags in `README.md` and make sure the help text in `bin/ares.mjs` matches.

## Anti-Patterns

- Do not add sham configs just to inflate the score. ARES should reward useful repo hygiene, not box-checking.
- Do not make recommendations that only fit web apps or backend services when the repo is a small CLI or library.
- Do not hide breaking scoring changes inside broad refactors without tests.
- Do not turn `/ares` into a thin wrapper around deterministic heuristics. The
  intelligence needs to stay in the assessment.
