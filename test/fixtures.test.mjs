import assert from "node:assert/strict";
import test from "node:test";

import { generateMarkdown, generateTerminal } from "../src/report.mjs";
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

test("reports include a rubric link", () => {
  const fixture = createFixtureRepo("cli-basic");

  try {
    const result = scan(fixture.repoPath);
    const markdown = generateMarkdown(result);
    const terminal = generateTerminal(result);

    assert.match(markdown, /docs\/rubric\.md/);
    assert.match(terminal, /docs\/rubric\.md/);
  } finally {
    fixture.cleanup();
  }
});

test("empty targets render as unscorable in reports", () => {
  const fixture = createFixtureRepo("empty");

  try {
    const result = scan(fixture.repoPath);
    const markdown = generateMarkdown(result);
    const terminal = generateTerminal(result);

    assert.match(markdown, /Unscorable \/ Invalid Target/);
    assert.match(markdown, /No scannable files were found/);
    assert.doesNotMatch(markdown, /## Scorecard/);
    assert.match(terminal, /Unscorable \/ Invalid Target/);
    assert.match(terminal, /No scannable files were found/);
  } finally {
    fixture.cleanup();
  }
});

test("terminal report keeps table separators aligned for long category names", () => {
  const terminal = generateTerminal({
    repoPath: "/tmp/demo",
    elapsed: "0.1s",
    summary: {
      totalFiles: 10,
      sourceFiles: 8,
      testFiles: 2,
      languages: [{ lang: "javascript", count: 8 }],
    },
    overallScore: 5.3,
    rawOverallScore: 5.1,
    packageAverageScore: null,
    rating: "Practical Repo Readiness",
    repoType: "monorepo",
    scoringProfile: { name: "Monorepo Profile" },
    categories: [
      {
        code: "TSC",
        category: "Type Safety & Interface Contracts",
        weight: 1,
        score: 8.5,
        findings: [],
        recommendations: [],
      },
    ],
    packages: [],
  });

  assert.match(terminal, /Type Safety & Interface Cont\.\.\.\s+│ 1\.00 │/);
});
