#!/usr/bin/env node

import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CLAUDE_SKILL_NAME,
  getClaudePersonalSkillDir,
  installClaudeSkill,
} from "../src/claude-skill.mjs";
import { collectEvidence } from "../src/evidence.mjs";
import { runAssessmentLLM } from "../src/llm.mjs";
import { KNOWN_REPO_TYPES, normalizeRepoType } from "../src/profile.mjs";
import {
  generateAssessmentMarkdown,
  generateAssessmentTerminal,
  generateJSON,
  generateMarkdown,
  generateTerminal,
} from "../src/report.mjs";
import { scan } from "../src/scanner.mjs";
import { getCurrentVersion, maybeGetUpdateNotice } from "../src/update.mjs";

const args = process.argv.slice(2);
const currentVersion = getCurrentVersion();
const command = args[0];

if (command === "install-skill") {
  const quiet = args.includes("--quiet") || args.includes("--silent");

  try {
    const result = installClaudeSkill({ overwrite: true });
    if (!quiet) {
      console.log(
        `\n\x1b[32m  ✓ Installed Claude Code skill "/${result.skillName}"\x1b[0m`,
      );
      console.log(`\x1b[2m    Location: ${result.destDir}\x1b[0m`);
      console.log(
        "\x1b[2m    Open Claude Code in a repo and run /ares\x1b[0m\n",
      );
    }
    process.exit(0);
  } catch (err) {
    console.error(
      `\x1b[31mError: Could not install Claude Code skill (${err.message}).\x1b[0m`,
    );
    process.exit(1);
  }
}

const scanArgs = command === "scan" ? args.slice(1) : args;

// ── Help ──────────────────────────────────────────────────────────────────

if (
  scanArgs.includes("--help") ||
  scanArgs.includes("-h") ||
  scanArgs.includes("--version") ||
  scanArgs.includes("-v") ||
  scanArgs[0] === "help" ||
  scanArgs.length === 0
) {
  if (scanArgs.includes("--version") || scanArgs.includes("-v")) {
    console.log(currentVersion);
    process.exit(0);
  }

  console.log(`
  ${"\x1b[1m\x1b[36m"}ARES v${currentVersion} — AI-Native Codebase Assessment for Claude Code${"\x1b[0m"}
  Install /ares into Claude Code and run local repository assessments.

  ${"\x1b[1m"}Usage:${"\x1b[0m"}
    ares install-skill            Install/update the personal Claude Code /ares skill
    ares scan <path>              Run the deterministic local scanner
    ares <path>                   Alias for "ares scan <path>"
    ares <path> --md              Save deterministic markdown report
    ares <path> --json            Save deterministic JSON report
    ares <path> --llm             Judge repository evidence with your own LLM command

  ${"\x1b[1m"}Options:${"\x1b[0m"}
    --md                 Output markdown report (default: ares-report.md)
    --json               Output JSON report (default: ares-report.json)
    --out <file>         Output to specific file path
    --category <codes>   Comma-separated category codes to scan
    --type <repo-type>   Force repo type (${KNOWN_REPO_TYPES.filter((t) => t !== "auto").join(", ")})
    --llm                Use an external LLM command as the readiness judge
    --llm-cmd <command>  Command that reads the evidence prompt and writes assessment JSON
    --quiet              Suppress terminal output
    -v, --version        Show current version
    -h, --help           Show this help

  ${"\x1b[1m"}Claude Code:${"\x1b[0m"}
    Personal skill path: ${getClaudePersonalSkillDir()}
    npm install seeds the skill only if it does not already exist.
    Run "ares install-skill" to refresh the installed skill explicitly.
    In Claude Code, open a repository and run:
      /${CLAUDE_SKILL_NAME}
      /${CLAUDE_SKILL_NAME} docs/agentic-readiness.md

  ${"\x1b[1m"}Categories:${"\x1b[0m"}
    MRC   Context & Intent
    NAV   Navigability & Discoverability
    TSC   Contracts & Explicitness
    TEST  Validation Infrastructure
    ENV   Local Operability
    MOD   Change Boundaries & Modularity
    CON   Conventions & Example Density
    ERR   Diagnostics & Recoverability
    CICD  Automated Feedback Loops
    AGT   Agent Guidance & Guardrails

  ${"\x1b[1m"}Examples:${"\x1b[0m"}
    ares install-skill
    ares .                        Scan current directory
    ares scan ./my-project --md   Scan and save markdown report
    ares . --category MRC,AGT     Scan only docs and agent config
    ares . --type cli             Force CLI scoring profile
    ARES_LLM_COMMAND="my-llm-cli" ares . --llm
`);
  process.exit(0);
}

// ── Parse args ────────────────────────────────────────────────────────────

const repoPath = resolve(findRepoPathArgument(scanArgs) || ".");
const wantMd = scanArgs.includes("--md");
const wantJson = scanArgs.includes("--json");
const quiet = scanArgs.includes("--quiet");
const wantLlm = scanArgs.includes("--llm");

const outIdx = scanArgs.indexOf("--out");
const outFile = outIdx !== -1 ? scanArgs[outIdx + 1] : null;

const catIdx = scanArgs.indexOf("--category");
const categories = catIdx !== -1 ? scanArgs[catIdx + 1] : null;

const typeIdx = scanArgs.indexOf("--type");
const repoType = typeIdx !== -1 ? scanArgs[typeIdx + 1] : null;

const llmCmdIdx = scanArgs.indexOf("--llm-cmd");
const llmCommand =
  llmCmdIdx !== -1 ? scanArgs[llmCmdIdx + 1] : process.env.ARES_LLM_COMMAND;

const markdownOutFile = outFile && !outFile.endsWith(".json") ? outFile : null;
const shouldSaveMarkdown = wantMd || !!markdownOutFile || wantLlm;

// ── Validate ──────────────────────────────────────────────────────────────

if (!existsSync(repoPath)) {
  console.error(`\x1b[31mError: Path "${repoPath}" does not exist.\x1b[0m`);
  process.exit(1);
}

if (outIdx !== -1 && (!outFile || outFile.startsWith("-"))) {
  console.error("\x1b[31mError: --out requires a file path.\x1b[0m");
  process.exit(1);
}

if (catIdx !== -1 && (!categories || categories.startsWith("-"))) {
  console.error(
    "\x1b[31mError: --category requires a comma-separated list.\x1b[0m",
  );
  process.exit(1);
}

if (typeIdx !== -1 && (!repoType || repoType.startsWith("-"))) {
  console.error("\x1b[31mError: --type requires a repo type.\x1b[0m");
  process.exit(1);
}

if (
  llmCmdIdx !== -1 &&
  (!scanArgs[llmCmdIdx + 1] || scanArgs[llmCmdIdx + 1].startsWith("-"))
) {
  console.error("\x1b[31mError: --llm-cmd requires a shell command.\x1b[0m");
  process.exit(1);
}

if (repoType && !normalizeRepoType(repoType)) {
  console.error(
    `\x1b[31mError: --type must be one of ${KNOWN_REPO_TYPES.filter((t) => t !== "auto").join(", ")}.\x1b[0m`,
  );
  process.exit(1);
}

if (wantLlm && !llmCommand) {
  console.error(
    "\x1b[31mError: --llm requires --llm-cmd <command> or ARES_LLM_COMMAND.\x1b[0m",
  );
  process.exit(1);
}

// ── Scan ──────────────────────────────────────────────────────────────────

if (!quiet) {
  console.log(`\n\x1b[2m  Scanning ${repoPath}...\x1b[0m`);
}

const result = scan(repoPath, { categories, repoType });
let evidence = null;
let assessment = null;

if (wantLlm && result.scorable !== false) {
  try {
    if (!quiet) {
      console.log(
        "\x1b[2m  Collecting deep, secret-safe evidence for the LLM judge...\x1b[0m",
      );
    }
    evidence = collectEvidence(result);
    assessment = runAssessmentLLM(result, evidence, llmCommand, {
      timeoutMs: process.env.ARES_LLM_TIMEOUT_MS,
    });
  } catch (err) {
    console.error(
      `\x1b[33mWarning: LLM assessment failed (${err.message}). Falling back to the deterministic scan.\x1b[0m`,
    );
  }
}

// ── Output ────────────────────────────────────────────────────────────────

// Always print terminal output unless quiet
if (!quiet) {
  console.log(
    assessment
      ? generateAssessmentTerminal(result, assessment)
      : generateTerminal(result),
  );
}

// Save markdown
if (shouldSaveMarkdown) {
  const file = markdownOutFile || "ares-report.md";
  const md = assessment
    ? generateAssessmentMarkdown(result, assessment, evidence)
    : generateMarkdown(result);

  writeFileSync(file, md);
  console.log(`\x1b[32m  ✓ Report saved to ${file}\x1b[0m\n`);
}

// Save JSON
if (wantJson || outFile?.endsWith(".json")) {
  const output = assessment
    ? {
        ...result,
        assessment,
        evidence: {
          ...evidence,
          excerpts: evidence.excerpts.map(
            ({ content: _content, ...excerpt }) => excerpt,
          ),
        },
      }
    : result;
  const json = generateJSON(output);
  const file = outFile || "ares-report.json";
  writeFileSync(file, json);
  console.log(`\x1b[32m  ✓ JSON saved to ${file}\x1b[0m\n`);
}

// If no output flags, just print a hint
if (!wantMd && !wantJson && !outFile && !wantLlm && !quiet) {
  console.log(
    "\x1b[2m  Add --md to save markdown, --json for JSON, or --llm to judge evidence with your own LLM command\x1b[0m\n",
  );
}

const updateNotice = maybeGetUpdateNotice();
if (updateNotice && !quiet) {
  console.log(`\x1b[2m  ${updateNotice}\x1b[0m\n`);
}

function findRepoPathArgument(inputArgs) {
  const optionsWithValues = new Set([
    "--out",
    "--category",
    "--type",
    "--llm-cmd",
  ]);

  for (let index = 0; index < inputArgs.length; index++) {
    const argument = inputArgs[index];
    if (optionsWithValues.has(argument)) {
      index++;
      continue;
    }
    if (!argument.startsWith("-")) return argument;
  }
  return null;
}
