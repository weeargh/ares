import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { scan } from "../src/scanner.mjs";

function createTempRepo(files) {
  const repoPath = mkdtempSync(join(tmpdir(), "ares-calibration-"));
  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = join(repoPath, relativePath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content);
  }
  return repoPath;
}

test("small JavaScript CLI relies on runnable workflows instead of forcing TypeScript or Docker", () => {
  const repoPath = createTempRepo({
    "package.json": JSON.stringify(
      {
        name: "demo-cli",
        version: "1.0.0",
        bin: { demo: "./bin/demo.mjs" },
        scripts: {
          lint: "echo lint",
          test: "node --test test/*.test.mjs",
          smoke: "node bin/demo.mjs",
          check: "npm test && node bin/demo.mjs",
        },
      },
      null,
      2,
    ),
    "README.md": "# Demo CLI\n\n## Usage\n\nRun it.\n",
    "CLAUDE.md":
      "# CLAUDE.md\n\n## Commands\n\n- npm test\n- npm run smoke\n\n## Patterns\n\nKeep it local-first.\n\n## Anti-Patterns\n\nDo not add hosted dependencies.\n\n## Common Tasks\n\nRun the smoke test.\n",
    "bin/demo.mjs": '#!/usr/bin/env node\nconsole.log("demo");\n',
    "src/index.mjs": "export function main() { return 'demo'; }\n",
    "test/demo.test.mjs":
      'import assert from "node:assert/strict";\nimport test from "node:test";\n\ntest("demo", () => {\n  assert.equal(1, 1);\n});\n',
  });

  try {
    const result = scan(repoPath);
    const tsc = result.categories.find((category) => category.code === "TSC");
    const agt = result.categories.find((category) => category.code === "AGT");
    const env = result.categories.find((category) => category.code === "ENV");
    const testInfra = result.categories.find(
      (category) => category.code === "TEST",
    );
    const cicd = result.categories.find((category) => category.code === "CICD");

    assert.equal(result.repoType, "cli");
    assert.ok(tsc.score > 0);
    assert.equal(
      tsc.recommendations.some((rec) => /TypeScript/.test(rec)),
      false,
    );
    assert.equal(
      tsc.recommendations.some((rec) =>
        /validation.*API boundaries/i.test(rec),
      ),
      false,
    );
    assert.equal(
      agt.recommendations.some((rec) => /\.cursorrules|copilot/i.test(rec)),
      false,
    );
    assert.equal(
      env.recommendations.some((rec) =>
        /docker-compose|devcontainer|Makefile|Justfile/i.test(rec),
      ),
      false,
    );
    assert.ok(testInfra.score >= 5);
    assert.ok(cicd.score >= 2);
  } finally {
    rmSync(repoPath, { recursive: true, force: true });
  }
});
