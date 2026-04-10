import {
  getFormatterRecommendation,
  getLinterRecommendation,
  getPrimaryLanguage,
} from "../stack-guidance.mjs";
import { fileExists, grepCount, readFile, readJSON } from "../utils.mjs";

export function analyzeCON(ctx) {
  const { repoPath, sourceFiles, ciFiles, languages, files } = ctx;
  const findings = [];
  const primaryLanguage = getPrimaryLanguage(languages);
  const makefile = readFile(repoPath, "Makefile") || "";
  const justfile = readFile(repoPath, "justfile") || "";
  const ciContent = ciFiles
    .map((filePath) => readFile(repoPath, filePath) || "")
    .join("\n");
  const repoAutomationText = [ciContent, makefile, justfile].join("\n");

  // ── Linter config ──────────────────────────────────────────────────────
  const linters = [
    {
      name: "ESLint",
      files: [
        ".eslintrc",
        ".eslintrc.js",
        ".eslintrc.cjs",
        ".eslintrc.json",
        ".eslintrc.yml",
        "eslint.config.js",
        "eslint.config.mjs",
        "eslint.config.ts",
      ],
    },
    { name: "Biome", files: ["biome.json", "biome.jsonc"] },
    { name: "Ruff", files: ["ruff.toml", ".ruff.toml"] },
    { name: "Pylint", files: [".pylintrc", "pylintrc"] },
    { name: "Flake8", files: [".flake8"] },
    {
      name: "golangci-lint",
      files: [".golangci.yml", ".golangci.yaml", ".golangci.toml"],
    },
    { name: "Clippy", files: ["clippy.toml", ".clippy.toml"] },
    { name: "RuboCop", files: [".rubocop.yml"] },
  ];

  // Check pyproject.toml for ruff/pylint/flake8 config
  const pyproject = readFile(repoPath, "pyproject.toml") || "";
  const hasRuffInPyproject = pyproject.includes("[tool.ruff]");
  const foundLinters = linters.filter((l) =>
    l.files.some((f) => fileExists(repoPath, f)),
  );
  if (hasRuffInPyproject && !foundLinters.some((l) => l.name === "Ruff"))
    foundLinters.push({ name: "Ruff (pyproject)" });
  if (
    /golangci-lint/i.test(repoAutomationText) &&
    !foundLinters.some((l) => l.name === "golangci-lint")
  ) {
    foundLinters.push({ name: "golangci-lint (automation)" });
  }
  if (
    /eslint|eslint\.config|\.eslintrc/i.test(repoAutomationText) &&
    !foundLinters.some((l) => l.name.startsWith("ESLint"))
  ) {
    foundLinters.push({ name: "ESLint (automation)" });
  }
  if (
    /\bruff\b/i.test(repoAutomationText) &&
    !foundLinters.some((l) => l.name.startsWith("Ruff"))
  ) {
    foundLinters.push({ name: "Ruff (automation)" });
  }
  if (
    /\bbiome check\b/i.test(repoAutomationText) &&
    !foundLinters.some((l) => l.name === "Biome")
  ) {
    foundLinters.push({ name: "Biome (automation)" });
  }

  findings.push({
    signal: "linter_config",
    value: foundLinters.length > 0,
    impact: foundLinters.length > 0 ? 1.5 : -1,
    detail:
      foundLinters.length > 0
        ? `Linters: ${foundLinters.map((l) => l.name).join(", ")}`
        : "No linter configuration found",
  });

  // ── Formatter config ───────────────────────────────────────────────────
  const formatters = [
    {
      name: "Prettier",
      files: [
        ".prettierrc",
        ".prettierrc.js",
        ".prettierrc.json",
        ".prettierrc.yml",
        ".prettierrc.cjs",
        "prettier.config.js",
        "prettier.config.mjs",
      ],
    },
    { name: "Biome", files: ["biome.json"] },
    { name: "Black", files: [] }, // check pyproject
    { name: "gofmt", files: [] }, // inherent to Go
    { name: "rustfmt", files: ["rustfmt.toml", ".rustfmt.toml"] },
  ];

  const hasBlack =
    pyproject.includes("[tool.black]") || pyproject.includes("black");
  const foundFormatters = formatters.filter(
    (f) => f.files.length > 0 && f.files.some((ff) => fileExists(repoPath, ff)),
  );
  if (hasBlack) foundFormatters.push({ name: "Black" });

  // Check package.json for prettier
  const pkgJson = readJSON(repoPath, "package.json");
  if (pkgJson?.prettier || pkgJson?.devDependencies?.prettier) {
    if (!foundFormatters.some((f) => f.name === "Prettier"))
      foundFormatters.push({ name: "Prettier (package.json)" });
  }
  if (
    /\bbiome format\b/i.test(repoAutomationText) &&
    !foundFormatters.some((f) => f.name.startsWith("Biome"))
  ) {
    foundFormatters.push({ name: "Biome (automation)" });
  }
  if (
    /\bprettier\b/i.test(repoAutomationText) &&
    !foundFormatters.some((f) => f.name.startsWith("Prettier"))
  ) {
    foundFormatters.push({ name: "Prettier (automation)" });
  }
  if (
    /\b(gofmt|gofumpt|goimports)\b/i.test(repoAutomationText) &&
    !foundFormatters.some((f) => /gofmt|gofumpt|goimports/i.test(f.name))
  ) {
    foundFormatters.push({ name: "Go formatter (automation)" });
  }
  if (
    primaryLanguage === "go" &&
    files.some((f) => /^\.golangci\.(yml|yaml|toml)$/i.test(f))
  ) {
    const golangciConfigPath = fileExists(
      repoPath,
      ".golangci.yml",
      ".golangci.yaml",
      ".golangci.toml",
    );
    const golangciConfig = golangciConfigPath
      ? readFile(repoPath, golangciConfigPath) || ""
      : "";
    if (
      /\b(gofmt|gofumpt|goimports)\b/i.test(golangciConfig) &&
      !foundFormatters.some((f) => /gofmt|gofumpt|goimports/i.test(f.name))
    ) {
      foundFormatters.push({ name: "Go formatter (.golangci)" });
    }
  }

  findings.push({
    signal: "formatter_config",
    value: foundFormatters.length > 0,
    impact: foundFormatters.length > 0 ? 1 : -0.5,
    detail:
      foundFormatters.length > 0
        ? `Formatters: ${foundFormatters.map((f) => f.name).join(", ")}`
        : "No code formatter detected",
  });

  // ── EditorConfig ───────────────────────────────────────────────────────
  const editorconfig = fileExists(repoPath, ".editorconfig");
  findings.push({
    signal: "editorconfig",
    value: !!editorconfig,
    impact: editorconfig ? 0.5 : 0,
    detail: editorconfig ? ".editorconfig present" : "No .editorconfig",
  });

  // ── Pre-commit hooks ───────────────────────────────────────────────────
  const preCommit =
    fileExists(repoPath, ".husky/pre-commit", ".husky/_/pre-commit") ||
    fileExists(repoPath, ".pre-commit-config.yaml", ".pre-commit-config.yml") ||
    fileExists(
      repoPath,
      ".lintstagedrc",
      ".lintstagedrc.json",
      ".lintstagedrc.js",
    );

  const hasLintStaged =
    pkgJson?.["lint-staged"] || pkgJson?.devDependencies?.["lint-staged"];

  findings.push({
    signal: "pre_commit",
    value: !!(preCommit || hasLintStaged),
    impact: preCommit || hasLintStaged ? 1 : 0,
    detail: preCommit
      ? `Pre-commit hooks: ${preCommit}`
      : hasLintStaged
        ? "lint-staged configured"
        : "No pre-commit hooks",
  });

  // ── Lint suppressions ──────────────────────────────────────────────────
  const eslintDisable = grepCount(
    repoPath,
    sourceFiles.slice(0, 200),
    /eslint-disable|eslint-disable-next-line|eslint-disable-line/,
    { extensions: [".ts", ".tsx", ".js", ".jsx"] },
  );
  const noqa = grepCount(
    repoPath,
    sourceFiles.slice(0, 200),
    /# noqa|# type:\s*ignore|# pylint:\s*disable/,
    { extensions: [".py"] },
  );
  const totalSuppressions = eslintDisable.count + noqa.count;

  findings.push({
    signal: "lint_suppressions",
    value: totalSuppressions,
    impact:
      totalSuppressions === 0
        ? 1
        : totalSuppressions < 20
          ? 0.5
          : totalSuppressions < 50
            ? 0
            : -0.5,
    detail: `${totalSuppressions} lint suppressions (${eslintDisable.count} eslint-disable, ${noqa.count} noqa/type:ignore)`,
  });

  // ── Multiple patterns for same operation ───────────────────────────────
  if (pkgJson) {
    const allDeps = { ...pkgJson.dependencies, ...pkgJson.devDependencies };
    // HTTP clients
    const httpClients = [
      "axios",
      "node-fetch",
      "got",
      "ky",
      "superagent",
      "undici",
      "request",
    ].filter((d) => allDeps[d]);
    if (httpClients.length > 1) {
      findings.push({
        signal: "http_client_sprawl",
        value: httpClients.length,
        impact: -0.5,
        detail: `Multiple HTTP clients: ${httpClients.join(", ")}. Pick one.`,
      });
    }

    // Logging
    const loggers = [
      "winston",
      "pino",
      "bunyan",
      "log4js",
      "loglevel",
      "signale",
    ].filter((d) => allDeps[d]);
    if (loggers.length > 1) {
      findings.push({
        signal: "logger_sprawl",
        value: loggers.length,
        impact: -0.5,
        detail: `Multiple loggers: ${loggers.join(", ")}. Pick one.`,
      });
    }
  }

  // ── Score ──────────────────────────────────────────────────────────────
  const totalImpact = findings.reduce((s, f) => s + f.impact, 0);
  const score = Math.max(
    0,
    Math.min(10, Math.round((totalImpact + 3) * 1.15 * 10) / 10),
  );

  const recommendations = [];
  if (foundLinters.length === 0)
    recommendations.push(getLinterRecommendation(primaryLanguage));
  if (foundFormatters.length === 0)
    recommendations.push(getFormatterRecommendation(primaryLanguage));
  if (!preCommit && !hasLintStaged)
    recommendations.push(
      "Consider pre-commit hooks for faster local feedback on changed files. Useful, but not mandatory if CI is already fast and reliable.",
    );
  if (totalSuppressions > 50)
    recommendations.push(
      `Reduce ${totalSuppressions} lint suppressions. Each one is tech debt.`,
    );

  return {
    category: "Conventions & Example Density",
    code: "CON",
    score,
    findings,
    recommendations,
  };
}
