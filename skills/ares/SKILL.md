---
name: ares
description: Run an AI-native codebase assessment for the current repository. Use when the user wants an agentic-readiness review, wants to know whether Claude Code can understand and modify the repo safely, or wants a scored markdown assessment report written into the repo.
argument-hint: [report-path]
disable-model-invocation: true
allowed-tools: Read Grep Glob LS Write Bash(node "${CLAUDE_SKILL_DIR}/scripts/repo-context.mjs" *)
---

# ARES

Use ARES when the user wants a real repository assessment, not a lint-style scan.
Your job is to review the repository the way an experienced AI-native code reviewer would:

1. Inspect the codebase structure and the highest-signal files.
2. Judge the repo against the ARES rubric in `rubric.md`.
3. Produce two outputs:
   - a short in-chat summary
   - a full markdown report written into the repository

Use the bundled report structure in `report-template.md`.

## Default output path

- If the user passed an argument, treat it as the report path relative to the current repo root.
- If no argument was passed, write the report to `ares-report.md`.
- Never write outside the current repository.
- Reject absolute paths and parent traversal such as `../`.

## Repository snapshot

Start from this snapshot, then inspect the most important files it points you to. Do not stop at filenames; validate claims by reading file contents.

```!
node "${CLAUDE_SKILL_DIR}/scripts/repo-context.mjs" .
```

## Assessment rules

- This is a judgment-based review. Do not outsource the score to filenames alone.
- Use evidence from real files: docs, manifests, configs, workflows, representative source files, and representative tests.
- Focus on whether an AI coding agent can understand, run, test, and modify the repo safely with limited human rescue.
- Calibrate expectations to the repo type. A small CLI and a large monorepo should not be judged by the same practical bar.
- Missing polish is not the same as blocked agent progress. Score based on actual operating friction.
- Call out uncertainty explicitly when the evidence is thin.
- Use `0.5` score increments for category scores and the overall score. Avoid false precision.
- Do not execute repository-controlled commands or scripts as part of the assessment.
- Do not run package scripts, task runners, builds, tests, or repo binaries during `/ares`.
- Never open or quote secret-bearing files such as `.env`, `.npmrc`, private keys, cloud credentials, or other credential/config material that appears sensitive.

## Non-Negotiable SOP

1. Read `rubric.md`.
2. Read `report-template.md`.
3. Build an evidence log before scoring anything.
4. Inspect the mandatory evidence set from the snapshot:
   - README / core docs
   - agent instructions such as `CLAUDE.md` or `AGENTS.md`
   - root manifest(s) and lockfile(s)
   - build, test, lint, and typecheck config
   - CI / workflow files
   - at least 2 representative core source files
   - at least 1 representative test file if tests exist
5. For medium or large repos, extend the inspection set:
   - at least 3 representative source files
   - at least 2 representative tests if tests exist
   - at least 1 additional workflow/config file
6. If an expected evidence type is absent, record that absence explicitly in the report instead of silently skipping it.
7. If a file appears secret-bearing or credential-like, skip it and record that it was intentionally excluded from model-visible evidence.
8. Score every rubric category from `0.0` to `10.0` using `0.5` increments only.
9. For each category, cite at least one concrete evidence point:
   - an exact file path
   - or an explicit absence such as "no CI workflow found"
10. Do not award `9.0+` to a category unless there are at least 2 strong, non-conflicting evidence points for it.
11. Apply the overall score caps from `rubric.md` before finalizing the overall score.
12. Decide the final overall readiness score and rating using the rubric guidance.
13. Write the full report locally.
14. Reply in chat with a compact summary:
   - overall score and rating
   - 3 strongest areas
   - 3 biggest risks
   - first fixes to make
   - a clickable markdown file link to the saved report

## Evidence discipline

- Keep a running evidence log while reading.
- Prefer direct file evidence over inference.
- If you infer something from structure or naming rather than explicit docs/config, say that it is an inference.
- If evidence coverage is thin, reduce confidence and avoid top-end scores.
- Treat secret-bearing files as out of scope for model inspection unless the user explicitly asks for secret review.

## Score discipline

- Category scores should follow the rubric anchors, not your general vibe.
- `9.0+` means clearly strong, repeatable evidence with little ambiguity.
- `10.0` should be extremely rare.
- If setup, validation, or agent guidance is materially weak, do not let polish in other areas inflate the overall score.

## Report requirements

- Keep the full report concrete and evidence-backed.
- Reference exact files whenever possible.
- Present the saved report path as a markdown file link using an absolute filesystem target, for example `[ares-report.md](/absolute/path/to/repo/ares-report.md)`.
- Include strengths, weaknesses, likely agent failure modes, and practical fixes.
- Make the recommendations sequenced, not generic.
- If the repo is obviously missing enough structure to assess reliably, say so and explain the limiting factors.
- Explicitly note any applied score cap or gating reason.
