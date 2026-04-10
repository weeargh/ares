import { basename, dirname, extname } from "node:path";
import { classifyFile, countLines, getDirectories } from "../utils.mjs";

export function analyzeNAV(ctx) {
  const { repoPath, files, sourceFiles, languages } = ctx;
  const findings = [];
  const primaryLanguage = languages[0]?.lang || null;

  // ── File size distribution ─────────────────────────────────────────────
  const fileSizes = [];
  for (const f of sourceFiles) {
    const lines = countLines(repoPath, f);
    fileSizes.push({ file: f, lines });
  }
  fileSizes.sort((a, b) => b.lines - a.lines);

  const godFiles = fileSizes.filter((f) => f.lines > 500);
  const megaFiles = fileSizes.filter((f) => f.lines > 1000);
  const medianSize =
    fileSizes.length > 0
      ? fileSizes[Math.floor(fileSizes.length / 2)].lines
      : 0;
  const godPct =
    sourceFiles.length > 0 ? (godFiles.length / sourceFiles.length) * 100 : 0;

  findings.push({
    signal: "god_files",
    value: godFiles.length,
    impact:
      godFiles.length === 0
        ? 2
        : godFiles.length <= 3
          ? 1
          : godFiles.length <= 10
            ? 0
            : -1,
    detail:
      godFiles.length === 0
        ? "No files over 500 lines"
        : `${godFiles.length} files over 500 lines (${godPct.toFixed(1)}%): ${godFiles
            .slice(0, 5)
            .map((f) => `${f.file} (${f.lines}L)`)
            .join(", ")}`,
  });

  findings.push({
    signal: "mega_files",
    value: megaFiles.length,
    impact: megaFiles.length === 0 ? 0.5 : -0.5 * Math.min(megaFiles.length, 5),
    detail:
      megaFiles.length === 0
        ? "No files over 1000 lines"
        : `${megaFiles.length} files over 1000 lines: ${megaFiles
            .slice(0, 3)
            .map((f) => `${f.file} (${f.lines}L)`)
            .join(", ")}`,
  });

  findings.push({
    signal: "median_file_size",
    value: medianSize,
    impact: medianSize < 150 ? 1 : medianSize < 300 ? 0.5 : 0,
    detail: `Median source file: ${medianSize} lines`,
  });

  // ── Catch-all directories ──────────────────────────────────────────────
  const dirs = getDirectories(files);
  const catchAllNames = [
    "utils",
    "helpers",
    "common",
    "misc",
    "shared",
    "lib",
    "tools",
    "general",
  ];
  const catchAlls = dirs.filter((d) => {
    const name = basename(d).toLowerCase();
    return catchAllNames.includes(name);
  });

  findings.push({
    signal: "catchall_dirs",
    value: catchAlls.length,
    impact: catchAlls.length === 0 ? 1 : catchAlls.length <= 2 ? 0 : -0.5,
    detail:
      catchAlls.length === 0
        ? "No catch-all directories (utils/, helpers/, etc.)"
        : `${catchAlls.length} catch-all dirs: ${catchAlls.join(", ")}`,
  });

  // ── Test colocation ────────────────────────────────────────────────────
  const testFiles = files.filter((f) => classifyFile(f) === "test");
  const substantiveTestFiles = testFiles.filter(
    (f) =>
      !/(^|\/)(mock|mocks|fixture|fixtures|helper|helpers|support|stubs?)(\/|$)/i.test(
        f,
      ) && !/(^|\/)(setup|bootstrap)\.[^.]+$/i.test(f),
  );
  const sourceDirs = [...new Set(sourceFiles.map((f) => dirname(f)))].filter(
    (dir) => dir !== ".",
  );
  const colocatedSourceDirs = sourceDirs.filter((dir) =>
    substantiveTestFiles.some((file) => {
      const testDir = dirname(file);
      return (
        testDir === dir ||
        testDir === `${dir}/__tests__` ||
        testDir === `${dir}/tests`
      );
    }),
  );
  const colocPct =
    sourceDirs.length > 0
      ? (colocatedSourceDirs.length / sourceDirs.length) * 100
      : 0;

  findings.push({
    signal: "test_colocation",
    value: colocPct,
    impact: colocPct > 80 ? 1.5 : colocPct > 50 ? 1 : colocPct > 20 ? 0.5 : 0,
    detail:
      primaryLanguage === "go"
        ? `${colocPct.toFixed(0)}% of Go package directories have colocated tests (${colocatedSourceDirs.length}/${sourceDirs.length}); support-only test directories are excluded`
        : `${colocPct.toFixed(0)}% of source directories have colocated tests (${colocatedSourceDirs.length}/${sourceDirs.length})`,
  });

  // ── Directory depth ────────────────────────────────────────────────────
  const depths = files.map((f) => f.split("/").length - 1);
  const maxDepth = Math.max(...depths, 0);
  const avgDepth =
    depths.length > 0 ? depths.reduce((s, d) => s + d, 0) / depths.length : 0;

  findings.push({
    signal: "max_depth",
    value: maxDepth,
    impact: maxDepth <= 6 ? 0.5 : maxDepth <= 10 ? 0 : -0.5,
    detail: `Max nesting depth: ${maxDepth}, avg: ${avgDepth.toFixed(1)}`,
  });

  // ── Naming consistency ─────────────────────────────────────────────────
  const sourceNames = sourceFiles.map((f) => basename(f, extname(f)));
  const camelCase = sourceNames.filter((n) =>
    /^[a-z][a-zA-Z0-9]*$/.test(n),
  ).length;
  const kebabCase = sourceNames.filter((n) =>
    /^[a-z][a-z0-9-]*$/.test(n),
  ).length;
  const snakeCase = sourceNames.filter((n) =>
    /^[a-z][a-z0-9_]*$/.test(n),
  ).length;
  const pascalCase = sourceNames.filter((n) =>
    /^[A-Z][a-zA-Z0-9]*$/.test(n),
  ).length;

  const styles = [
    { name: "camelCase", count: camelCase },
    { name: "kebab-case", count: kebabCase },
    { name: "snake_case", count: snakeCase },
    { name: "PascalCase", count: pascalCase },
  ].sort((a, b) => b.count - a.count);

  const dominantStyle = styles[0];
  const dominantPct =
    sourceNames.length > 0
      ? (dominantStyle.count / sourceNames.length) * 100
      : 0;

  findings.push({
    signal: "naming_consistency",
    value: dominantPct,
    impact: dominantPct > 80 ? 1 : dominantPct > 60 ? 0.5 : 0,
    detail: `Dominant naming: ${dominantStyle.name} (${dominantPct.toFixed(0)}% of source files)`,
  });

  // ── Entry points / barrel files ────────────────────────────────────────
  const barrels = files.filter((f) =>
    /^(index|mod|__init__|main)\.[a-z]+$/i.test(basename(f)),
  );
  const dirsWithBarrels = new Set(barrels.map((f) => dirname(f)));

  findings.push({
    signal: "barrel_files",
    value: barrels.length,
    impact: barrels.length > 0 ? 0.5 : 0,
    detail: `${barrels.length} entry point files (index/mod/__init__) across ${dirsWithBarrels.size} directories`,
  });

  // ── Score ──────────────────────────────────────────────────────────────
  const totalImpact = findings.reduce((s, f) => s + f.impact, 0);
  const score = Math.max(
    0,
    Math.min(10, Math.round((totalImpact + 3) * 1.1 * 10) / 10),
  );

  const recommendations = [];
  if (godFiles.length > 5)
    recommendations.push(
      `Reduce very large source files (${godFiles.length} files >500 lines). Examples: ${godFiles
        .slice(0, 3)
        .map((f) => f.file)
        .join(", ")}`,
    );
  if (megaFiles.length > 0)
    recommendations.push(
      `Refactor the largest files first (${megaFiles.length} files >1000 lines). Examples: ${megaFiles
        .slice(0, 3)
        .map((f) => f.file)
        .join(", ")}`,
    );
  if (catchAlls.length > 2)
    recommendations.push(
      `Reduce catch-all directories (${catchAlls.length} found) and move code toward feature-specific modules. Examples: ${catchAlls
        .slice(0, 5)
        .join(", ")}`,
    );
  if (colocPct < 50)
    recommendations.push(
      "Colocate test files next to source files for better discoverability",
    );

  return {
    category: "Navigability & Discoverability",
    code: "NAV",
    score,
    findings,
    recommendations,
  };
}
