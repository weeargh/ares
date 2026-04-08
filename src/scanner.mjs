import { join } from "node:path";
import { analyzeAGT } from "./analyzers/agt.mjs";
import { analyzeCICD } from "./analyzers/cicd.mjs";
import { analyzeCON } from "./analyzers/con.mjs";
import { analyzeENV } from "./analyzers/env.mjs";
import { analyzeERR } from "./analyzers/err.mjs";
import { analyzeMOD } from "./analyzers/mod.mjs";
import { analyzeMRC } from "./analyzers/mrc.mjs";
import { analyzeNAV } from "./analyzers/nav.mjs";
import { analyzeTEST } from "./analyzers/test.mjs";
import { analyzeTSC } from "./analyzers/tsc.mjs";
import { applyScoreWeights, detectRepoProfile } from "./profile.mjs";
import { getRatingForScore } from "./ratings.mjs";
import { classifyFile, detectLanguages, walkRepo } from "./utils.mjs";
import { discoverWorkspacePackages } from "./workspaces.mjs";

export function scan(repoPath, options = {}) {
  const startTime = Date.now();

  // ── Stage 1: Walk repo and classify files ──────────────────────────────
  const allFiles = walkRepo(repoPath);

  if (allFiles.length === 0) {
    return buildUnscorableResult(repoPath, startTime, {
      reason:
        "No scannable files were found in the target path. Point ARES at the repository root or a non-empty project directory.",
    });
  }

  const classified = {};
  for (const f of allFiles) {
    const type = classifyFile(f);
    if (!classified[type]) classified[type] = [];
    classified[type].push(f);
  }

  const sourceFiles = classified.source || [];
  const testFiles = classified.test || [];
  const configFiles = classified.config || [];
  const docFiles = classified.doc || [];
  const ciFiles = classified.ci || [];

  // ── Stage 2: Detect languages ──────────────────────────────────────────
  const languages = detectLanguages(allFiles);

  // ── Build context object ───────────────────────────────────────────────
  const ctx = {
    repoPath,
    files: allFiles,
    sourceFiles,
    testFiles,
    configFiles,
    docFiles,
    ciFiles,
    languages,
    classified,
    options,
  };

  const repoProfile = detectRepoProfile(ctx);
  ctx.repoType = repoProfile.repoType;
  ctx.repoProfile = repoProfile;

  // ── Stage 3: Run all analyzers ─────────────────────────────────────────
  const categories = options.categories
    ? options.categories.split(",").map((c) => c.trim().toUpperCase())
    : null;

  const analyzers = [
    { code: "MRC", fn: analyzeMRC },
    { code: "NAV", fn: analyzeNAV },
    { code: "TSC", fn: analyzeTSC },
    { code: "TEST", fn: analyzeTEST },
    { code: "ENV", fn: analyzeENV },
    { code: "MOD", fn: analyzeMOD },
    { code: "CON", fn: analyzeCON },
    { code: "ERR", fn: analyzeERR },
    { code: "CICD", fn: analyzeCICD },
    { code: "AGT", fn: analyzeAGT },
  ];

  const results = [];
  for (const { code, fn } of analyzers) {
    if (categories && !categories.includes(code)) continue;
    try {
      results.push(fn(ctx));
    } catch (err) {
      results.push({
        category: code,
        code,
        score: 0,
        findings: [
          {
            signal: "analyzer_error",
            value: err.message,
            impact: 0,
            detail: `Analyzer crashed: ${err.message}`,
          },
        ],
        recommendations: [],
      });
    }
  }

  // ── Stage 4: Compute overall score ─────────────────────────────────────
  const scored = applyScoreWeights(results, repoProfile.weights);
  const overallScore = scored.weightedOverallScore;
  const rawOverallScore = scored.rawOverallScore;

  let packages = [];
  let packageAverageScore = null;

  if (repoProfile.repoType === "monorepo" && !options.skipPackageDiscovery) {
    const discoveredPackages = discoverWorkspacePackages(repoPath, allFiles);
    packages = discoveredPackages.map((pkg) => {
      const packageResult = scan(join(repoPath, pkg.path), {
        categories: options.categories,
        skipPackageDiscovery: true,
      });

      return {
        name: pkg.name,
        path: pkg.path,
        private: pkg.private,
        repoType: packageResult.repoType,
        scoringProfile: packageResult.scoringProfile?.name || null,
        overallScore: packageResult.overallScore,
        rawOverallScore: packageResult.rawOverallScore,
        rating: packageResult.rating,
        summary: packageResult.summary,
      };
    });

    const scoredPackages = packages.filter(
      (pkg) => typeof pkg.overallScore === "number",
    );

    if (scoredPackages.length > 0) {
      packageAverageScore =
        Math.round(
          (scoredPackages.reduce((sum, pkg) => sum + pkg.overallScore, 0) /
            scoredPackages.length) *
            10,
        ) / 10;
    }
  }

  const rating = getRatingForScore(overallScore);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  return {
    repoPath,
    scanDate: new Date().toISOString(),
    elapsed: `${elapsed}s`,
    summary: {
      totalFiles: allFiles.length,
      sourceFiles: sourceFiles.length,
      testFiles: testFiles.length,
      languages: languages.slice(0, 5),
    },
    repoType: repoProfile.repoType,
    scoringProfile: {
      name: repoProfile.profileName,
      detectionMethod: repoProfile.detectionMethod,
      detectionReason: repoProfile.detectionReason,
      sizeClass: repoProfile.sizeClass,
      weights: repoProfile.weights,
    },
    overallScore,
    rawOverallScore,
    packageAverageScore,
    rating,
    categories: scored.categories,
    packages,
  };
}

function buildUnscorableResult(repoPath, startTime, { reason }) {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  return {
    repoPath,
    scanDate: new Date().toISOString(),
    elapsed: `${elapsed}s`,
    summary: {
      totalFiles: 0,
      sourceFiles: 0,
      testFiles: 0,
      languages: [],
    },
    repoType: null,
    scoringProfile: null,
    overallScore: null,
    rawOverallScore: null,
    packageAverageScore: null,
    rating: "Unscorable / Invalid Target",
    scorable: false,
    unscorableReason: reason,
    categories: [],
    packages: [],
  };
}
