# ARES Assessment: <repo-name>

## Executive Summary

- **Overall Score:** `<score>/10`
- **Rating:** `<rating>`
- **ARES Version:** `ARES <version>`
- **Repo Type:** `<repo-type>`
- **Assessment Confidence:** `High | Medium | Low`
- **Assessment Mode:** `static | verified | benchmarked`
- **Task Ceiling:** `localized | cross-module | operational | autonomous`
- **Applied Caps/Gates:** `<none | list score caps applied>`
- **Report Path:** `[<path>](/absolute/path/to/report.md)`

Short paragraph covering whether an AI coding agent is likely to understand,
run, test, and modify this repo safely.

## Quick Verdict

- **Why this repo is workable for an agent:** `<1-3 concise bullets>`
- **Why this repo will cause agent thrash:** `<1-3 concise bullets>`

## Evidence Coverage

- **Docs inspected:** `<files>`
- **Manifests/config inspected:** `<files>`
- **Source inspected:** `<files>`
- **Tests inspected:** `<files or none found>`
- **Automation/CI inspected:** `<files or none found>`
- **Agent guidance & tooling inspected:** `<instruction files (AGENTS.md/CLAUDE.md), MCP config, .claude/ toolkit, permission/guardrail settings — or none found>`
- **Sensitive files intentionally excluded:** `<files/patterns or none>`
- **Git hotspots inspected:** `<files or none available>`
- **Coverage floor met:** `<yes | no, with missing surfaces>`

## Representative Change Paths

1. `<entrypoint or contract>` -> `<implementation>` -> `<test or validation>`
2. `<entrypoint or contract>` -> `<implementation>` -> `<test or validation>`

If the repository is too small or lacks enough evidence, state that explicitly.

## Contradiction Pass

- **Docs vs commands:** `<finding or no contradiction found>`
- **Local validation vs CI:** `<finding or no contradiction found>`
- **Agent guidance vs repository reality:** `<finding or no contradiction found>`
- **Architecture claims vs change boundaries:** `<finding or no contradiction found>`
- **Test claims vs critical behavior:** `<finding or no contradiction found>`

## Scorecard

| Category | Score | Evidence-based rationale | Evidence type |
|----------|------:|--------------------------|---------------|
| MRC | `<score>` | `<why>` | `<observed or inferred>` |
| NAV | `<score>` | `<why>` | `<observed or inferred>` |
| TSC | `<score>` | `<why>` | `<observed or inferred>` |
| TEST | `<score>` | `<why>` | `<observed or inferred>` |
| ENV | `<score>` | `<why>` | `<observed or inferred>` |
| MOD | `<score>` | `<why>` | `<observed or inferred>` |
| CON | `<score>` | `<why>` | `<observed or inferred>` |
| ERR | `<score>` | `<why>` | `<observed or inferred>` |
| CICD | `<score>` | `<why>` | `<observed or inferred>` |
| AGT | `<score>` | `<why>` | `<observed or inferred>` |

## Strengths

- `<strength with evidence>`
- `<strength with evidence>`
- `<strength with evidence>`

## Biggest Gaps

- `<gap with evidence>`
- `<gap with evidence>`
- `<gap with evidence>`

## Likely Agent Failure Modes

- `<where an agent is likely to get stuck or make unsafe changes>`
- `<where an agent will struggle to validate its work>`
- `<where hidden coupling or missing guidance will cause rework>`

## Priority Fixes

1. `<highest-leverage fix>`
2. `<next fix>`
3. `<next fix>`
4. `<next fix>`

For each fix, explain why it improves agent success and point to the part of the
repo it affects.

## Safe Starting Commands for an Agent

List the first commands an agent can safely try in this repo, based on real
repo evidence. If commands are unclear or absent, say that explicitly.

## Evidence Notes

List the most important files inspected for this assessment.
