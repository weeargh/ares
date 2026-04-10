import { fileExists, readFile, readJSON } from "../utils.mjs";

export function analyzeCICD(ctx) {
  const { repoPath, files, languages, ciFiles } = ctx;
  const findings = [];
  const pkgJson = readJSON(repoPath, "package.json");
  const scripts = pkgJson?.scripts || {};
  const executableChecks = ["lint", "test", "smoke", "check"].filter((script) =>
    Boolean(scripts[script]),
  );
  const localFeedbackCount = executableChecks.length;
  const typecheckRelevant =
    languages.some((language) =>
      ["typescript", "python"].includes(language.lang),
    ) ||
    files.includes("tsconfig.json") ||
    files.includes("mypy.ini") ||
    files.includes(".mypy.ini");

  // ── CI system detection ────────────────────────────────────────────────
  const ciSystems = [];
  const detectedCiFiles = ciFiles.length > 0 ? ciFiles : files;
  const ciMatchers = [
    {
      name: "GitHub Actions",
      match: (f) => /^\.github\/workflows\/.+\.(yml|yaml)$/.test(f),
    },
    {
      name: "GitLab CI",
      match: (f) => /^\.gitlab-ci\.(yml|yaml)$/.test(f),
    },
    {
      name: "CircleCI",
      match: (f) => /^\.circleci\/config\.ya?ml$/.test(f),
    },
    { name: "Jenkins", match: (f) => /^Jenkinsfile$/i.test(f) },
    { name: "Buildkite", match: (f) => /^\.buildkite\//.test(f) },
    { name: "Travis CI", match: (f) => /^\.travis\.yml$/.test(f) },
    {
      name: "Bitbucket Pipelines",
      match: (f) => /^bitbucket-pipelines\.ya?ml$/i.test(f),
    },
    {
      name: "Azure Pipelines",
      match: (f) => /^azure-pipelines\.ya?ml$/i.test(f),
    },
  ];

  for (const ciMatcher of ciMatchers) {
    const matched = detectedCiFiles.filter(ciMatcher.match);
    if (matched.length > 0) {
      ciSystems.push({ name: ciMatcher.name, files: matched });
    }
  }

  findings.push({
    signal: "ci_exists",
    value: ciSystems.length > 0,
    impact:
      ciSystems.length > 0
        ? 1.5
        : localFeedbackCount >= 3
          ? -0.5
          : localFeedbackCount >= 1
            ? -1
            : -2,
    detail:
      ciSystems.length > 0
        ? `CI: ${ciSystems.map((c) => `${c.name} (${c.files.length} configs)`).join(", ")}`
        : "No CI configuration found",
  });

  // ── CI stages analysis ─────────────────────────────────────────────────
  let hasLint = false;
  let hasTypecheck = false;
  let hasTest = false;
  let hasBuild = false;
  let hasSecurity = false;
  let hasCoverage = false;
  let hasPreview = false;

  for (const ci of ciSystems) {
    for (const f of ci.files) {
      const content = readFile(repoPath, f) || "";
      const lower = content.toLowerCase();

      if (/lint|eslint|ruff|pylint|biome check|golangci/i.test(content))
        hasLint = true;
      if (/typecheck|tsc|mypy|pyright|type-check|type_check/i.test(content))
        hasTypecheck = true;
      if (
        /\btest\b|jest|vitest|pytest|go test|cargo test|mocha|playwright/i.test(
          content,
        )
      )
        hasTest = true;
      if (
        /\bbuild\b|compile|webpack|vite build|next build|cargo build/i.test(
          content,
        )
      )
        hasBuild = true;
      if (
        /snyk|trivy|audit|dependabot|renovate|codeql|sonar|semgrep|security/i.test(
          lower,
        )
      )
        hasSecurity = true;
      if (/coverage|codecov|coveralls|lcov/i.test(lower)) hasCoverage = true;
      if (/preview|deploy.*pr|vercel|netlify|cloudflare.*pages/i.test(lower))
        hasPreview = true;
    }
  }

  const stages = [
    { name: "lint", has: hasLint },
    ...(typecheckRelevant ? [{ name: "typecheck", has: hasTypecheck }] : []),
    { name: "test", has: hasTest },
    { name: "build", has: hasBuild },
  ];
  const stageCount = stages.filter((s) => s.has).length;

  findings.push({
    signal: "ci_stages",
    value: stageCount,
    impact:
      stageCount >= 4
        ? 2
        : stageCount >= 3
          ? 1.5
          : stageCount >= 2
            ? 1
            : stageCount >= 1
              ? 0.5
              : 0,
    detail: `CI stages: ${stages.map((s) => `${s.name}: ${s.has ? "✓" : "✗"}`).join(", ")}`,
  });

  findings.push({
    signal: "ci_security",
    value: hasSecurity,
    impact: hasSecurity ? 0.5 : 0,
    detail: hasSecurity
      ? "Security scanning in CI"
      : "No security scanning in CI",
  });

  findings.push({
    signal: "ci_coverage",
    value: hasCoverage,
    impact: hasCoverage ? 0.5 : 0,
    detail: hasCoverage
      ? "Coverage reporting in CI"
      : "No coverage reporting in CI",
  });

  findings.push({
    signal: "ci_preview",
    value: hasPreview,
    impact: hasPreview ? 0.5 : 0,
    detail: hasPreview
      ? "Preview deployments configured"
      : "No preview deployments",
  });

  findings.push({
    signal: "executable_feedback",
    value: localFeedbackCount,
    impact:
      localFeedbackCount >= 4
        ? 2
        : localFeedbackCount >= 3
          ? 1.5
          : localFeedbackCount >= 2
            ? 1
            : localFeedbackCount >= 1
              ? 0.5
              : 0,
    detail: `Local validation commands available: ${executableChecks.join(", ") || "none"}`,
  });

  // ── Pre-commit hooks (fast local feedback) ─────────────────────────────
  const preCommit = fileExists(
    repoPath,
    ".husky/pre-commit",
    ".pre-commit-config.yaml",
    ".pre-commit-config.yml",
  );
  findings.push({
    signal: "pre_commit_hooks",
    value: !!preCommit,
    impact: preCommit ? 0.5 : 0,
    detail: preCommit
      ? `Pre-commit hooks: ${preCommit}`
      : "No pre-commit hooks for fast local feedback",
  });

  // ── Dependency automation ──────────────────────────────────────────────
  const depBot = files.some((f) => /dependabot|renovate/i.test(f));
  const depBotFile = fileExists(
    repoPath,
    ".github/dependabot.yml",
    ".github/dependabot.yaml",
    "renovate.json",
    ".renovaterc",
    ".renovaterc.json",
  );
  findings.push({
    signal: "dep_automation",
    value: !!(depBot || depBotFile),
    impact: depBot || depBotFile ? 0.5 : 0,
    detail: depBotFile
      ? `Dependency automation: ${depBotFile}`
      : depBot
        ? "Dependency automation detected"
        : "No Dependabot/Renovate configuration",
  });

  // ── Branch protection (can't detect without API, note it) ──────────────
  const codeowners = fileExists(
    repoPath,
    ".github/CODEOWNERS",
    "CODEOWNERS",
    "docs/CODEOWNERS",
  );
  findings.push({
    signal: "codeowners",
    value: !!codeowners,
    impact: codeowners ? 0.5 : 0,
    detail: codeowners ? "CODEOWNERS file present" : "No CODEOWNERS file",
  });

  // ── Score ──────────────────────────────────────────────────────────────
  const totalImpact = findings.reduce((s, f) => s + f.impact, 0);
  const score = Math.max(
    0,
    Math.min(10, Math.round((totalImpact + 1) * 1.1 * 10) / 10),
  );

  const recommendations = [];
  if (ciSystems.length === 0)
    recommendations.push(
      "Add CI. GitHub Actions, Bitbucket Pipelines, GitLab CI, and similar providers are all fine. An agent without CI feedback is flying blind.",
    );
  if (!hasLint && ciSystems.length > 0)
    recommendations.push("Add lint step to CI");
  if (typecheckRelevant && !hasTypecheck && ciSystems.length > 0)
    recommendations.push("Add typecheck step to CI");
  if (!hasTest && ciSystems.length > 0)
    recommendations.push("Add test step to CI");
  if (!depBot && !depBotFile && ciSystems.length > 0)
    recommendations.push(
      "Add Dependabot or Renovate for automated dependency updates",
    );

  return {
    category: "Automated Feedback Loops",
    code: "CICD",
    score,
    findings,
    recommendations,
  };
}
