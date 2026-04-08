import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const outDir = mkdtempSync(join(tmpdir(), "ares-smoke-"));
const outFile = join(outDir, "ares-report.md");

try {
  execFileSync(
    process.execPath,
    ["bin/ares.mjs", ".", "--md", "--out", outFile, "--quiet"],
    {
      cwd: process.cwd(),
      stdio: "pipe",
    },
  );

  const output = readFileSync(outFile, "utf8");
  assert.match(output, /# ARES Scan Report:/);
  assert.match(output, /## Repository Readiness Score:/);
  assert.match(output, /Repository Readiness for AI Coding Agents/);
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
