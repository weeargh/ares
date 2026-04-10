# ARES Assessment: <repo-name>

## Executive Summary

- **Overall Score:** `<score>/10`
- **Rating:** `<rating>`
- **ARES Version:** `ARES <version>`
- **Repo Type:** `<repo-type>`
- **Assessment Confidence:** `High | Medium | Low`
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
- **Agent guidance inspected:** `<files or none found>`
- **Sensitive files intentionally excluded:** `<files/patterns or none>`

## Scorecard

| Category | Score | Evidence-based rationale |
|----------|------:|--------------------------|
| MRC | `<score>` | `<why>` |
| NAV | `<score>` | `<why>` |
| TSC | `<score>` | `<why>` |
| TEST | `<score>` | `<why>` |
| ENV | `<score>` | `<why>` |
| MOD | `<score>` | `<why>` |
| CON | `<score>` | `<why>` |
| ERR | `<score>` | `<why>` |
| CICD | `<score>` | `<why>` |
| AGT | `<score>` | `<why>` |

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
