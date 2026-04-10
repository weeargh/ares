import {
  getBoundaryValidationRecommendation,
  getContractRecommendation,
} from "../stack-guidance.mjs";
import { fileExists, grepCount, readFile, readJSON } from "../utils.mjs";

export function analyzeTSC(ctx) {
  const { repoPath, files, sourceFiles, languages, testFiles, repoType } = ctx;
  const findings = [];
  const primaryLang = languages[0]?.lang || "unknown";
  const testRatio =
    sourceFiles.length > 0 ? testFiles.length / sourceFiles.length : 0;
  const smallSurface = sourceFiles.length <= 25;
  const mediumSurface = sourceFiles.length <= 60;

  // ── Detect typed vs untyped language ───────────────────────────────────
  const inherentlyTyped = [
    "rust",
    "go",
    "java",
    "kotlin",
    "csharp",
    "swift",
    "dart",
  ].includes(primaryLang);
  const tsFiles = sourceFiles.filter((f) => /\.(ts|tsx)$/.test(f));
  const jsFiles = sourceFiles.filter((f) => /\.(js|jsx|mjs|cjs)$/.test(f));
  const pyFiles = sourceFiles.filter((f) => /\.py$/.test(f));
  const goFiles = sourceFiles.filter((f) => /\.go$/.test(f));
  const isTS = tsFiles.length > jsFiles.length;
  const hasTS = tsFiles.length > 0;

  if (inherentlyTyped) {
    findings.push({
      signal: "typed_language",
      value: true,
      impact: 3,
      detail: `Primary language (${primaryLang}) is inherently typed`,
    });
  } else if (isTS) {
    findings.push({
      signal: "typescript_dominant",
      value: true,
      impact: 2,
      detail: `TypeScript (${tsFiles.length} files) over JavaScript (${jsFiles.length} files)`,
    });
  } else if (hasTS) {
    findings.push({
      signal: "partial_typescript",
      value: true,
      impact: 1,
      detail: `Mixed: ${tsFiles.length} TS, ${jsFiles.length} JS files`,
    });
  } else if (jsFiles.length > 0) {
    const impact =
      repoType === "cli" && smallSurface
        ? 0
        : smallSurface && testRatio >= 0.2
          ? -0.25
          : mediumSurface
            ? -0.5
            : -1;
    findings.push({
      signal: "untyped_javascript",
      value: true,
      impact,
      detail:
        impact === 0
          ? `${jsFiles.length} JavaScript files with no TypeScript, but repo size/scope keeps contract risk moderate`
          : `${jsFiles.length} JavaScript files with no TypeScript`,
    });
  }

  if (jsFiles.length > 0 && !hasTS) {
    findings.push({
      signal: "js_surface_area",
      value: sourceFiles.length,
      impact: smallSurface ? 0.75 : mediumSurface ? 0.25 : 0,
      detail: smallSurface
        ? `Small JavaScript surface area (${sourceFiles.length} source files)`
        : mediumSurface
          ? `Moderate JavaScript surface area (${sourceFiles.length} source files)`
          : `Large JavaScript surface area (${sourceFiles.length} source files)`,
    });

    const jsdoc = grepCount(
      repoPath,
      jsFiles.slice(0, 50),
      /\/\*\*|@param\b|@returns?\b|@typedef\b|@type\b/,
      { extensions: [".js", ".jsx", ".mjs", ".cjs"] },
    );
    findings.push({
      signal: "js_contract_hints",
      value: jsdoc.count,
      impact:
        jsdoc.count > 20
          ? 1
          : jsdoc.count > 5
            ? 0.5
            : jsdoc.count > 0
              ? 0.25
              : 0,
      detail:
        jsdoc.count > 0
          ? `${jsdoc.count} JSDoc/type hint references in JavaScript files`
          : "No JSDoc/type hint references detected in JavaScript files",
    });
  }

  // ── tsconfig strict mode ───────────────────────────────────────────────
  if (hasTS) {
    const tsconfig = readJSON(repoPath, "tsconfig.json");
    if (tsconfig) {
      const strict = tsconfig.compilerOptions?.strict === true;
      const noAny = tsconfig.compilerOptions?.noImplicitAny === true;
      findings.push({
        signal: "ts_strict",
        value: strict,
        impact: strict ? 2 : noAny ? 1 : 0,
        detail: strict
          ? "tsconfig strict: true"
          : noAny
            ? "noImplicitAny enabled (but not full strict)"
            : "TypeScript strict mode NOT enabled",
      });
    }
  }

  // ── Python type hints ──────────────────────────────────────────────────
  if (pyFiles.length > 0) {
    const mypyConfig = fileExists(
      repoPath,
      "mypy.ini",
      ".mypy.ini",
      "setup.cfg",
      "pyproject.toml",
    );
    if (mypyConfig) {
      const content = readFile(repoPath, mypyConfig) || "";
      const hasMypy = content.includes("[mypy") || content.includes("mypy");
      const strictMypy =
        content.includes("strict = true") ||
        content.includes("strict=true") ||
        content.includes("--strict");
      findings.push({
        signal: "python_typecheck",
        value: hasMypy,
        impact: strictMypy ? 2 : hasMypy ? 1 : 0,
        detail: strictMypy
          ? "mypy strict mode configured"
          : hasMypy
            ? "mypy configured (not strict)"
            : `Config file ${mypyConfig} exists but no mypy config found`,
      });
    }

    // Check for type hints in Python files (sample first 20)
    let hinted = 0;
    let sampled = 0;
    for (const f of pyFiles.slice(0, 20)) {
      const content = readFile(repoPath, f);
      if (!content) continue;
      sampled++;
      if (/def \w+\([^)]*:/.test(content) || /-> /.test(content)) hinted++;
    }
    if (sampled > 0) {
      const hintPct = (hinted / sampled) * 100;
      findings.push({
        signal: "python_type_hints",
        value: hintPct,
        impact: hintPct > 80 ? 1 : hintPct > 50 ? 0.5 : 0,
        detail: `${hintPct.toFixed(0)}% of sampled Python files have type hints (${hinted}/${sampled})`,
      });
    }
  }

  if (goFiles.length > 0) {
    const interfaceDefs = grepCount(
      repoPath,
      goFiles,
      /\btype\s+\w+\s+interface\s*\{/,
      { extensions: [".go"] },
    );
    findings.push({
      signal: "go_interfaces",
      value: interfaceDefs.count,
      impact:
        interfaceDefs.count > 30
          ? 1.5
          : interfaceDefs.count > 10
            ? 1
            : interfaceDefs.count > 0
              ? 0.5
              : 0,
      detail:
        interfaceDefs.count > 0
          ? `${interfaceDefs.count} Go interface definitions detected`
          : "No explicit Go interface definitions detected",
    });

    const validationTags = grepCount(repoPath, goFiles, /validate:"[^"]+"/, {
      extensions: [".go"],
    });
    findings.push({
      signal: "go_validation_tags",
      value: validationTags.count,
      impact:
        validationTags.count > 20 ? 1 : validationTags.count > 5 ? 0.5 : 0,
      detail:
        validationTags.count > 0
          ? `${validationTags.count} Go validation-tag usages detected`
          : "No Go validation tags detected",
    });

    const explicitWiringFiles = files.filter((file) =>
      /(_dep|_init)\.go$/.test(file),
    );
    findings.push({
      signal: "go_explicit_wiring",
      value: explicitWiringFiles.length,
      impact:
        explicitWiringFiles.length > 20
          ? 1
          : explicitWiringFiles.length > 5
            ? 0.5
            : 0,
      detail:
        explicitWiringFiles.length > 0
          ? `${explicitWiringFiles.length} Go dependency-wiring files (_dep.go/_init.go) detected`
          : "No explicit Go dependency-wiring files detected",
    });
  }

  // ── `any` type usage ───────────────────────────────────────────────────
  if (hasTS) {
    const anyCount = grepCount(repoPath, tsFiles, /:\s*any\b|<any>|as any/, {
      extensions: [".ts", ".tsx"],
    });
    const tsIgnore = grepCount(
      repoPath,
      tsFiles,
      /@ts-ignore|@ts-expect-error|@ts-nocheck/,
    );
    const anyPer1k = tsFiles.length > 0 ? anyCount.count / tsFiles.length : 0;

    findings.push({
      signal: "any_usage",
      value: anyCount.count,
      impact:
        anyCount.count === 0 ? 1.5 : anyPer1k < 1 ? 0.5 : anyPer1k < 3 ? 0 : -1,
      detail: `${anyCount.count} 'any' usages across ${tsFiles.length} TS files (${anyPer1k.toFixed(1)}/file)`,
    });

    findings.push({
      signal: "ts_ignore",
      value: tsIgnore.count,
      impact: tsIgnore.count === 0 ? 0.5 : tsIgnore.count <= 5 ? 0 : -0.5,
      detail: `${tsIgnore.count} @ts-ignore/@ts-expect-error directives`,
    });
  }

  // ── Python type:ignore ─────────────────────────────────────────────────
  if (pyFiles.length > 0) {
    const typeIgnore = grepCount(repoPath, pyFiles, /# type:\s*ignore/);
    findings.push({
      signal: "python_type_ignore",
      value: typeIgnore.count,
      impact: typeIgnore.count === 0 ? 0.5 : typeIgnore.count <= 10 ? 0 : -0.5,
      detail: `${typeIgnore.count} '# type: ignore' directives in Python`,
    });
  }

  // ── Validation libraries ───────────────────────────────────────────────
  const pkgJson = readJSON(repoPath, "package.json");
  const allDeps = { ...pkgJson?.dependencies, ...pkgJson?.devDependencies };
  const validators = [
    "zod",
    "joi",
    "yup",
    "io-ts",
    "typebox",
    "ajv",
    "class-validator",
    "superstruct",
    "valibot",
    "arktype",
  ];
  const foundValidators = validators.filter((v) => allDeps?.[v]);

  if (pkgJson) {
    findings.push({
      signal: "validation_library",
      value: foundValidators.length > 0,
      impact: foundValidators.length > 0 ? 1 : 0,
      detail:
        foundValidators.length > 0
          ? `Validation: ${foundValidators.join(", ")}`
          : "No runtime validation library detected",
    });
  }

  const hasApiSurface =
    repoType === "service" ||
    files.some((file) => /^api\//.test(file) || /^routes\//.test(file)) ||
    files.some((file) =>
      /openapi|swagger|schema\.graphql|\.proto$/i.test(file),
    );
  const contractSpecFiles = files.filter((file) =>
    /openapi|swagger|schema\.graphql|\.proto$/i.test(file),
  );
  if (contractSpecFiles.length > 0) {
    findings.push({
      signal: "contract_specs",
      value: contractSpecFiles.length,
      impact:
        contractSpecFiles.length >= 3
          ? 1.5
          : contractSpecFiles.length > 0
            ? 1
            : 0,
      detail: `${contractSpecFiles.length} contract/spec files detected: ${contractSpecFiles.slice(0, 5).join(", ")}`,
    });
  }

  // Pydantic for Python
  const pyproject = readFile(repoPath, "pyproject.toml") || "";
  const requirements = readFile(repoPath, "requirements.txt") || "";
  const hasPydantic =
    pyproject.includes("pydantic") || requirements.includes("pydantic");
  if (pyFiles.length > 0) {
    findings.push({
      signal: "pydantic",
      value: hasPydantic,
      impact: hasPydantic ? 1 : 0,
      detail: hasPydantic
        ? "Pydantic detected"
        : "No Pydantic (Python validation)",
    });
  }
  const hasBoundaryValidation = foundValidators.length > 0 || hasPydantic;

  // ── Score ──────────────────────────────────────────────────────────────
  const totalImpact = findings.reduce((s, f) => s + f.impact, 0);
  const score = Math.max(
    0,
    Math.min(10, Math.round((totalImpact + 1.5) * 1.0 * 10) / 10),
  );

  const recommendations = [];
  if (
    !isTS &&
    !inherentlyTyped &&
    jsFiles.length > 0 &&
    (repoType === "service" || repoType === "library") &&
    !smallSurface
  )
    recommendations.push(getContractRecommendation(primaryLang));
  if (hasTS && !findings.find((f) => f.signal === "ts_strict")?.value)
    recommendations.push("Enable strict: true in tsconfig.json");
  if (findings.find((f) => f.signal === "any_usage")?.value > 10)
    recommendations.push(
      `Eliminate ${findings.find((f) => f.signal === "any_usage").value} 'any' usages. Each one is a hole in the agent's guardrails.`,
    );
  if (!hasBoundaryValidation && hasApiSurface && !smallSurface)
    recommendations.push(getBoundaryValidationRecommendation(primaryLang));

  return {
    category: "Contracts & Explicitness",
    code: "TSC",
    score,
    findings,
    recommendations,
  };
}
