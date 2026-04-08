import assert from "node:assert/strict";
import test from "node:test";

import { generateMarkdown } from "../src/report.mjs";
import { scan } from "../src/scanner.mjs";
import { createFixtureRepo } from "./helpers/fixtureRepo.mjs";

test("cli fixture is detected as a CLI repo", () => {
  const fixture = createFixtureRepo("cli-basic");

  try {
    const result = scan(fixture.repoPath);

    assert.equal(result.repoType, "cli");
    assert.equal(result.scoringProfile.name, "CLI Profile");
    assert.ok(result.overallScore > result.rawOverallScore);
  } finally {
    fixture.cleanup();
  }
});

test("monorepo fixture renders workspace package summaries", () => {
  const fixture = createFixtureRepo("monorepo-basic");

  try {
    const result = scan(fixture.repoPath);
    const markdown = generateMarkdown(result);

    assert.equal(result.repoType, "monorepo");
    assert.equal(result.packages.length, 2);
    assert.match(markdown, /## Workspace Packages/);
    assert.match(markdown, /@demo\/web/);
    assert.match(markdown, /@demo\/core/);
  } finally {
    fixture.cleanup();
  }
});
