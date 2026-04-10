import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const CLAUDE_SKILL_NAME = "ares";

export function getBundledClaudeSkillDir() {
  return fileURLToPath(new URL("../skills/ares", import.meta.url));
}

export function getClaudePersonalSkillDir() {
  return join(homedir(), ".claude", "skills", CLAUDE_SKILL_NAME);
}

export function installClaudeSkill(options = {}) {
  const sourceDir = options.sourceDir || getBundledClaudeSkillDir();
  const destDir = options.destDir || getClaudePersonalSkillDir();
  const overwrite = options.overwrite === true;

  mkdirSync(dirname(destDir), { recursive: true });

  if (existsSync(destDir)) {
    if (!overwrite) {
      return {
        sourceDir,
        destDir,
        skillName: CLAUDE_SKILL_NAME,
        installed: false,
        overwritten: false,
      };
    }
    rmSync(destDir, { recursive: true, force: true });
  }

  cpSync(sourceDir, destDir, {
    force: true,
    recursive: true,
  });

  return {
    sourceDir,
    destDir,
    skillName: CLAUDE_SKILL_NAME,
    installed: true,
    overwritten: overwrite,
  };
}
