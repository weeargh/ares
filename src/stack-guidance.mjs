export function getPrimaryLanguage(languages = []) {
  return languages[0]?.lang || "unknown";
}

export function getLinterRecommendation(primaryLanguage) {
  switch (primaryLanguage) {
    case "go":
      return "Add a linter appropriate for Go, such as golangci-lint, and enforce it in CI.";
    case "typescript":
    case "javascript":
      return "Add a linter appropriate for JS/TS, such as ESLint or Biome, and enforce it in CI.";
    case "python":
      return "Add a linter appropriate for Python, such as Ruff, and enforce it in CI.";
    case "rust":
      return "Add a linter appropriate for Rust, such as Clippy, and enforce it in CI.";
    case "java":
    case "kotlin":
      return "Add a linter or static analysis tool appropriate for the JVM stack, such as Checkstyle, SpotBugs, PMD, ktlint, or detekt, and enforce it in CI.";
    case "ruby":
      return "Add a linter appropriate for Ruby, such as RuboCop, and enforce it in CI.";
    case "php":
      return "Add a linter or static analysis tool appropriate for PHP, such as PHP_CodeSniffer or PHPStan, and enforce it in CI.";
    default:
      return "Add a linter appropriate for the stack and enforce it in CI.";
  }
}

export function getFormatterRecommendation(primaryLanguage) {
  switch (primaryLanguage) {
    case "go":
      return "Add formatter enforcement that fits Go, such as gofmt or gofumpt, with goimports if needed. Autoformat on save.";
    case "typescript":
    case "javascript":
      return "Add a formatter appropriate for JS/TS, such as Prettier or Biome, and autoformat on save.";
    case "python":
      return "Add a formatter appropriate for Python, such as Black or Ruff format, and autoformat on save.";
    case "rust":
      return "Add formatter enforcement for Rust, such as rustfmt, and autoformat on save.";
    case "java":
    case "kotlin":
      return "Add formatter enforcement for the JVM stack, such as Spotless, ktlint, or google-java-format, and autoformat on save.";
    case "ruby":
      return "Add formatter enforcement for Ruby, such as RuboCop autofix or StandardRB, and autoformat on save.";
    case "php":
      return "Add formatter enforcement for PHP, such as PHP CS Fixer or Pint, and autoformat on save.";
    default:
      return "Add a code formatter appropriate for the stack and autoformat on save.";
  }
}

export function getReproducibleEnvRecommendation(primaryLanguage, repoType) {
  const repoHint =
    repoType === "service" || repoType === "app"
      ? "for the full app stack"
      : "for local development";

  switch (primaryLanguage) {
    case "go":
    case "rust":
    case "java":
    case "kotlin":
      return `Add a reproducible dev environment ${repoHint}. Docker Compose, Dev Containers, Nix, or a documented bootstrap flow are all valid options.`;
    case "typescript":
    case "javascript":
    case "python":
      return `Add a reproducible dev environment ${repoHint}. Docker Compose, Dev Containers, Nix, or an equivalent setup workflow are all valid options.`;
    default:
      return `Add a reproducible dev environment ${repoHint}. Container-based, Nix-based, or documented local bootstrap approaches are all valid.`;
  }
}

export function getTaskRunnerRecommendation(primaryLanguage) {
  switch (primaryLanguage) {
    case "go":
      return "Add a single entrypoint for standard commands using Make, Just, Task, Mage, or an equivalent task runner so setup/test/lint/build are easy to discover.";
    case "rust":
      return "Add a single entrypoint for standard commands using Make, Just, cargo aliases, xtask, or an equivalent task runner so setup/test/lint/build are easy to discover.";
    case "java":
    case "kotlin":
      return "Add a single entrypoint for standard commands using Gradle, Maven, Make, Just, or an equivalent task runner so setup/test/lint/build are easy to discover.";
    case "typescript":
    case "javascript":
      return "Add a single entrypoint for standard commands using npm scripts, Make, Just, Task, or an equivalent task runner so setup/dev/test/lint/build are easy to discover.";
    default:
      return "Add a single entrypoint for standard commands so setup/dev/test/lint/build are easy to discover, whether via scripts, a task runner, or the stack's native build tool.";
  }
}

export function getCheckCommandRecommendation(primaryLanguage) {
  switch (primaryLanguage) {
    case "go":
      return "Add a standard validation entrypoint, for example `make check`, `just check`, or an equivalent command that runs the repo's normal validation workflow.";
    case "rust":
      return "Add a standard validation entrypoint, for example `cargo check` plus tests/lints through a single `make check`, `just check`, or equivalent workflow.";
    case "java":
    case "kotlin":
      return "Add a standard validation entrypoint, such as a Gradle/Maven verify task or an equivalent command that runs the repo's normal validation workflow.";
    case "typescript":
    case "javascript":
      return "Add a standard validation entrypoint, such as an npm `check` script or equivalent command that runs the repo's normal validation workflow.";
    default:
      return "Add a standard validation entrypoint that runs the repo's normal validation workflow.";
  }
}

export function getSmokeRecommendation(repoType, primaryLanguage) {
  const subject =
    repoType === "cli"
      ? "the CLI entrypoint"
      : repoType === "service"
        ? "the service entrypoint or a thin end-to-end path"
        : "the main entrypoint";

  switch (primaryLanguage) {
    case "go":
    case "rust":
    case "java":
    case "kotlin":
      return `Add a smoke or integration command that exercises ${subject}, whether through the native build tool, a task runner, or a small scripted check.`;
    default:
      return `Add a smoke or integration command that exercises ${subject}.`;
  }
}

export function getCoverageRecommendation(primaryLanguage) {
  switch (primaryLanguage) {
    case "go":
      return "Configure test coverage reporting, for example with `go test -cover` and a CI-visible coverage artifact.";
    case "rust":
      return "Configure test coverage reporting, for example with cargo-llvm-cov or an equivalent CI-visible coverage artifact.";
    case "python":
      return "Configure test coverage reporting, for example with coverage.py or pytest-cov.";
    case "java":
    case "kotlin":
      return "Configure test coverage reporting, for example with JaCoCo or an equivalent JVM coverage tool.";
    case "typescript":
    case "javascript":
      return "Configure test coverage reporting, for example with Jest, Vitest, c8, or another CI-visible coverage artifact.";
    default:
      return "Configure test coverage reporting in a way that the team and CI can inspect.";
  }
}

export function getContractRecommendation(primaryLanguage) {
  switch (primaryLanguage) {
    case "javascript":
      return "Strengthen machine-readable contracts as the API surface grows. TypeScript is one strong option, but clear JSDoc types, schemas, and runtime validation at boundaries also improve refactor safety and interface clarity.";
    case "python":
      return "Strengthen machine-readable contracts as the API surface grows. Type hints, mypy/pyright, schemas, and boundary validation can all improve refactor safety and interface clarity.";
    case "ruby":
    case "php":
      return "Strengthen machine-readable contracts as the API surface grows. Schemas, generated API definitions, static analysis, and runtime validation at boundaries all help agents refactor safely.";
    default:
      return "Strengthen machine-readable contracts as the API surface grows. Static types, schemas, and boundary validation all count if they make interfaces more explicit and safer to change.";
  }
}

export function getBoundaryValidationRecommendation(primaryLanguage) {
  switch (primaryLanguage) {
    case "typescript":
    case "javascript":
      return "Add runtime validation for external inputs and API boundaries, using schemas or validators appropriate for the stack.";
    case "python":
      return "Add runtime validation for external inputs and API boundaries, for example with Pydantic or equivalent schema validation.";
    case "java":
    case "kotlin":
      return "Add runtime validation for external inputs and API boundaries, for example with Bean Validation, JSON Schema, or equivalent contract checks.";
    case "go":
      return "Add validation for external inputs and API boundaries, whether through request validation, schema checks, or generated contracts.";
    default:
      return "Add validation for external inputs and API boundaries using schemas, contract tooling, or validators appropriate for the stack.";
  }
}
