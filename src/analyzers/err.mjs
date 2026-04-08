import { basename } from "node:path";
import { grepCount, readFile, readJSON } from "../utils.mjs";

export function analyzeERR(ctx) {
  const { repoPath, files, sourceFiles } = ctx;
  const findings = [];

  const nonTestSource = sourceFiles.filter(
    (f) => !/test|spec|mock|fixture|__tests__/i.test(f),
  );

  // ── Empty catch blocks ─────────────────────────────────────────────────
  // JS/TS: catch (e) {} or catch { }
  const emptyCatch = grepCount(
    repoPath,
    nonTestSource,
    /catch\s*\([^)]*\)\s*\{\s*\}|catch\s*\{\s*\}/,
    {
      extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"],
    },
  );
  // Python: except: pass or except Exception: pass
  const exceptPass = grepCount(
    repoPath,
    nonTestSource,
    /except\s*:\s*pass|except\s*:\s*$|except\s+\w+.*:\s*pass\s*$/,
    {
      extensions: [".py"],
    },
  );
  const totalEmpty = emptyCatch.count + exceptPass.count;

  findings.push({
    signal: "empty_catch",
    value: totalEmpty,
    impact:
      totalEmpty === 0 ? 2 : totalEmpty <= 3 ? 1 : totalEmpty <= 10 ? 0 : -1,
    detail:
      totalEmpty === 0
        ? "No empty catch blocks found"
        : `${totalEmpty} empty catch blocks (${emptyCatch.count} JS/TS, ${exceptPass.count} Python)`,
  });

  // ── Console.log as primary logging ─────────────────────────────────────
  const consoleLog = grepCount(
    repoPath,
    nonTestSource,
    /console\.(log|warn|error|info|debug)\s*\(/,
    {
      extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"],
    },
  );
  const printStatements = grepCount(repoPath, nonTestSource, /\bprint\s*\(/, {
    extensions: [".py"],
  });

  // Check if structured logging exists
  const pkgJson = readJSON(repoPath, "package.json");
  const allDeps = { ...pkgJson?.dependencies, ...pkgJson?.devDependencies };
  const structuredLoggers = [
    "pino",
    "winston",
    "bunyan",
    "log4js",
    "signale",
    "tslog",
  ].filter((d) => allDeps?.[d]);

  findings.push({
    signal: "console_logging",
    value: consoleLog.count + printStatements.count,
    impact:
      consoleLog.count + printStatements.count === 0
        ? 1
        : structuredLoggers.length > 0
          ? 0.5
          : consoleLog.count + printStatements.count < 20
            ? 0
            : -0.5,
    detail: `${consoleLog.count} console.log/warn/error + ${printStatements.count} print() calls. ${structuredLoggers.length > 0 ? `Structured logger: ${structuredLoggers.join(", ")}` : "No structured logging library."}`,
  });

  // ── Custom error classes ───────────────────────────────────────────────
  const customErrors = grepCount(
    repoPath,
    nonTestSource,
    /class\s+\w+(?:Error|Exception)\s+extends|class\s+\w+Error\(|class\s+\w+Exception\(/,
  );

  findings.push({
    signal: "custom_errors",
    value: customErrors.count,
    impact: customErrors.count > 5 ? 1.5 : customErrors.count > 0 ? 1 : 0,
    detail:
      customErrors.count > 0
        ? `${customErrors.count} custom error/exception classes`
        : "No custom error classes (using generic errors only)",
  });

  // ── Error codes / typed errors ─────────────────────────────────────────
  const errorCodes = grepCount(
    repoPath,
    nonTestSource,
    /errorCode|error_code|errCode|err_code|ERROR_CODE|code:\s*['"][A-Z_]+['"]/,
  );
  findings.push({
    signal: "error_codes",
    value: errorCodes.count > 0,
    impact: errorCodes.count > 0 ? 0.5 : 0,
    detail:
      errorCodes.count > 0
        ? `${errorCodes.count} error code references found`
        : "No error codes detected",
  });

  // ── Result/Either types ────────────────────────────────────────────────
  const resultTypes = grepCount(
    repoPath,
    nonTestSource,
    /Result<|Either<|neverthrow|ts-results|oxide\.ts|fp-ts\/Either|result\.Ok|result\.Err/,
  );
  findings.push({
    signal: "result_types",
    value: resultTypes.count > 0,
    impact: resultTypes.count > 0 ? 1 : 0,
    detail:
      resultTypes.count > 0
        ? `Result/Either types in use (${resultTypes.count} references)`
        : "No Result/Either type patterns detected",
  });

  // ── Generic error throws ───────────────────────────────────────────────
  const genericThrows = grepCount(
    repoPath,
    nonTestSource,
    /throw new Error\s*\(\s*['"`]|raise\s+Exception\s*\(/,
  );
  const specificThrows = grepCount(
    repoPath,
    nonTestSource,
    /throw new \w+Error\s*\(|raise\s+\w+Error\s*\(|raise\s+\w+Exception\s*\(/,
  );
  const throwTotal = genericThrows.count + specificThrows.count;
  const specificPct =
    throwTotal > 0 ? (specificThrows.count / throwTotal) * 100 : 0;

  findings.push({
    signal: "error_specificity",
    value: specificPct,
    impact:
      throwTotal === 0 ? 0 : specificPct > 60 ? 1 : specificPct > 30 ? 0.5 : 0,
    detail:
      throwTotal === 0
        ? "No error throws detected"
        : `${specificPct.toFixed(0)}% of throws use specific error types (${specificThrows.count} specific, ${genericThrows.count} generic)`,
  });

  // ── Validation patterns ────────────────────────────────────────────────
  const validation = grepCount(
    repoPath,
    nonTestSource,
    /\.parse\(|\.safeParse\(|\.validate\(|\.check\(|ValidationError|BadRequest|InvalidInput|zod|yup|joi/i,
  );
  findings.push({
    signal: "validation_patterns",
    value: validation.count > 0,
    impact: validation.count > 5 ? 1 : validation.count > 0 ? 0.5 : 0,
    detail: `${validation.count} validation pattern references found`,
  });

  // ── Score ──────────────────────────────────────────────────────────────
  const totalImpact = findings.reduce((s, f) => s + f.impact, 0);
  const score = Math.max(
    0,
    Math.min(10, Math.round((totalImpact + 1.5) * 1.0 * 10) / 10),
  );

  const recommendations = [];
  if (totalEmpty > 0)
    recommendations.push(
      `Fix ${totalEmpty} empty catch blocks. Swallowed errors are invisible to agents.`,
    );
  if (customErrors.count === 0)
    recommendations.push(
      "Create custom error classes with error codes. Agents debug by reading error messages.",
    );
  if (structuredLoggers.length === 0 && consoleLog.count > 10)
    recommendations.push(
      "Replace console.log with structured logging (pino recommended for Node.js)",
    );
  if (specificPct < 30 && throwTotal > 5)
    recommendations.push(
      "Use specific error types instead of generic Error. Include context about what failed and why.",
    );

  return {
    category: "Error Handling & Diagnostics",
    code: "ERR",
    score,
    findings,
    recommendations,
  };
}
