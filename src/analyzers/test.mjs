import { classifyFile, fileExists, readFile, readJSON } from "../utils.mjs";

export function analyzeTEST(ctx) {
  const { repoPath, files, sourceFiles, repoType } = ctx;
  const findings = [];

  const testFiles = files.filter((f) => classifyFile(f) === "test");
  const testRatio =
    sourceFiles.length > 0 ? testFiles.length / sourceFiles.length : 0;

  // ── Test existence ─────────────────────────────────────────────────────
  findings.push({
    signal: "test_files_exist",
    value: testFiles.length,
    impact: testFiles.length === 0 ? -2 : testFiles.length < 5 ? 0.5 : 1,
    detail: `${testFiles.length} test files found`,
  });

  findings.push({
    signal: "test_to_source_ratio",
    value: testRatio,
    impact:
      testRatio > 0.8
        ? 2
        : testRatio > 0.5
          ? 1.5
          : testRatio > 0.3
            ? 1
            : testRatio > 0.1
              ? 0.5
              : 0,
    detail: `Test-to-source ratio: ${testRatio.toFixed(2)} (${testFiles.length} tests / ${sourceFiles.length} source)`,
  });

  // ── Test framework config ──────────────────────────────────────────────
  const pkgJson = readJSON(repoPath, "package.json");
  const allDeps = { ...pkgJson?.dependencies, ...pkgJson?.devDependencies };
  const testScript = pkgJson?.scripts?.test || "";
  const smokeScript = pkgJson?.scripts?.smoke || "";
  const checkScript = pkgJson?.scripts?.check || "";

  const jsFrameworks = [
    "jest",
    "vitest",
    "mocha",
    "ava",
    "tap",
    "jasmine",
    "@playwright/test",
    "cypress",
  ];
  const foundJsFrameworks = jsFrameworks.filter((f) => allDeps?.[f]);

  const pyFrameworks = ["pytest", "unittest", "nose", "tox"];
  const pyproject = readFile(repoPath, "pyproject.toml") || "";
  const requirements =
    readFile(repoPath, "requirements.txt") ||
    readFile(repoPath, "requirements-dev.txt") ||
    "";
  const foundPyFrameworks = pyFrameworks.filter(
    (f) => pyproject.includes(f) || requirements.includes(f),
  );

  const goTestExists = files.some((f) => /_test\.go$/.test(f));
  const rustTestExists = files.some(
    (f) => /tests\//.test(f) && /\.rs$/.test(f),
  );

  const scriptFrameworks = [];
  if (/node\s+--test/.test(testScript)) scriptFrameworks.push("node:test");
  if (/\bvitest\b/.test(testScript)) scriptFrameworks.push("vitest");
  if (/\bjest\b/.test(testScript)) scriptFrameworks.push("jest");
  if (/\bmocha\b/.test(testScript)) scriptFrameworks.push("mocha");

  const allFrameworks = [
    ...foundJsFrameworks,
    ...foundPyFrameworks,
    ...scriptFrameworks,
    ...(goTestExists ? ["go test"] : []),
    ...(rustTestExists ? ["cargo test"] : []),
  ];

  findings.push({
    signal: "test_framework",
    value: allFrameworks.length > 0,
    impact: allFrameworks.length > 0 ? 1 : 0,
    detail:
      allFrameworks.length > 0
        ? `Test frameworks: ${allFrameworks.join(", ")}`
        : "No test framework detected",
  });

  // ── Test script in package.json ────────────────────────────────────────
  const hasTestScript =
    testScript && testScript !== 'echo "Error: no test specified" && exit 1';
  findings.push({
    signal: "test_script",
    value: !!hasTestScript,
    impact: hasTestScript ? 1 : testScript === undefined ? 0 : -0.5,
    detail: hasTestScript
      ? `Test script: ${testScript}`
      : "No working test script in package.json",
  });

  findings.push({
    signal: "smoke_script",
    value: !!smokeScript,
    impact: smokeScript ? 0.75 : 0,
    detail: smokeScript
      ? `Smoke test command: ${smokeScript}`
      : "No smoke/integration check command",
  });

  findings.push({
    signal: "check_script",
    value: !!checkScript,
    impact: checkScript ? 0.75 : 0,
    detail: checkScript
      ? `Aggregate check command: ${checkScript}`
      : "No aggregate check command",
  });

  // ── Coverage config ────────────────────────────────────────────────────
  const hasCoverageConfig =
    files.some((f) => /\.nycrc|\.c8rc|coverage/.test(f)) ||
    (readFile(repoPath, "jest.config.js") || "").includes("coverage") ||
    (readFile(repoPath, "jest.config.ts") || "").includes("coverage") ||
    (readFile(repoPath, "vitest.config.ts") || "").includes("coverage") ||
    (readFile(repoPath, "vitest.config.js") || "").includes("coverage") ||
    pyproject.includes("coverage") ||
    fileExists(repoPath, ".coveragerc", "setup.cfg");

  const coverageReport = fileExists(
    repoPath,
    "coverage/lcov.info",
    "coverage.xml",
    "htmlcov",
    "coverage/coverage-summary.json",
  );

  findings.push({
    signal: "coverage_config",
    value: !!hasCoverageConfig,
    impact: hasCoverageConfig ? 0.5 : 0,
    detail: hasCoverageConfig
      ? "Coverage config detected"
      : "No coverage configuration found",
  });

  findings.push({
    signal: "coverage_report",
    value: !!coverageReport,
    impact: coverageReport ? 0.5 : 0,
    detail: coverageReport
      ? `Coverage report exists: ${coverageReport}`
      : "No coverage report found (may be gitignored)",
  });

  // ── Test utilities (factories, fixtures, builders) ─────────────────────
  const testUtils = files.filter(
    (f) =>
      /factory|fixture|builder|mock|fake|stub|helper/i.test(f) &&
      (classifyFile(f) === "test" || classifyFile(f) === "source"),
  );
  findings.push({
    signal: "test_utilities",
    value: testUtils.length,
    impact: testUtils.length > 3 ? 1 : testUtils.length > 0 ? 0.5 : 0,
    detail: `${testUtils.length} test utility files (factories/fixtures/mocks): ${testUtils.slice(0, 5).join(", ")}`,
  });

  // ── E2E / integration tests ────────────────────────────────────────────
  const e2eFiles = files.filter(
    (f) =>
      /e2e|integration|playwright|cypress/i.test(f) &&
      /\.(ts|js|py|go)$/.test(f),
  );
  findings.push({
    signal: "e2e_tests",
    value: e2eFiles.length,
    impact: e2eFiles.length > 0 ? 0.5 : 0,
    detail:
      e2eFiles.length > 0
        ? `${e2eFiles.length} e2e/integration test files`
        : "No e2e/integration tests detected",
  });

  // ── Score ──────────────────────────────────────────────────────────────
  const totalImpact = findings.reduce((s, f) => s + f.impact, 0);
  const score = Math.max(
    0,
    Math.min(10, Math.round((totalImpact + 1.5) * 1.1 * 10) / 10),
  );

  const recommendations = [];
  if (testFiles.length === 0)
    recommendations.push("Add tests. An agent without tests is flying blind.");
  if (testRatio < 0.3 && testFiles.length > 0)
    recommendations.push(
      `Increase test coverage. Current ratio (${testRatio.toFixed(2)}) is low.`,
    );
  if (!hasTestScript && pkgJson)
    recommendations.push('Add a working "test" script to package.json');
  if (!smokeScript && testFiles.length > 0)
    recommendations.push(
      "Add a smoke or integration command that exercises the CLI or main entrypoint",
    );
  if (!checkScript && hasTestScript)
    recommendations.push(
      'Add a "check" script that runs the repo\'s standard validation workflow',
    );
  if (
    !hasCoverageConfig &&
    (repoType === "service" ||
      repoType === "library" ||
      sourceFiles.length > 30)
  )
    recommendations.push("Configure test coverage reporting");
  if (testUtils.length === 0 && testFiles.length > 5)
    recommendations.push(
      "Create test utilities (factories, fixtures) to make test creation easier for agents",
    );

  return {
    category: "Test Infrastructure",
    code: "TEST",
    score,
    findings,
    recommendations,
  };
}
