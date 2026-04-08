import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, extname, join, relative } from "node:path";

// ── File tree walker (uses git ls-files when available) ──────────────────────

export function walkRepo(repoPath) {
  const isGit = existsSync(join(repoPath, ".git"));

  if (isGit) {
    try {
      // git ls-files respects .gitignore, includes tracked + untracked non-ignored
      const tracked = execSync("git ls-files", {
        cwd: repoPath,
        maxBuffer: 50 * 1024 * 1024,
      })
        .toString()
        .trim()
        .split("\n")
        .filter(Boolean);
      const untracked = execSync("git ls-files --others --exclude-standard", {
        cwd: repoPath,
        maxBuffer: 50 * 1024 * 1024,
      })
        .toString()
        .trim()
        .split("\n")
        .filter(Boolean);
      return [...new Set([...tracked, ...untracked])].map((f) =>
        normalizePath(f),
      );
    } catch {
      // fallback to manual walk
    }
  }

  return manualWalk(repoPath, repoPath);
}

function manualWalk(basePath, currentPath, results = []) {
  const SKIP = new Set([
    "node_modules",
    ".git",
    ".svn",
    ".hg",
    "vendor",
    "dist",
    "build",
    "__pycache__",
    ".tox",
    ".venv",
    "venv",
    ".mypy_cache",
    ".pytest_cache",
    ".next",
    ".nuxt",
    "coverage",
    ".nyc_output",
    "target",
    ".gradle",
  ]);
  const INCLUDED_HIDDEN_ENTRIES = new Set([
    ".env.example",
    ".cursorrules",
    ".devcontainer",
    ".github",
    ".gitlab-ci.yml",
    ".circleci",
    ".buildkite",
    ".travis.yml",
  ]);

  let entries;
  try {
    entries = readdirSync(currentPath, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (entry.name.startsWith(".") && !INCLUDED_HIDDEN_ENTRIES.has(entry.name))
      continue;
    if (SKIP.has(entry.name)) continue;

    const full = join(currentPath, entry.name);
    const rel = relative(basePath, full);

    if (entry.isDirectory()) {
      manualWalk(basePath, full, results);
    } else if (entry.isFile()) {
      results.push(normalizePath(rel));
    }
  }
  return results;
}

function normalizePath(p) {
  return p.replace(/\\/g, "/");
}

// ── File reading helpers ────────────────────────────────────────────────────

export function readFile(repoPath, filePath) {
  try {
    return readFileSync(join(repoPath, filePath), "utf-8");
  } catch {
    return null;
  }
}

export function fileExists(repoPath, ...candidates) {
  for (const c of candidates) {
    if (existsSync(join(repoPath, c))) return c;
  }
  return null;
}

export function readJSON(repoPath, filePath) {
  const raw = readFile(repoPath, filePath);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ── File classification ─────────────────────────────────────────────────────

const SOURCE_EXTS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".pyw",
  ".go",
  ".rs",
  ".java",
  ".kt",
  ".kts",
  ".rb",
  ".php",
  ".cs",
  ".swift",
  ".c",
  ".cpp",
  ".cc",
  ".h",
  ".hpp",
  ".scala",
  ".ex",
  ".exs",
  ".hs",
  ".lua",
  ".dart",
  ".vue",
  ".svelte",
]);

const TEST_PATTERNS = [
  /\.test\.[a-z]+$/,
  /\.spec\.[a-z]+$/,
  /_test\.[a-z]+$/,
  /_test\.go$/,
  /test_[^/]+\.py$/,
  /\.tests?\//,
  /__tests__\//,
  /^tests?\//,
];

const DOC_PATTERNS = [
  /^readme/i,
  /^contributing/i,
  /^changelog/i,
  /^license/i,
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
  /^docker-compose/i,
  /\.env/,
  /\.lock$/,
  /\.ini$/i,
];

const CI_PATTERNS = [
  /^\.github\/workflows\//,
  /^\.gitlab-ci/,
  /^\.circleci\//,
  /^Jenkinsfile/i,
  /^\.buildkite\//,
  /^\.travis\.yml$/,
  /^bitbucket-pipelines/i,
  /^azure-pipelines/i,
];

const GENERATED_PATTERNS = [
  /\.generated\./,
  /\.g\./,
  /\.pb\./,
  /\.min\./,
  /\.bundle\./,
  /\.lock$/,
  /-lock\./,
  /\/generated\//,
  /package-lock\.json/,
  /yarn\.lock/,
  /pnpm-lock\.yaml/,
];

export function classifyFile(filePath) {
  const name = basename(filePath).toLowerCase();
  const ext = extname(filePath).toLowerCase();

  if (GENERATED_PATTERNS.some((p) => p.test(filePath))) return "generated";
  if (CI_PATTERNS.some((p) => p.test(filePath))) return "ci";
  if (TEST_PATTERNS.some((p) => p.test(filePath))) return "test";
  if (DOC_PATTERNS.some((p) => p.test(filePath))) return "doc";
  if (SOURCE_EXTS.has(ext)) return "source";
  if (CONFIG_PATTERNS.some((p) => p.test(name) || p.test(filePath)))
    return "config";
  return "other";
}

// ── Language detection ──────────────────────────────────────────────────────

export function detectLanguages(files) {
  const counts = {};
  const extMap = {
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".py": "python",
    ".pyw": "python",
    ".go": "go",
    ".rs": "rust",
    ".java": "java",
    ".kt": "kotlin",
    ".rb": "ruby",
    ".php": "php",
    ".cs": "csharp",
    ".swift": "swift",
    ".vue": "vue",
    ".svelte": "svelte",
    ".dart": "dart",
  };

  for (const f of files) {
    const ext = extname(f).toLowerCase();
    const lang = extMap[ext];
    if (lang) counts[lang] = (counts[lang] || 0) + 1;
  }

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([lang, count]) => ({ lang, count }));
}

// ── Grep helper (counts pattern matches across files) ───────────────────────

export function grepCount(repoPath, files, pattern, opts = {}) {
  const { maxFileSize = 500_000, extensions } = opts;
  let count = 0;
  const matches = [];

  for (const f of files) {
    if (extensions && !extensions.some((e) => f.endsWith(e))) continue;
    const content = readFile(repoPath, f);
    if (!content || content.length > maxFileSize) continue;

    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i])) {
        count++;
        if (matches.length < 10) {
          matches.push({
            file: f,
            line: i + 1,
            text: lines[i].trim().slice(0, 120),
          });
        }
      }
    }
  }
  return { count, matches };
}

// ── Line counter ────────────────────────────────────────────────────────────

export function countLines(repoPath, filePath) {
  const content = readFile(repoPath, filePath);
  if (!content) return 0;
  return content.split("\n").length;
}

// ── Section detector (checks if markdown has a heading matching keywords) ───

export function mdHasSections(content, keywords) {
  if (!content) return {};
  const headings = content.match(/^#{1,4}\s+.+$/gm) || [];
  const result = {};
  for (const kw of keywords) {
    result[kw] = headings.some((h) =>
      h.toLowerCase().includes(kw.toLowerCase()),
    );
  }
  return result;
}

// ── Directory analysis ──────────────────────────────────────────────────────

export function getDirectories(files) {
  const dirs = new Set();
  for (const f of files) {
    const d = dirname(f);
    if (d !== ".") dirs.add(d);
  }
  return [...dirs];
}

export function getFilesByDir(files) {
  const map = {};
  for (const f of files) {
    const d = dirname(f);
    if (!map[d]) map[d] = [];
    map[d].push(f);
  }
  return map;
}
