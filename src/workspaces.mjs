import { join } from "node:path";

import { readFile, readJSON } from "./utils.mjs";

export function discoverWorkspacePackages(repoPath, files) {
  const rootPackageJson = readJSON(repoPath, "package.json") || null;
  const candidateDirs = getCandidatePackageDirs(files);
  const patterns = getWorkspacePatterns(repoPath, files, rootPackageJson);

  const packageDirs = filterPackageDirs(candidateDirs, patterns);

  return packageDirs.map((dir) => {
    const pkgJson = readJSON(repoPath, join(dir, "package.json")) || null;
    return {
      name: pkgJson?.name || dir.split("/").pop(),
      path: dir,
      private: Boolean(pkgJson?.private),
      packageManager: detectPackageManager(files, rootPackageJson),
    };
  });
}

function getCandidatePackageDirs(files) {
  return [
    ...new Set(
      files
        .filter(
          (file) =>
            /(^|\/)package\.json$/.test(file) && file !== "package.json",
        )
        .map((file) => file.slice(0, -"/package.json".length))
        .filter((dir) => dir && !dir.startsWith("node_modules/")),
    ),
  ].sort();
}

function getWorkspacePatterns(repoPath, files, rootPackageJson) {
  const include = [];
  const exclude = [];

  const packageWorkspaces = rootPackageJson?.workspaces;
  if (Array.isArray(packageWorkspaces)) {
    pushPatterns(packageWorkspaces, include, exclude);
  } else if (Array.isArray(packageWorkspaces?.packages)) {
    pushPatterns(packageWorkspaces.packages, include, exclude);
  }

  if (files.includes("pnpm-workspace.yaml")) {
    const pnpmPatterns = parsePnpmWorkspace(
      readFile(repoPath, "pnpm-workspace.yaml") || "",
    );
    pushPatterns(pnpmPatterns, include, exclude);
  }

  return { include, exclude };
}

function pushPatterns(patterns, include, exclude) {
  for (const rawPattern of patterns) {
    const pattern = String(rawPattern || "").trim();
    if (!pattern) continue;
    if (pattern.startsWith("!"))
      exclude.push(normalizePattern(pattern.slice(1)));
    else include.push(normalizePattern(pattern));
  }
}

function parsePnpmWorkspace(content) {
  const patterns = [];
  const lines = content.split("\n");
  let inPackages = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    if (!inPackages) {
      if (/^packages\s*:/.test(trimmed)) inPackages = true;
      continue;
    }

    if (/^[A-Za-z0-9_-]+\s*:/.test(trimmed) && !trimmed.startsWith("-")) break;

    const match = trimmed.match(/^-\s+['"]?(.+?)['"]?$/);
    if (match) patterns.push(match[1]);
  }

  return patterns;
}

function normalizePattern(pattern) {
  return pattern.replace(/\\/g, "/").replace(/\/+$/, "");
}

function filterPackageDirs(candidateDirs, patterns) {
  const includePatterns = patterns.include.map(globToRegExp);
  const excludePatterns = patterns.exclude.map(globToRegExp);

  const included = candidateDirs.filter((dir) => {
    if (includePatterns.length === 0) return true;
    return includePatterns.some((pattern) => pattern.test(dir));
  });

  return included.filter(
    (dir) => !excludePatterns.some((pattern) => pattern.test(dir)),
  );
}

function globToRegExp(pattern) {
  const normalized = normalizePattern(pattern);
  let regex = "^";

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];

    if (char === "*") {
      if (normalized[i + 1] === "*") {
        regex += ".*";
        i++;
      } else {
        regex += "[^/]*";
      }
      continue;
    }

    regex += escapeRegExp(char);
  }

  regex += "$";
  return new RegExp(regex);
}

function escapeRegExp(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function detectPackageManager(files, rootPackageJson) {
  if (files.includes("pnpm-workspace.yaml") || files.includes("pnpm-lock.yaml"))
    return "pnpm";
  if (files.includes("yarn.lock")) return "yarn";
  if (files.includes("package-lock.json")) return "npm";
  if (rootPackageJson?.packageManager)
    return String(rootPackageJson.packageManager).split("@")[0];
  return null;
}
