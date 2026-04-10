import { installClaudeSkill } from "../src/claude-skill.mjs";

try {
  const result = installClaudeSkill();
  if (result.installed) {
    console.log(
      `[ares] Installed Claude Code skill "/${result.skillName}" to ${result.destDir}`,
    );
  } else {
    console.log(
      `[ares] Existing Claude Code skill "/${result.skillName}" left unchanged at ${result.destDir}. Run "ares install-skill" to refresh it explicitly.`,
    );
  }
} catch (error) {
  console.warn(
    `[ares] Warning: could not install Claude Code skill automatically (${error.message}). Run "ares install-skill" after install.`,
  );
}
