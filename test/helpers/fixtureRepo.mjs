import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export function createFixtureRepo(fixtureName) {
  const fixtureFile = join(
    process.cwd(),
    "test",
    "fixtures",
    `${fixtureName}.json`,
  );
  const definition = JSON.parse(readFileSync(fixtureFile, "utf8"));
  const repoPath = mkdtempSync(join(tmpdir(), `ares-fixture-${fixtureName}-`));

  for (const [relativePath, content] of Object.entries(definition.files)) {
    const fullPath = join(repoPath, relativePath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content);
  }

  return {
    repoPath,
    cleanup() {
      rmSync(repoPath, { recursive: true, force: true });
    },
  };
}
