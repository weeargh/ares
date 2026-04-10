import { readJSON } from "./utils.mjs";

const CATEGORY_CODES = [
  "MRC",
  "NAV",
  "TSC",
  "TEST",
  "ENV",
  "MOD",
  "CON",
  "ERR",
  "CICD",
  "AGT",
];
export const KNOWN_REPO_TYPES = [
  "auto",
  "cli",
  "library",
  "app",
  "service",
  "monorepo",
];

const PROFILE_WEIGHTS = {
  default: makeWeights({
    MRC: 1.2,
    NAV: 1.1,
    TSC: 0.9,
    TEST: 1.25,
    ENV: 1.25,
    MOD: 1.2,
    CON: 0.6,
    ERR: 0.85,
    CICD: 0.95,
    AGT: 1.15,
  }),
  cli: makeWeights({
    MRC: 1.25,
    NAV: 1.25,
    TSC: 0.7,
    TEST: 1.15,
    ENV: 1.0,
    MOD: 0.95,
    CON: 0.6,
    ERR: 0.8,
    CICD: 0.75,
    AGT: 1.1,
  }),
  library: makeWeights({
    MRC: 1.15,
    NAV: 1.1,
    TSC: 1.1,
    TEST: 1.2,
    ENV: 1.0,
    MOD: 1.1,
    CON: 0.65,
    ERR: 0.8,
    CICD: 0.85,
    AGT: 1.1,
  }),
  app: makeWeights({
    MRC: 1.15,
    NAV: 1.05,
    TSC: 0.95,
    TEST: 1.2,
    ENV: 1.25,
    MOD: 1.1,
    CON: 0.6,
    ERR: 0.9,
    CICD: 1.0,
    AGT: 1.15,
  }),
  service: makeWeights({
    MRC: 1.15,
    NAV: 1.05,
    TSC: 1.0,
    TEST: 1.25,
    ENV: 1.3,
    MOD: 1.2,
    CON: 0.6,
    ERR: 1.0,
    CICD: 1.1,
    AGT: 1.15,
  }),
  monorepo: makeWeights({
    MRC: 1.15,
    NAV: 1.2,
    TSC: 0.95,
    TEST: 1.2,
    ENV: 1.25,
    MOD: 1.3,
    CON: 0.6,
    ERR: 0.9,
    CICD: 1.0,
    AGT: 1.2,
  }),
};

function makeWeights(overrides) {
  return CATEGORY_CODES.reduce((weights, code) => {
    weights[code] = overrides[code] ?? 1.0;
    return weights;
  }, {});
}

function getAllDependencies(pkgJson) {
  return {
    ...pkgJson?.dependencies,
    ...pkgJson?.devDependencies,
    ...pkgJson?.peerDependencies,
    ...pkgJson?.optionalDependencies,
  };
}

function hasAnyDependency(allDeps, names) {
  return names.some((name) => allDeps[name]);
}

function hasAnyFile(files, patterns) {
  return patterns.some((pattern) =>
    typeof pattern === "string"
      ? files.includes(pattern)
      : files.some((file) => pattern.test(file)),
  );
}

function getSizeClass(sourceFileCount) {
  if (sourceFileCount <= 25) return "small";
  if (sourceFileCount <= 150) return "medium";
  return "large";
}

function titleCase(value) {
  if (value === "cli") return "CLI";
  if (value === "cicd") return "CI/CD";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function inferRepoType(ctx) {
  const files = ctx.files || [];
  const pkgJson = readJSON(ctx.repoPath, "package.json") || null;
  const allDeps = getAllDependencies(pkgJson);
  const packageJsonFiles = files.filter((file) =>
    /(^|\/)package\.json$/.test(file),
  );
  const goFiles = files.filter((file) => /\.go$/.test(file));
  const hasGoModule = files.includes("go.mod");

  const monorepo =
    files.includes("pnpm-workspace.yaml") ||
    files.includes("turbo.json") ||
    Boolean(pkgJson?.workspaces) ||
    packageJsonFiles.length > 1;
  if (monorepo) {
    return {
      repoType: "monorepo",
      detectionMethod: "auto",
      detectionReason: "Detected workspace/monorepo markers",
    };
  }

  const cli =
    Boolean(pkgJson?.bin) ||
    files.some((file) => /^bin\/.+\.(js|mjs|cjs|ts)$/.test(file)) ||
    hasAnyDependency(allDeps, [
      "commander",
      "yargs",
      "cac",
      "clipanion",
      "oclif",
      "meow",
    ]);
  if (cli) {
    return {
      repoType: "cli",
      detectionMethod: "auto",
      detectionReason: "Detected CLI entrypoint metadata or bin directory",
    };
  }

  const goService =
    hasGoModule &&
    (files.some((file) => /^(cmd\/main\.go|main\.go)$/.test(file)) ||
      files.some((file) =>
        /^(cmd\/[^/]+\/main\.go|api\/|consumer\/|worker\/|handlers?\/|repository\/|repositories\/|usecases?\/|internal\/(api|handler|handlers|consumer|worker|repository|repositories|usecase|usecases)\/)/.test(
          file,
        ),
      ) ||
      goFiles.length >= 20);

  const service =
    goService ||
    hasAnyDependency(allDeps, [
      "express",
      "fastify",
      "koa",
      "hono",
      "@hapi/hapi",
      "nestjs",
      "@nestjs/core",
    ]) ||
    hasAnyFile(files, [
      /^api\//,
      /^routes\//,
      /^controllers\//,
      /^server\.(js|mjs|cjs|ts)$/,
      /^src\/server\.(js|mjs|cjs|ts)$/,
    ]);
  if (service) {
    return {
      repoType: "service",
      detectionMethod: "auto",
      detectionReason: goService
        ? "Detected Go service/runtime layout markers"
        : "Detected backend/server framework markers",
    };
  }

  const app =
    hasAnyDependency(allDeps, [
      "react",
      "next",
      "vue",
      "nuxt",
      "svelte",
      "@angular/core",
      "vite",
      "react-native",
      "expo",
    ]) ||
    hasAnyFile(files, [
      /^public\//,
      /^app\//,
      /^pages\//,
      /^src\/app\//,
      /^src\/pages\//,
      /^vite\.config\./,
      /^next\.config\./,
    ]);
  if (app) {
    return {
      repoType: "app",
      detectionMethod: "auto",
      detectionReason: "Detected application/framework markers",
    };
  }

  const library =
    Boolean(pkgJson?.main) ||
    Boolean(pkgJson?.exports) ||
    Boolean(pkgJson?.module) ||
    ctx.sourceFiles.length > 0;
  if (library) {
    return {
      repoType: "library",
      detectionMethod: "auto",
      detectionReason:
        "Defaulted to library from package exports/source layout",
    };
  }

  return {
    repoType: "library",
    detectionMethod: "auto",
    detectionReason: "Default fallback",
  };
}

export function normalizeRepoType(value) {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();
  return KNOWN_REPO_TYPES.includes(normalized) ? normalized : null;
}

export function detectRepoProfile(ctx) {
  const override = normalizeRepoType(ctx.options?.repoType);
  const sizeClass = getSizeClass(ctx.sourceFiles.length);

  if (override && override !== "auto") {
    const weights = PROFILE_WEIGHTS[override] || PROFILE_WEIGHTS.default;
    return {
      repoType: override,
      sizeClass,
      profileName: `${titleCase(override)} Profile`,
      detectionMethod: "override",
      detectionReason: `Forced via --type ${override}`,
      weights,
    };
  }

  const detected = inferRepoType(ctx);
  const weights = PROFILE_WEIGHTS[detected.repoType] || PROFILE_WEIGHTS.default;

  return {
    ...detected,
    sizeClass,
    profileName: `${titleCase(detected.repoType)} Profile`,
    weights,
  };
}

export function applyScoreWeights(results, weights) {
  const weightedResults = results.map((result) => ({
    ...result,
    weight: weights[result.code] ?? 1,
  }));

  const rawAverage =
    results.length > 0
      ? results.reduce((sum, result) => sum + result.score, 0) / results.length
      : 0;

  const weightTotal = weightedResults.reduce(
    (sum, result) => sum + result.weight,
    0,
  );
  const weightedAverage =
    weightTotal > 0
      ? weightedResults.reduce(
          (sum, result) => sum + result.score * result.weight,
          0,
        ) / weightTotal
      : rawAverage;

  return {
    categories: weightedResults,
    rawOverallScore: roundScore(rawAverage),
    weightedOverallScore: roundScore(weightedAverage),
  };
}

function roundScore(score) {
  return Math.round(score * 10) / 10;
}
