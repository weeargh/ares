import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  CLAUDE_SKILL_NAME,
  getBundledClaudeSkillDir,
  installClaudeSkill,
} from "../src/claude-skill.mjs";
import { getCurrentVersion } from "../src/update.mjs";

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
    assert.equal(existsSync(join(destination, "version.json")), true);

    const skillBody = readFileSync(join(destination, "SKILL.md"), "utf8");
    const rubricBody = readFileSync(join(destination, "rubric.md"), "utf8");
    const templateBody = readFileSync(
      join(destination, "report-template.md"),
      "utf8",
    );
    const versionBody = JSON.parse(
      readFileSync(join(destination, "version.json"), "utf8"),
    );
    assert.match(skillBody, /name: ares/);
    assert.match(skillBody, /report-template\.md/);
    assert.match(skillBody, /Non-Negotiable SOP/);
    assert.match(skillBody, /Do not execute repository-controlled commands/);
    assert.match(skillBody, /clickable markdown file link to the saved report/);
    assert.match(skillBody, /absolute filesystem target/);
    assert.match(skillBody, /ARES version used for the assessment/);
    assert.doesNotMatch(
      skillBody,
      /Bash\(npm \*\)|Bash\(yarn \*\)|Bash\(make \*\)/,
    );
    assert.match(rubricBody, /Overall score caps and gates/);
    assert.match(rubricBody, /Security handling during assessment/);
    assert.match(templateBody, /Applied Caps\/Gates/);
    assert.match(
      templateBody,
      /\[<path>\]\(\/absolute\/path\/to\/report\.md\)/,
    );
    assert.match(templateBody, /\*\*ARES Version:\*\*/);
    assert.match(templateBody, /Sensitive files intentionally excluded/);
    assert.equal(versionBody.version, getCurrentVersion());
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

test("default installClaudeSkill does not overwrite an existing skill", () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "ares-skill-existing-"));
  const destination = join(tempRoot, ".claude", "skills", CLAUDE_SKILL_NAME);

  try {
    mkdirSync(destination, { recursive: true });
    writeFileSync(join(destination, "SKILL.md"), "local custom skill\n");

    const result = installClaudeSkill({ destDir: destination });

    assert.equal(result.installed, false);
    assert.equal(result.overwritten, false);
    assert.equal(
      readFileSync(join(destination, "SKILL.md"), "utf8"),
      "local custom skill\n",
    );
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
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
    env: {
      ...process.env,
      ARES_NO_UPDATE_CHECK: "1",
    },
    stdio: "pipe",
    encoding: "utf8",
  });
  const snapshot = JSON.parse(output);

  assert.equal(snapshot.repoPath, process.cwd());
  assert.equal(snapshot.ares.installedVersion, getCurrentVersion());
  assert.equal(snapshot.ares.updateAvailable, false);
  assert.equal(typeof snapshot.repoType, "string");
  assert.equal(Array.isArray(snapshot.importantFiles), true);
  assert.equal(snapshot.fileCounts.total > 0, true);
});

test("repo-context helper excludes secret-like files from model-visible output", () => {
  const repoPath = mkdtempSync(join(tmpdir(), "ares-secret-scan-"));
  const scriptPath = join(
    getBundledClaudeSkillDir(),
    "scripts",
    "repo-context.mjs",
  );

  try {
    writeFileSync(join(repoPath, "README.md"), "# Demo\n");
    writeFileSync(join(repoPath, ".env"), "API_KEY=secret\n");
    writeFileSync(join(repoPath, "service-account-prod.json"), "{}\n");
    writeFileSync(
      join(repoPath, "package.json"),
      JSON.stringify({ name: "demo", version: "1.0.0" }, null, 2),
    );
    execFileSync("git", ["init", "-q"], { cwd: repoPath, stdio: "pipe" });
    execFileSync(
      "git",
      ["add", "README.md", ".env", "service-account-prod.json", "package.json"],
      {
        cwd: repoPath,
        stdio: "pipe",
      },
    );

    const output = execFileSync(process.execPath, [scriptPath, repoPath], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ARES_NO_UPDATE_CHECK: "1",
      },
      stdio: "pipe",
      encoding: "utf8",
    });
    const snapshot = JSON.parse(output);

    assert.equal(snapshot.excludedSensitiveFiles.includes(".env"), true);
    assert.equal(
      snapshot.excludedSensitiveFiles.includes("service-account-prod.json"),
      true,
    );
    assert.equal(snapshot.rootConfigs.includes(".env"), false);
    assert.equal(
      snapshot.importantFiles.some((file) => file.path === ".env"),
      false,
    );
    assert.equal(snapshot.fileCounts.excludedSensitive >= 2, true);
  } finally {
    rmSync(repoPath, { recursive: true, force: true });
  }
});

test("repo-context helper reports when a newer ARES release exists", () => {
  const scriptPath = join(
    getBundledClaudeSkillDir(),
    "scripts",
    "repo-context.mjs",
  );

  const output = execFileSync(process.execPath, [scriptPath, "."], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ARES_INSTALLED_VERSION_OVERRIDE: "0.1.0",
      ARES_LATEST_VERSION_OVERRIDE: "0.1.5",
    },
    stdio: "pipe",
    encoding: "utf8",
  });
  const snapshot = JSON.parse(output);

  assert.equal(snapshot.ares.installedVersion, "0.1.0");
  assert.equal(snapshot.ares.latestPublishedVersion, "0.1.5");
  assert.equal(snapshot.ares.updateAvailable, true);
  assert.match(snapshot.ares.updateCommand, /npm install -g ares-scan@latest/);
  assert.match(snapshot.ares.updateCommand, /ares install-skill/);
});
