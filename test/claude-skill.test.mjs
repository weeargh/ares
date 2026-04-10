import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  CLAUDE_SKILL_NAME,
  getBundledClaudeSkillDir,
  installClaudeSkill,
} from "../src/claude-skill.mjs";

test("installClaudeSkill copies the bundled Claude Code skill assets", () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "ares-skill-"));
  const destination = join(tempRoot, ".claude", "skills", CLAUDE_SKILL_NAME);

  try {
    const result = installClaudeSkill({ destDir: destination });

    assert.equal(result.destDir, destination);
    assert.equal(result.skillName, CLAUDE_SKILL_NAME);
    assert.equal(result.sourceDir, getBundledClaudeSkillDir());
    assert.equal(existsSync(join(destination, "SKILL.md")), true);
    assert.equal(existsSync(join(destination, "rubric.md")), true);
    assert.equal(existsSync(join(destination, "report-template.md")), true);
    assert.equal(
      existsSync(join(destination, "scripts", "repo-context.mjs")),
      true,
    );

    const skillBody = readFileSync(join(destination, "SKILL.md"), "utf8");
    const rubricBody = readFileSync(join(destination, "rubric.md"), "utf8");
    const templateBody = readFileSync(
      join(destination, "report-template.md"),
      "utf8",
    );
    assert.match(skillBody, /name: ares/);
    assert.match(skillBody, /report-template\.md/);
    assert.match(skillBody, /Non-Negotiable SOP/);
    assert.match(rubricBody, /Overall score caps and gates/);
    assert.match(templateBody, /Applied Caps\/Gates/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("ares install-skill installs the personal Claude Code skill into HOME", () => {
  const tempHome = mkdtempSync(join(tmpdir(), "ares-home-"));

  try {
    execFileSync(
      process.execPath,
      ["bin/ares.mjs", "install-skill", "--quiet"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          HOME: tempHome,
        },
        stdio: "pipe",
      },
    );

    const installedSkill = join(
      tempHome,
      ".claude",
      "skills",
      CLAUDE_SKILL_NAME,
      "SKILL.md",
    );
    assert.equal(existsSync(installedSkill), true);
  } finally {
    rmSync(tempHome, { recursive: true, force: true });
  }
});

test("repo-context helper script runs and returns a repository snapshot", () => {
  const scriptPath = join(
    getBundledClaudeSkillDir(),
    "scripts",
    "repo-context.mjs",
  );

  const output = execFileSync(process.execPath, [scriptPath, "."], {
    cwd: process.cwd(),
    stdio: "pipe",
    encoding: "utf8",
  });
  const snapshot = JSON.parse(output);

  assert.equal(snapshot.repoPath, process.cwd());
  assert.equal(typeof snapshot.repoType, "string");
  assert.equal(Array.isArray(snapshot.importantFiles), true);
  assert.equal(snapshot.fileCounts.total > 0, true);
});
