import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { collectEvidence } from "../src/evidence.mjs";
import { scan } from "../src/scanner.mjs";

test("collectEvidence builds aggressive, secret-safe repository evidence", () => {
  const repoPath = mkdtempSync(join(tmpdir(), "ares-evidence-"));
  try {
    mkdirSync(join(repoPath, "src"), { recursive: true });
    mkdirSync(join(repoPath, "test"), { recursive: true });
    writeFileSync(
      join(repoPath, "package.json"),
      JSON.stringify(
        {
          name: "evidence-demo",
          scripts: { test: "node --test" },
        },
        null,
        2,
      ),
    );
    writeFileSync(
      join(repoPath, "README.md"),
      "# Demo\n\nRun `npm run missing-script`.\n",
    );
    writeFileSync(
      join(repoPath, "src", "index.mjs"),
      "// TODO: add validation\nexport const value = 1;\n",
    );
    writeFileSync(
      join(repoPath, "test", "index.test.mjs"),
      "test.skip('later', () => {});\n",
    );
    writeFileSync(join(repoPath, ".env"), "API_KEY=do-not-expose\n");
    execFileSync("git", ["init", "-q"], { cwd: repoPath });

    const result = scan(repoPath);
    const evidence = collectEvidence(result);

    assert.equal(
      evidence.contradictions.some(
        (finding) => finding.signal === "documented_command_missing",
      ),
      true,
    );
    assert.equal(
      evidence.riskSignals.find(
        (finding) => finding.signal === "unfinished_work",
      ).count,
      1,
    );
    assert.equal(evidence.excludedSensitiveFiles.includes(".env"), true);
    assert.equal(
      evidence.excerpts.some((excerpt) => excerpt.path === ".env"),
      false,
    );
    assert.equal(
      evidence.excerpts.some((excerpt) => excerpt.path === "src/index.mjs"),
      true,
    );
    assert.equal(
      evidence.topology.sourceTestMappings.some(
        (mapping) =>
          mapping.source === "src/index.mjs" &&
          mapping.tests.includes("test/index.test.mjs"),
      ),
      true,
    );
    assert.equal(evidence.coverage.minimumMet, true);
  } finally {
    rmSync(repoPath, { recursive: true, force: true });
  }
});
