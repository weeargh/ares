import { installClaudeSkill } from "../src/claude-skill.mjs";

try {
  const result = installClaudeSkill();
  console.log(
    `[ares] Installed Claude Code skill "/${result.skillName}" to ${result.destDir}`,
  );
} catch (error) {
  console.warn(
    `[ares] Warning: could not install Claude Code skill automatically (${error.message}). Run "ares install-skill" after install.`,
  );
}
