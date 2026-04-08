#!/usr/bin/env node

import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { runMarkdownLLM } from "../src/llm.mjs";
import { KNOWN_REPO_TYPES, normalizeRepoType } from "../src/profile.mjs";
import {
  generateJSON,
  generateMarkdown,
  generateTerminal,
} from "../src/report.mjs";
import { scan } from "../src/scanner.mjs";

const args = process.argv.slice(2);

// ── Help ──────────────────────────────────────────────────────────────────

if (args.includes("--help") || args.includes("-h") || args.length === 0) {
  console.log(`
  ${"\x1b[1m\x1b[36m"}ARES — Repository Readiness for AI Coding Agents${"\x1b[0m"}
  Score any repository's readiness for AI coding agents.

  ${"\x1b[1m"}Usage:${"\x1b[0m"}
    ares <path>                   Scan repo and print results
    ares <path> --md              Save markdown report
    ares <path> --json            Save JSON report
    ares <path> --out <file>      Save to specific file
    ares <path> --category MRC,TEST  Scan specific categories only
    ares <path> --type cli        Force the scoring profile
    ares <path> --llm             Generate markdown via your own LLM command

  ${"\x1b[1m"}Options:${"\x1b[0m"}
    --md                 Output markdown report (default: ares-report.md)
    --json               Output JSON report (default: ares-report.json)
    --out <file>         Output to specific file path
    --category <codes>   Comma-separated category codes to scan
    --type <repo-type>   Force repo type (${KNOWN_REPO_TYPES.filter((t) => t !== "auto").join(", ")})
    --llm                Use an external LLM command to author markdown
    --llm-cmd <command>  Shell command that reads prompt from stdin and writes markdown to stdout
    --quiet              Suppress terminal output
    -h, --help           Show this help

  ${"\x1b[1m"}Categories:${"\x1b[0m"}
    MRC   Machine-Readable Context
    NAV   Codebase Navigability
    TSC   Type Safety & Interface Contracts
    TEST  Test Infrastructure
    ENV   Build & Dev Environment
    MOD   Modularity & Coupling
    CON   Code Consistency & Conventions
    ERR   Error Handling & Diagnostics
    CICD  CI/CD & Feedback Loops
    AGT   Agent-Explicit Configuration

  ${"\x1b[1m"}Examples:${"\x1b[0m"}
    ares .                        Scan current directory
    ares ./my-project --md        Scan and save markdown report
    ares . --category MRC,AGT     Scan only docs and agent config
    ares . --type cli             Force CLI scoring profile
    ares . --json --out scan.json Save JSON to custom file
    ARES_LLM_COMMAND="my-llm-cli" ares . --llm
`);
  process.exit(0);
}

// ── Parse args ────────────────────────────────────────────────────────────

const repoPath = resolve(args.find((a) => !a.startsWith("-")) || ".");
const wantMd = args.includes("--md");
const wantJson = args.includes("--json");
const quiet = args.includes("--quiet");
const wantLlm = args.includes("--llm");

const outIdx = args.indexOf("--out");
const outFile = outIdx !== -1 ? args[outIdx + 1] : null;

const catIdx = args.indexOf("--category");
const categories = catIdx !== -1 ? args[catIdx + 1] : null;

const typeIdx = args.indexOf("--type");
const repoType = typeIdx !== -1 ? args[typeIdx + 1] : null;

const llmCmdIdx = args.indexOf("--llm-cmd");
const llmCommand =
  llmCmdIdx !== -1 ? args[llmCmdIdx + 1] : process.env.ARES_LLM_COMMAND;

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
  (!args[llmCmdIdx + 1] || args[llmCmdIdx + 1].startsWith("-"))
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

// ── Output ────────────────────────────────────────────────────────────────

// Always print terminal output unless quiet
if (!quiet) {
  console.log(generateTerminal(result));
}

// Save markdown
if (shouldSaveMarkdown) {
  const file = markdownOutFile || "ares-report.md";
  let md = generateMarkdown(result);

  if (wantLlm) {
    try {
      md = runMarkdownLLM(result, llmCommand, {
        timeoutMs: process.env.ARES_LLM_TIMEOUT_MS,
      });
      if (!quiet) {
        console.log(
          "\x1b[2m  Markdown authored via external LLM command\x1b[0m",
        );
      }
    } catch (err) {
      console.error(
        `\x1b[33mWarning: LLM markdown failed (${err.message}). Falling back to static markdown.\x1b[0m`,
      );
    }
  }

  writeFileSync(file, md);
  console.log(`\x1b[32m  ✓ Report saved to ${file}\x1b[0m\n`);
}

// Save JSON
if (wantJson || outFile?.endsWith(".json")) {
  const json = generateJSON(result);
  const file = outFile || "ares-report.json";
  writeFileSync(file, json);
  console.log(`\x1b[32m  ✓ JSON saved to ${file}\x1b[0m\n`);
}

// If no output flags, just print a hint
if (!wantMd && !wantJson && !outFile && !wantLlm && !quiet) {
  console.log(
    "\x1b[2m  Add --md to save markdown report, --json for JSON, --llm to author markdown with your own LLM command\x1b[0m\n",
  );
}
