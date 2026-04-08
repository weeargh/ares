# CLAUDE.md

ARES is a local-first CLI that scores how ready a repository is for AI coding agents.

## Core Commands

- `npm install`
- `npm run lint`
- `npm test`
- `npm run smoke`
- `npm run check`
- `node bin/ares.mjs . --md --out ares-report.md`

## Repository Structure

- `bin/ares.mjs`: CLI entry point and argument parsing
- `src/scanner.mjs`: top-level scan orchestration
- `src/profile.mjs`: repo-type detection and score weighting
- `src/workspaces.mjs`: monorepo workspace discovery
- `src/report.mjs`: terminal, markdown, and JSON report rendering
- `src/analyzers/*.mjs`: category-specific heuristics
- `test/*.test.mjs`: regression tests
- `test/fixtures/*.json`: fixture definitions for synthetic repo scans
- `scripts/smoke-cli.mjs`: CLI smoke test used in CI

## Working Rules

- Keep ARES deterministic. It should not require network access, hosted services, or a bundled LLM to score a repo.
- Treat recommendations as product behavior. Generic advice is a bug when the repo archetype makes it low-value.
- Prefer small, explicit heuristics over hidden magic. If a signal is important, make it inspectable in the findings.
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
- Do not introduce a hosted dependency for core scanning behavior.
