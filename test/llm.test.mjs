import assert from "node:assert/strict";
import test from "node:test";

import { buildMarkdownPrompt, runMarkdownLLM } from "../src/llm.mjs";

const sampleResult = {
  repoPath: "/tmp/example",
  scanDate: "2026-04-08T00:00:00.000Z",
  elapsed: "0.1s",
  summary: {
    totalFiles: 12,
    sourceFiles: 8,
    testFiles: 2,
    languages: [{ lang: "javascript", count: 8 }],
  },
  overallScore: 6.4,
  rating: "Practical Repo Readiness",
  categories: [
    {
      code: "MRC",
      category: "Context & Intent",
      score: 7.2,
      findings: [
        {
          signal: "readme_exists",
          value: true,
          impact: 1,
          detail: "README.md",
        },
      ],
      recommendations: ["Add CONTRIBUTING.md"],
    },
    {
      code: "TEST",
      category: "Validation Infrastructure",
      score: 4.1,
      findings: [
        {
          signal: "test_files_exist",
          value: 2,
          impact: 0.5,
          detail: "2 test files found",
        },
      ],
      recommendations: ["Increase automated test coverage"],
    },
  ],
};

test("buildMarkdownPrompt includes the scan payload and reporting constraints", () => {
  const prompt = buildMarkdownPrompt(sampleResult);

  assert.match(prompt, /Return Markdown only/);
  assert.match(prompt, /"overallScore": 6\.4/);
  assert.match(prompt, /"code": "TEST"/);
});

test("runMarkdownLLM accepts stdout markdown and strips wrapping fences", () => {
  const command =
    "sh -c \"cat >/dev/null; printf '\\140\\140\\140md\\n# Report\\n\\nBody\\n\\140\\140\\140\\n'\"";
  const markdown = runMarkdownLLM(sampleResult, command, { timeoutMs: 5000 });

  assert.equal(markdown, "# Report\n\nBody\n");
});
