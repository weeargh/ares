import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("CLI uses the user-provided LLM as judge and applies static gates", () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "ares-cli-llm-"));
  const repoPath = join(tempRoot, "repo");
  const judgePath = join(tempRoot, "judge.mjs");
  const reportPath = join(tempRoot, "assessment.md");

  try {
    mkdirSync(join(repoPath, "src"), { recursive: true });
    mkdirSync(join(repoPath, "test"), { recursive: true });
    writeFileSync(
      join(repoPath, "package.json"),
      JSON.stringify({
        name: "llm-demo",
        scripts: { test: "node --test" },
      }),
    );
    writeFileSync(join(repoPath, "README.md"), "# LLM demo\n\nRun npm test.\n");
    writeFileSync(
      join(repoPath, "src", "index.mjs"),
      "export const ok = true;\n",
    );
    writeFileSync(
      join(repoPath, "test", "index.test.mjs"),
      "test('ok', () => {});\n",
    );
    writeFileSync(
      judgePath,
      `let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  if (!input.includes("Repository evidence bundle")) process.exit(2);
  process.stdout.write(JSON.stringify({
    overallScore: 10,
    confidence: "High",
    taskCeiling: "autonomous",
    summary: "The user model judged the supplied repository evidence.",
    categories: [
      {
        code: "MRC",
        score: 9,
        rationale: "The README gives a direct workflow.",
        evidence: [
          { path: "README.md", claim: "The project is introduced.", evidenceType: "observed" },
          { path: "package.json", claim: "A package manifest is present.", evidenceType: "observed" }
        ]
      },
      {
        code: "TEST",
        score: 9,
        rationale: "A repository-native test path and test file are present.",
        evidence: [
          { path: "package.json", claim: "The test script is explicit.", evidenceType: "observed" },
          { path: "test/index.test.mjs", claim: "A representative test exists.", evidenceType: "observed" }
        ]
      }
    ],
    strengths: ["Clear test command."],
    gaps: ["Runtime behavior was not verified."],
    failureModes: ["Static evidence may hide test failures."],
    priorityActions: ["Verify the test command in isolation."],
    safeStartingCommands: ["npm test"],
    appliedCaps: []
  }));
});
`,
    );

    execFileSync(
      process.execPath,
      [
        "bin/ares.mjs",
        "--llm",
        "--llm-cmd",
        `${process.execPath} ${judgePath}`,
        "--category",
        "MRC,TEST",
        repoPath,
        "--out",
        reportPath,
        "--quiet",
      ],
      { cwd: process.cwd(), encoding: "utf8", stdio: "pipe" },
    );

    const report = readFileSync(reportPath, "utf8");
    assert.match(report, /# ARES Assessment:/);
    assert.match(report, /\*\*Overall Score:\*\* 8\.5\/10/);
    assert.match(report, /LLM-judged static assessment/);
    assert.match(
      report,
      /Static inspection cannot prove autonomous task completion/,
    );
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
