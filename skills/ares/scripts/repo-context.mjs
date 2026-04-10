#!/usr/bin/env node

import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";

const SOURCE_EXTENSIONS = new Set([
  ".c",
  ".cc",
  ".cpp",
  ".cs",
  ".dart",
  ".ex",
  ".exs",
  ".go",
  ".hs",
  ".java",
  ".js",
  ".jsx",
  ".kt",
  ".kts",
  ".lua",
  ".mjs",
  ".php",
  ".py",
  ".rb",
  ".rs",
  ".scala",
  ".svelte",
  ".swift",
  ".ts",
  ".tsx",
  ".vue",
]);

const TEST_PATTERNS = [
  /\.test\.[a-z]+$/,
  /\.spec\.[a-z]+$/,
  /_test\.[a-z]+$/,
  /^tests?\//,
  /\/__tests__\//,
  /\/tests?\//,
];

const DOC_PATTERNS = [
  /^readme/i,
  /^contributing/i,
  /^changelog/i,
  /^docs?\//i,
  /^documentation\//i,
  /\.md$/i,
  /\.mdx$/i,
  /\.rst$/i,
  /^adr\//i,
  /^adrs?\//i,
];

const CONFIG_PATTERNS = [
  /^\./,
  /config\./i,
  /\.config\./i,
  /\.json$/i,
  /\.ya?ml$/i,
  /\.toml$/i,
  /^makefile$/i,
  /^justfile$/i,
  /^dockerfile/i,
  /\.lock$/,
];

const CI_PATTERNS = [
  /^\.github\/workflows\//,
  /^\.gitlab-ci/,
  /^\.circleci\//,
  /^\.buildkite\//,
  /^\.travis\.yml$/,
  /^Jenkinsfile/i,
];

const SENSITIVE_PATH_PATTERNS = [
  /(^|\/)\.env($|\.)/i,
  /(^|\/)\.npmrc$/i,
  /(^|\/)\.pypirc$/i,
  /(^|\/)\.netrc$/i,
  /(^|\/)\.aws\/credentials$/i,
  /(^|\/)\.docker\/config\.json$/i,
  /(^|\/)id_[a-z0-9_-]+$/i,
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /service-account.*\.json$/i,
  /credentials.*\.json$/i,
  /secrets?($|[._-])/i,
  /token($|[._-])/i,
];

const LANGUAGE_BY_EXTENSION = {
  ".c": "c",
  ".cc": "cpp",
  ".cpp": "cpp",
  ".cs": "csharp",
  ".dart": "dart",
  ".ex": "elixir",
  ".exs": "elixir",
  ".go": "go",
  ".hs": "haskell",
  ".java": "java",
  ".js": "javascript",
  ".jsx": "javascript",
  ".kt": "kotlin",
  ".kts": "kotlin",
  ".lua": "lua",
  ".mjs": "javascript",
  ".php": "php",
  ".py": "python",
  ".rb": "ruby",
  ".rs": "rust",
  ".scala": "scala",
  ".svelte": "svelte",
  ".swift": "swift",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".vue": "vue",
};

function main() {
  const repoPath = resolve(process.argv[2] || ".");
  const allFiles = walkRepo(repoPath);
  const sensitiveFiles = allFiles.filter(isSensitivePath);
  const files = allFiles.filter((file) => !isSensitivePath(file));
  const packageJson = readJSON(repoPath, "package.json");

  const classified = classifyFiles(files);
  const languages = detectLanguages(files);
  const repoType = detectRepoType(files, packageJson);
  const packageManager = detectPackageManager(files, packageJson);
  const topLevelEntries = summarizeTopLevel(files);
  const largeFiles = findLargestSourceFiles(repoPath, classified.source);
  const importantFiles = findImportantFiles(files, classified, repoType);
  const scripts = summarizeScripts(packageJson?.scripts || {});
  const workspacePackages = findWorkspacePackages(files);

  const snapshot = {
    repoPath,
    generatedAt: new Date().toISOString(),
    repoType,
    packageManager,
    fileCounts: {
      total: files.length,
      source: classified.source.length,
      test: classified.test.length,
      docs: classified.doc.length,
      config: classified.config.length,
      ci: classified.ci.length,
      excludedSensitive: sensitiveFiles.length,
    },
    languages,
    topLevelEntries,
    rootDocs: classified.doc.filter((file) => !file.includes("/")).slice(0, 10),
    rootConfigs: classified.config
      .filter((file) => !file.includes("/"))
      .slice(0, 12),
    scripts,
    ciFiles: classified.ci.slice(0, 12),
    excludedSensitiveFiles: sensitiveFiles.slice(0, 20),
    workspacePackages,
    largeFiles,
    importantFiles,
    readingOrder: importantFiles.slice(0, 12).map((entry) => entry.path),
  };

  process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
}

function walkRepo(rootPath) {
  if (existsSync(join(rootPath, ".git"))) {
    try {
      const tracked = execSync("git ls-files", {
        cwd: rootPath,
        encoding: "utf8",
        maxBuffer: 50 * 1024 * 1024,
      })
        .split("\n")
        .filter(Boolean);
      const untracked = execSync("git ls-files --others --exclude-standard", {
        cwd: rootPath,
        encoding: "utf8",
        maxBuffer: 50 * 1024 * 1024,
      })
        .split("\n")
        .filter(Boolean);

      return [...new Set([...tracked, ...untracked])]
        .map(normalizePath)
        .sort((a, b) => a.localeCompare(b));
    } catch {
      // Fall through to manual walk.
    }
  }

  return manualWalk(rootPath, rootPath).sort((a, b) => a.localeCompare(b));
}

function manualWalk(basePath, currentPath, results = []) {
  const skip = new Set([
    ".git",
    ".hg",
    ".next",
    ".nuxt",
    ".pytest_cache",
    ".svn",
    ".tox",
    ".venv",
    "__pycache__",
    "build",
    "coverage",
    "dist",
    "node_modules",
    "target",
    "vendor",
  ]);

  let entries = [];
  try {
    entries = readdirSync(currentPath, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (entry.name.startsWith(".") && !shouldIncludeHiddenEntry(entry.name)) {
      continue;
    }
    if (skip.has(entry.name)) continue;

    const fullPath = join(currentPath, entry.name);
    const relativePath = normalizePath(relative(basePath, fullPath));

    if (entry.isDirectory()) {
      manualWalk(basePath, fullPath, results);
      continue;
    }

    if (entry.isFile()) {
      results.push(relativePath);
    }
  }

  return results;
}

function shouldIncludeHiddenEntry(name) {
  return new Set([
    ".buildkite",
    ".circleci",
    ".claude",
    ".cursorrules",
    ".devcontainer",
    ".github",
    ".gitlab-ci.yml",
    ".travis.yml",
    ".env.example",
  ]).has(name);
}

function classifyFiles(files) {
  const buckets = {
    source: [],
    test: [],
    doc: [],
    config: [],
    ci: [],
    other: [],
  };

  for (const file of files) {
    const kind = classifyFile(file);
    buckets[kind].push(file);
  }

  return buckets;
}

function classifyFile(filePath) {
  const fileName = basename(filePath).toLowerCase();
  const extension = extname(filePath).toLowerCase();

  if (CI_PATTERNS.some((pattern) => pattern.test(filePath))) return "ci";
  if (TEST_PATTERNS.some((pattern) => pattern.test(filePath))) return "test";
  if (DOC_PATTERNS.some((pattern) => pattern.test(filePath))) return "doc";
  if (SOURCE_EXTENSIONS.has(extension)) return "source";
  if (
    CONFIG_PATTERNS.some(
      (pattern) => pattern.test(fileName) || pattern.test(filePath),
    )
  ) {
    return "config";
  }
  return "other";
}

function detectLanguages(files) {
  const counts = new Map();

  for (const file of files) {
    const language = LANGUAGE_BY_EXTENSION[extname(file).toLowerCase()];
    if (!language) continue;
    counts.set(language, (counts.get(language) || 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([language, count]) => ({ language, count }));
}

function detectRepoType(files, packageJson) {
  const packageJsonFiles = files.filter((file) =>
    /(^|\/)package\.json$/.test(file),
  );
  const allDeps = {
    ...(packageJson?.dependencies || {}),
    ...(packageJson?.devDependencies || {}),
    ...(packageJson?.peerDependencies || {}),
    ...(packageJson?.optionalDependencies || {}),
  };

  if (
    files.includes("pnpm-workspace.yaml") ||
    files.includes("turbo.json") ||
    Array.isArray(packageJson?.workspaces) ||
    Array.isArray(packageJson?.workspaces?.packages) ||
    packageJsonFiles.length > 1
  ) {
    return "monorepo";
  }

  if (
    packageJson?.bin ||
    files.some((file) => /^bin\/.+\.(js|mjs|cjs|ts)$/.test(file)) ||
    hasDependency(allDeps, ["commander", "yargs", "cac", "oclif", "meow"])
  ) {
    return "cli";
  }

  if (
    hasDependency(allDeps, [
      "@nestjs/core",
      "@hapi/hapi",
      "express",
      "fastify",
      "hono",
      "koa",
      "nestjs",
    ]) ||
    files.some((file) =>
      [
        /^api\//,
        /^controllers\//,
        /^routes\//,
        /^server\.(js|mjs|cjs|ts|py|go|rs)$/,
        /^src\/server\.(js|mjs|cjs|ts|py|go|rs)$/,
      ].some((pattern) => pattern.test(file)),
    )
  ) {
    return "service";
  }

  if (
    hasDependency(allDeps, [
      "@angular/core",
      "expo",
      "next",
      "nuxt",
      "react",
      "react-native",
      "svelte",
      "vite",
      "vue",
    ]) ||
    files.some((file) =>
      [
        /^app\//,
        /^pages\//,
        /^public\//,
        /^src\/app\//,
        /^src\/pages\//,
        /^next\.config\./,
        /^vite\.config\./,
      ].some((pattern) => pattern.test(file)),
    )
  ) {
    return "app";
  }

  return "library";
}

function hasDependency(allDeps, names) {
  return names.some((name) => Boolean(allDeps[name]));
}

function detectPackageManager(files, packageJson) {
  if (
    files.includes("pnpm-lock.yaml") ||
    files.includes("pnpm-workspace.yaml")
  ) {
    return "pnpm";
  }
  if (files.includes("yarn.lock")) return "yarn";
  if (files.includes("package-lock.json")) return "npm";
  if (packageJson?.packageManager) {
    return String(packageJson.packageManager).split("@")[0];
  }
  if (files.includes("Cargo.toml")) return "cargo";
  if (files.includes("go.mod")) return "go";
  if (files.includes("pyproject.toml") || files.includes("requirements.txt")) {
    return "python";
  }
  return null;
}

function summarizeTopLevel(files) {
  const counts = new Map();

  for (const file of files) {
    const topLevel = file.includes("/") ? file.split("/")[0] : "(root)";
    counts.set(topLevel, (counts.get(topLevel) || 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([name, fileCount]) => ({ name, fileCount }));
}

function summarizeScripts(scripts) {
  const entries = Object.entries(scripts);
  if (entries.length === 0) return [];

  const preferredOrder = [
    "dev",
    "start",
    "build",
    "test",
    "lint",
    "check",
    "typecheck",
    "format",
  ];
  const ordered = [
    ...preferredOrder
      .filter((name) => scripts[name])
      .map((name) => [name, scripts[name]]),
    ...entries.filter(([name]) => !preferredOrder.includes(name)),
  ];

  return ordered.slice(0, 12).map(([name, command]) => ({ name, command }));
}

function findWorkspacePackages(files) {
  return files
    .filter(
      (file) => /(^|\/)package\.json$/.test(file) && file !== "package.json",
    )
    .map((file) => file.slice(0, -"/package.json".length))
    .filter(Boolean)
    .slice(0, 20);
}

function findLargestSourceFiles(repoRoot, sourceFiles) {
  return sourceFiles
    .map((file) => ({
      path: file,
      lines: countLines(readFile(repoRoot, file)),
    }))
    .filter((file) => file.lines > 0)
    .sort((a, b) => b.lines - a.lines)
    .slice(0, 10);
}

function findImportantFiles(files, classified, repoType) {
  const ranked = [];
  const seen = new Set();

  const push = (path, reason) => {
    if (!path || seen.has(path)) return;
    seen.add(path);
    ranked.push({ path, reason });
  };

  for (const doc of [
    "README.md",
    "README.mdx",
    "CLAUDE.md",
    "AGENTS.md",
    "CONTRIBUTING.md",
  ]) {
    if (files.includes(doc)) {
      push(doc, "core documentation");
    }
  }

  for (const manifest of [
    "package.json",
    "pnpm-workspace.yaml",
    "turbo.json",
    "tsconfig.json",
    "pyproject.toml",
    "Cargo.toml",
    "go.mod",
    "Dockerfile",
    "docker-compose.yml",
    "Makefile",
    "Justfile",
  ]) {
    if (files.includes(manifest)) {
      push(manifest, "root manifest or workflow config");
    }
  }

  for (const ciFile of classified.ci.slice(0, 6)) {
    push(ciFile, "automation or CI workflow");
  }

  const entrypointPatterns = [
    /^src\/index\./,
    /^src\/main\./,
    /^src\/server\./,
    /^index\./,
    /^main\./,
    /^server\./,
    /^bin\/.+/,
    /^app\/.+/,
  ];

  for (const file of classified.source) {
    if (entrypointPatterns.some((pattern) => pattern.test(file))) {
      push(file, "likely entrypoint or high-signal source file");
    }
  }

  for (const testFile of classified.test.slice(0, 8)) {
    push(testFile, "representative automated test");
  }

  if (repoType === "monorepo") {
    for (const pkg of findWorkspacePackages(files)) {
      push(
        join(pkg, "package.json").replace(/\\/g, "/"),
        "workspace package manifest",
      );
    }
  }

  return ranked.slice(0, 25);
}

function readJSON(rootPath, filePath) {
  try {
    return JSON.parse(readFileSync(join(rootPath, filePath), "utf8"));
  } catch {
    return null;
  }
}

function readFile(rootPath, filePath) {
  try {
    return readFileSync(join(rootPath, filePath), "utf8");
  } catch {
    return "";
  }
}

function countLines(content) {
  if (!content) return 0;
  return content.split("\n").length;
}

function normalizePath(value) {
  return value.replace(/\\/g, "/");
}

function isSensitivePath(filePath) {
  return SENSITIVE_PATH_PATTERNS.some((pattern) => pattern.test(filePath));
}

main();
