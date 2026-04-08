import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { scan } from "../src/scanner.mjs";

function createTempRepo(files) {
  const repoPath = mkdtempSync(join(tmpdir(), "ares-monorepo-"));
  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = join(repoPath, relativePath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content);
  }
  return repoPath;
}

test("scan discovers workspace packages and scores them individually", () => {
  const repoPath = createTempRepo({
    "package.json": JSON.stringify(
      {
        name: "demo-monorepo",
        private: true,
        workspaces: ["packages/*", "apps/*"],
      },
      null,
      2,
    ),
    "README.md": "# Demo Monorepo\n",
    "packages/core/package.json": JSON.stringify(
      {
        name: "@demo/core",
        version: "1.0.0",
        main: "./src/index.mjs",
      },
      null,
      2,
    ),
    "packages/core/src/index.mjs": "export const core = true;\n",
    "packages/core/test/core.test.mjs":
      'import test from "node:test";\nimport assert from "node:assert/strict";\ntest("core",()=>assert.equal(1,1));\n',
    "apps/web/package.json": JSON.stringify(
      {
        name: "@demo/web",
        version: "1.0.0",
        dependencies: { react: "^19.0.0" },
      },
      null,
      2,
    ),
    "apps/web/src/app.mjs": "export const app = true;\n",
  });

  try {
    const result = scan(repoPath);

    assert.equal(result.repoType, "monorepo");
    assert.equal(result.packages.length, 2);
    assert.equal(result.packageAverageScore !== null, true);
    assert.deepEqual(
      result.packages.map((pkg) => pkg.path),
      ["apps/web", "packages/core"],
    );
    assert.deepEqual(
      result.packages.map((pkg) => pkg.repoType),
      ["app", "library"],
    );
  } finally {
    rmSync(repoPath, { recursive: true, force: true });
  }
});
