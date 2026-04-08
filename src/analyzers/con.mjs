import { fileExists, grepCount, readFile, readJSON } from "../utils.mjs";

export function analyzeCON(ctx) {
  const { repoPath, sourceFiles } = ctx;
  const findings = [];

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
    recommendations.push(
      "Add a linter (ESLint for JS/TS, Ruff for Python). Enforce in CI.",
    );
  if (foundFormatters.length === 0)
    recommendations.push(
      "Add a code formatter (Prettier for JS/TS, Black for Python). Autoformat on save.",
    );
  if (!preCommit && !hasLintStaged)
    recommendations.push(
      "Add pre-commit hooks (husky + lint-staged) for fast local feedback",
    );
  if (totalSuppressions > 50)
    recommendations.push(
      `Reduce ${totalSuppressions} lint suppressions. Each one is tech debt.`,
    );

  return {
    category: "Code Consistency & Conventions",
    code: "CON",
    score,
    findings,
    recommendations,
  };
}
