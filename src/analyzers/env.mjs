import {
  getPrimaryLanguage,
  getReproducibleEnvRecommendation,
  getTaskRunnerRecommendation,
} from "../stack-guidance.mjs";
import { fileExists, readJSON } from "../utils.mjs";

export function analyzeENV(ctx) {
  const { repoPath, files, repoType, sourceFiles, languages } = ctx;
  const findings = [];
  const smallRepo = sourceFiles.length <= 25;
  const serviceLike = repoType === "service" || repoType === "app";
  const primaryLanguage = getPrimaryLanguage(languages);

  // ── .env.example ───────────────────────────────────────────────────────
  const envExample = fileExists(
    repoPath,
    ".env.example",
    ".env.sample",
    ".env.template",
    "env.example",
  );
  const envFiles = files.filter(
    (f) => /\.env($|\.)/.test(f) && !/node_modules/.test(f),
  );
  findings.push({
    signal: "env_example",
    value: !!envExample,
    impact: envExample ? 1 : envFiles.length > 0 ? -0.5 : 0,
    detail: envExample
      ? `${envExample} found`
      : envFiles.length > 0
        ? ".env files exist but no .env.example for reference"
        : "No .env files detected",
  });

  // ── Lockfiles ──────────────────────────────────────────────────────────
  const lockfiles = [
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "bun.lockb",
    "poetry.lock",
    "Pipfile.lock",
    "go.sum",
    "Cargo.lock",
    "Gemfile.lock",
    "composer.lock",
  ];
  const foundLocks = lockfiles.filter(
    (l) => files.includes(l) || fileExists(repoPath, l),
  );
  findings.push({
    signal: "lockfile",
    value: foundLocks.length > 0,
    impact: foundLocks.length > 0 ? 1 : -0.5,
    detail:
      foundLocks.length > 0
        ? `Lockfiles: ${foundLocks.join(", ")}`
        : "No lockfile found. Dependency resolution is non-deterministic.",
  });

  // ── Docker ─────────────────────────────────────────────────────────────
  const dockerfile = fileExists(
    repoPath,
    "Dockerfile",
    "dockerfile",
    "Containerfile",
  );
  const compose = fileExists(
    repoPath,
    "docker-compose.yml",
    "docker-compose.yaml",
    "compose.yml",
    "compose.yaml",
  );
  findings.push({
    signal: "docker",
    value: !!(dockerfile || compose),
    impact: compose ? 1.5 : dockerfile ? 0.5 : 0,
    detail:
      [
        dockerfile && `Dockerfile: ${dockerfile}`,
        compose && `Compose: ${compose}`,
      ]
        .filter(Boolean)
        .join(", ") || "No Docker configuration",
  });

  // ── Devcontainer ───────────────────────────────────────────────────────
  const devcontainer = fileExists(
    repoPath,
    ".devcontainer/devcontainer.json",
    ".devcontainer.json",
  );
  findings.push({
    signal: "devcontainer",
    value: !!devcontainer,
    impact: devcontainer ? 1.5 : 0,
    detail: devcontainer
      ? "Devcontainer configured"
      : "No devcontainer configuration",
  });

  // ── Nix ────────────────────────────────────────────────────────────────
  const nix = fileExists(repoPath, "flake.nix", "shell.nix", "default.nix");
  findings.push({
    signal: "nix",
    value: !!nix,
    impact: nix ? 1 : 0,
    detail: nix ? `Nix: ${nix}` : "No Nix configuration",
  });

  // ── Makefile / Justfile / Task runner ──────────────────────────────────
  const taskRunner = fileExists(
    repoPath,
    "Makefile",
    "justfile",
    "Justfile",
    "Taskfile.yml",
    "Taskfile.yaml",
  );
  findings.push({
    signal: "task_runner",
    value: !!taskRunner,
    impact: taskRunner ? 0.75 : 0,
    detail: taskRunner
      ? `Task runner: ${taskRunner}`
      : "No Makefile/Justfile (consider adding one-command setup)",
  });

  // ── Setup script ───────────────────────────────────────────────────────
  const setupScript = fileExists(
    repoPath,
    "scripts/setup.sh",
    "scripts/bootstrap.sh",
    "scripts/dev-setup.sh",
    "bin/setup",
    "setup.sh",
  );
  findings.push({
    signal: "setup_script",
    value: !!setupScript,
    impact: setupScript ? 0.5 : 0,
    detail: setupScript
      ? `Setup script: ${setupScript}`
      : "No setup/bootstrap script",
  });

  // ── package.json scripts ───────────────────────────────────────────────
  const pkgJson = readJSON(repoPath, "package.json");
  if (pkgJson?.scripts) {
    const scripts = Object.keys(pkgJson.scripts);
    const hasDevScript =
      scripts.includes("dev") ||
      scripts.includes("start") ||
      scripts.includes("serve");
    const hasBuildScript = scripts.includes("build");
    const hasLintScript = scripts.includes("lint");
    const hasTestScript = scripts.includes("test");
    const hasCheckScript = scripts.includes("check");
    const hasSmokeScript = scripts.includes("smoke");

    findings.push({
      signal: "npm_scripts",
      value: scripts.length,
      impact:
        (hasLintScript ? 0.25 : 0) +
        (hasTestScript ? 0.25 : 0) +
        (hasCheckScript ? 0.5 : 0) +
        (hasSmokeScript ? 0.25 : 0) +
        (serviceLike && hasDevScript ? 0.25 : 0) +
        (serviceLike && hasBuildScript ? 0.25 : 0),
      detail: `${scripts.length} npm scripts. test: ${hasTestScript ? "✓" : "✗"}, lint: ${hasLintScript ? "✓" : "✗"}, check: ${hasCheckScript ? "✓" : "✗"}, smoke: ${hasSmokeScript ? "✓" : "✗"}${serviceLike ? `, dev: ${hasDevScript ? "✓" : "✗"}, build: ${hasBuildScript ? "✓" : "✗"}` : ""}`,
    });
  }

  // ── Seed data ──────────────────────────────────────────────────────────
  const seedFiles = files.filter((f) =>
    /seed|fixture|sample.data|mock.data/i.test(f),
  );
  findings.push({
    signal: "seed_data",
    value: seedFiles.length > 0,
    impact: seedFiles.length > 0 ? 0.5 : 0,
    detail:
      seedFiles.length > 0
        ? `${seedFiles.length} seed/fixture data files`
        : "No seed data detected",
  });

  // ── Score ──────────────────────────────────────────────────────────────
  const totalImpact = findings.reduce((s, f) => s + f.impact, 0);
  const score = Math.max(
    0,
    Math.min(10, Math.round((totalImpact + 1) * 1.15 * 10) / 10),
  );

  const recommendations = [];
  if (!envExample && envFiles.length > 0)
    recommendations.push(
      "Create .env.example documenting all required environment variables",
    );
  if (foundLocks.length === 0)
    recommendations.push(
      "Commit a lockfile for deterministic dependency resolution",
    );
  if (!compose && !devcontainer && serviceLike && !smallRepo)
    recommendations.push(
      getReproducibleEnvRecommendation(primaryLanguage, repoType),
    );
  if (!taskRunner && serviceLike && !smallRepo)
    recommendations.push(getTaskRunnerRecommendation(primaryLanguage));

  return {
    category: "Local Operability",
    code: "ENV",
    score,
    findings,
    recommendations,
  };
}
