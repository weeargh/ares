import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { scan } from "../src/scanner.mjs";

function createTempRepo(files) {
  const repoPath = mkdtempSync(join(tmpdir(), "ares-profile-"));
  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = join(repoPath, relativePath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content);
  }
  return repoPath;
}

test("scan detects CLI repos and applies CLI weighting", () => {
  const repoPath = createTempRepo({
    "package.json": JSON.stringify(
      {
        name: "demo-cli",
        version: "1.0.0",
        bin: { demo: "./bin/demo.mjs" },
        main: "./src/index.mjs",
      },
      null,
      2,
    ),
    "README.md": "# Demo CLI\n\n## Usage\n\nRun it.\n",
    "bin/demo.mjs": '#!/usr/bin/env node\nconsole.log("demo");\n',
    "src/index.mjs": 'export function main() { return "demo"; }\n',
  });

  try {
    const result = scan(repoPath);

    assert.equal(result.repoType, "cli");
    assert.equal(result.scoringProfile.detectionMethod, "auto");
    assert.equal(result.scoringProfile.weights.CICD, 0.35);
    assert.ok(result.overallScore > result.rawOverallScore);
  } finally {
    rmSync(repoPath, { recursive: true, force: true });
  }
});

test("scan supports explicit repo type override", () => {
  const repoPath = createTempRepo({
    "package.json": JSON.stringify(
      {
        name: "plain-package",
        version: "1.0.0",
        main: "./src/index.mjs",
      },
      null,
      2,
    ),
    "README.md": "# Plain Package\n",
    "src/index.mjs": "export const value = 1;\n",
  });

  try {
    const result = scan(repoPath, { repoType: "service" });

    assert.equal(result.repoType, "service");
    assert.equal(result.scoringProfile.detectionMethod, "override");
    assert.equal(result.scoringProfile.weights.ERR, 1.2);
  } finally {
    rmSync(repoPath, { recursive: true, force: true });
  }
});
