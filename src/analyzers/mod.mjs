import { basename, dirname } from "node:path";
import {
  countLines,
  getFilesByDir,
  grepCount,
  readFile,
  readJSON,
} from "../utils.mjs";

export function analyzeMOD(ctx) {
  const { repoPath, files, sourceFiles } = ctx;
  const findings = [];

  // ── File size concentration (god files = coupling magnets) ─────────────
  const fileSizes = sourceFiles.map((f) => ({
    file: f,
    lines: countLines(repoPath, f),
  }));
  const totalLines = fileSizes.reduce((s, f) => s + f.lines, 0);
  const top5Lines = fileSizes
    .sort((a, b) => b.lines - a.lines)
    .slice(0, 5)
    .reduce((s, f) => s + f.lines, 0);
  const top5Pct = totalLines > 0 ? (top5Lines / totalLines) * 100 : 0;

  findings.push({
    signal: "code_concentration",
    value: top5Pct,
    impact: top5Pct < 10 ? 1.5 : top5Pct < 20 ? 1 : top5Pct < 35 ? 0 : -1,
    detail: `Top 5 files contain ${top5Pct.toFixed(1)}% of all code (${top5Lines}/${totalLines} lines)`,
  });

  // ── Import analysis (basic: count cross-directory imports) ─────────────
  const tsJsFiles = sourceFiles.filter((f) => /\.(ts|tsx|js|jsx|mjs)$/.test(f));
  let totalImports = 0;
  let crossDirImports = 0;

  for (const f of tsJsFiles.slice(0, 200)) {
    // sample for performance
    const content = readFile(repoPath, f);
    if (!content) continue;
    const imports =
      content.match(/(?:import|require)\s*\(?['"]([^'"]+)['"]\)?/g) || [];
    for (const imp of imports) {
      totalImports++;
      const match = imp.match(/['"]([^'"]+)['"]/);
      if (!match) continue;
      const src = match[1];
      if (src.startsWith(".")) {
        // Check if it crosses directory boundary
        // Rough: if import goes up more than 2 levels, it's cross-module
        const upCount = (src.match(/\.\.\//g) || []).length;
        if (upCount >= 2) crossDirImports++;
      }
    }
  }

  if (totalImports > 0) {
    const crossPct = (crossDirImports / totalImports) * 100;
    findings.push({
      signal: "cross_boundary_imports",
      value: crossPct,
      impact: crossPct < 5 ? 1.5 : crossPct < 15 ? 0.5 : crossPct < 30 ? 0 : -1,
      detail: `${crossDirImports}/${totalImports} imports cross 2+ directory boundaries (${crossPct.toFixed(1)}%)`,
    });
  }

  // ── Directory self-containment ─────────────────────────────────────────
  const filesByDir = getFilesByDir(sourceFiles);
  const topDirs = Object.entries(filesByDir)
    .filter(([d]) => d.split("/").length <= 2 && d !== ".")
    .map(([d]) => d);

  // Check if top-level directories have their own tests
  const dirsWithTests = topDirs.filter((d) =>
    files.some(
      (f) => f.startsWith(`${d}/`) && /\.(test|spec)\.[a-z]+$/.test(f),
    ),
  );
  const selfContainedPct =
    topDirs.length > 0 ? (dirsWithTests.length / topDirs.length) * 100 : 0;

  findings.push({
    signal: "dir_self_containment",
    value: selfContainedPct,
    impact: selfContainedPct > 70 ? 1.5 : selfContainedPct > 40 ? 0.5 : 0,
    detail: `${dirsWithTests.length}/${topDirs.length} top-level directories have colocated tests (${selfContainedPct.toFixed(0)}%)`,
  });

  // ── God objects / services ─────────────────────────────────────────────
  // Files with "service", "manager", "controller", "handler" in name AND > 300 lines
  const godServices = fileSizes.filter(
    (f) =>
      /service|manager|controller|handler/i.test(basename(f.file)) &&
      f.lines > 300,
  );
  findings.push({
    signal: "god_services",
    value: godServices.length,
    impact: godServices.length === 0 ? 1 : godServices.length <= 2 ? 0 : -1,
    detail:
      godServices.length === 0
        ? "No oversized service/controller files"
        : `${godServices.length} god services (>300L): ${godServices
            .slice(0, 3)
            .map((f) => `${basename(f.file)} (${f.lines}L)`)
            .join(", ")}`,
  });

  // ── Database access sprawl ─────────────────────────────────────────────
  const pkgJson = readJSON(repoPath, "package.json");
  const allDeps = { ...pkgJson?.dependencies, ...pkgJson?.devDependencies };
  const hasDbDependency = [
    "@prisma/client",
    "prisma",
    "mongoose",
    "sequelize",
    "knex",
    "drizzle-orm",
    "pg",
    "mysql2",
    "sqlite3",
    "better-sqlite3",
  ].some((dep) => allDeps?.[dep]);
  const dbPatterns =
    /prisma\.|mongoose\.|sequelize\.|knex\s*\(|sql`|db\.(query|execute|select|insert|update|delete)\s*\(/;

  if (hasDbDependency) {
    const dbHits = grepCount(
      repoPath,
      sourceFiles
        .filter((f) => !/test|spec|mock|fixture/i.test(f))
        .slice(0, 200),
      dbPatterns,
    );
    const dbDirs = new Set(
      dbHits.matches.map((m) =>
        dirname(m.file).split("/").slice(0, 2).join("/"),
      ),
    );

    findings.push({
      signal: "db_access_sprawl",
      value: dbDirs.size,
      impact: dbDirs.size <= 2 ? 1 : dbDirs.size <= 5 ? 0 : -0.5,
      detail: `Database access detected in ${dbDirs.size} top-level directories: ${[...dbDirs].slice(0, 5).join(", ")}`,
    });
  } else {
    findings.push({
      signal: "db_access_sprawl",
      value: "not_applicable",
      impact: 0,
      detail: "No database dependency markers detected; sprawl check skipped",
    });
  }

  // ── Circular dependency hints ──────────────────────────────────────────
  // Basic heuristic: files that import each other (limited to sampled pairs)
  // Full cycle detection needs a real graph — out of scope for v0.1
  findings.push({
    signal: "circular_deps_note",
    value: "not_scanned",
    impact: 0,
    detail:
      "Full circular dependency detection requires AST graph analysis (planned for v0.2)",
  });

  // ── Score ──────────────────────────────────────────────────────────────
  const totalImpact = findings.reduce((s, f) => s + f.impact, 0);
  const score = Math.max(
    0,
    Math.min(10, Math.round((totalImpact + 3) * 1.1 * 10) / 10),
  );

  const recommendations = [];
  if (top5Pct > 30)
    recommendations.push(
      `Top 5 files hold ${top5Pct.toFixed(0)}% of code. Break up the largest files.`,
    );
  if (godServices.length > 0)
    recommendations.push(
      `Split ${godServices.length} god services: ${godServices.map((f) => basename(f.file)).join(", ")}`,
    );
  const dbSprawlFinding = findings.find((f) => f.signal === "db_access_sprawl");
  if (typeof dbSprawlFinding?.value === "number" && dbSprawlFinding.value > 5)
    recommendations.push(
      "Database access is scattered across many directories. Centralize through a data access layer.",
    );
  if (selfContainedPct < 40)
    recommendations.push(
      "Improve module self-containment: colocate tests, types, and constants within each feature directory",
    );

  return {
    category: "Modularity & Coupling",
    code: "MOD",
    score,
    findings,
    recommendations,
  };
}
