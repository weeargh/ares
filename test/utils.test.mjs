import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { scan } from "../src/scanner.mjs";
import { classifyFile } from "../src/utils.mjs";

function createTempRepo(files) {
  const repoPath = mkdtempSync(join(tmpdir(), "ares-utils-"));
  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = join(repoPath, relativePath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content);
  }
  return repoPath;
}

test("storybook stories are not classified as tests", () => {
  assert.equal(classifyFile("src/button.stories.tsx"), "source");
});

test("manual scans include hidden CI directories", () => {
  const repoPath = createTempRepo({
    "README.md": "# Demo\n",
    "package.json": JSON.stringify(
      {
        name: "demo",
        version: "1.0.0",
        scripts: {
          lint: "echo lint",
          test: "echo test",
        },
      },
      null,
      2,
    ),
    "src/index.js": "export const value = 1;\n",
    ".circleci/config.yml":
      "version: 2.1\njobs:\n  test:\n    docker:\n      - image: cimg/node:20.0\n    steps:\n      - checkout\n      - run: npm test\n",
  });

  try {
    const result = scan(repoPath);
    const cicd = result.categories.find((category) => category.code === "CICD");
    const ciExists = cicd.findings.find(
      (finding) => finding.signal === "ci_exists",
    );

    assert.equal(ciExists.value, true);
    assert.match(ciExists.detail, /CircleCI/);
  } finally {
    rmSync(repoPath, { recursive: true, force: true });
  }
});
