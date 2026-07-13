import { execFileSync } from "node:child_process";
import { extname, posix } from "node:path";
import {
  classifyFile,
  countLines,
  grepCount,
  readFile,
  readJSON,
  walkRepo,
} from "./utils.mjs";

const SENSITIVE_PATH_PATTERNS = [
  /(^|\/)\.env($|\.)/i,
  /(^|\/)\.npmrc$/i,
  /(^|\/)\.pypirc$/i,
  /(^|\/)\.netrc$/i,
  /(^|\/)\.aws\/credentials$/i,
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

const AGENT_GUIDANCE_PATTERN =
  /(^|\/)(AGENTS|CLAUDE|GEMINI)\.md$|(^|\/)\.cursorrules$|^\.github\/copilot-instructions\.md$|^\.cursor\/rules\//i;

const ENTRYPOINT_PATTERNS = [
  /(^|\/)main\.[a-z]+$/i,
  /(^|\/)index\.[a-z]+$/i,
  /(^|\/)server\.[a-z]+$/i,
  /^bin\//,
  /^cmd\/[^/]+\/main\.go$/,
  /^app\//,
  /^src\/(main|index|server)\./,
];

const TEXT_EXTENSIONS = new Set([
  "",
  ".c",
  ".cc",
  ".cpp",
  ".cs",
  ".dart",
  ".ex",
  ".exs",
  ".go",
  ".h",
  ".hpp",
  ".hs",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".kt",
  ".kts",
  ".lua",
  ".md",
  ".mdx",
  ".mjs",
  ".php",
  ".py",
  ".rb",
  ".rs",
  ".rst",
  ".scala",
  ".sh",
  ".svelte",
  ".swift",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".vue",
  ".yaml",
  ".yml",
]);

export function collectEvidence(result, options = {}) {
  const repoPath = result.repoPath;
  const allFiles = walkRepo(repoPath);
  const excludedSensitiveFiles = allFiles.filter(isSensitivePath);
  const files = allFiles.filter((file) => !isSensitivePath(file));
  const classified = classify(files);
  const packageJson = readJSON(repoPath, "package.json");
  const readmePath = files.find((file) => /^readme(?:\.[^/]+)?$/i.test(file));
  const readme = readmePath ? readFile(repoPath, readmePath) || "" : "";
  const agentFiles = files.filter((file) => AGENT_GUIDANCE_PATTERN.test(file));
  const scripts = packageJson?.scripts || {};
  const gitHotspots = collectGitHotspots(repoPath, files);
  const contradictions = findContradictions({
    files,
    classified,
    packageJson,
    readme,
    readmePath,
    agentFiles,
  });
  const riskSignals = collectRiskSignals(repoPath, classified);
  const topology = summarizeTopology(repoPath, classified);
  const sizeClass = result.scoringProfile?.sizeClass || "small";
  const selectedPaths = selectEvidenceFiles({
    repoPath,
    files,
    classified,
    agentFiles,
    gitHotspots,
    sizeClass,
  });
  const excerpts = buildExcerpts(repoPath, selectedPaths, options);

  return {
    schemaVersion: 1,
    mode: "static",
    generatedAt: new Date().toISOString(),
    repoPath,
    repoType: result.repoType,
    sizeClass,
    summary: result.summary,
    capabilities: {
      packageManager: detectPackageManager(files, packageJson),
      installPath: detectInstallPath(files, packageJson, readme),
      testPath: detectTestPath(repoPath, files, packageJson, readme),
      runPath: detectRunPath(files, packageJson, readme, result.repoType),
      ci: classified.ci.length > 0,
      agentGuidance: agentFiles.length > 0,
      lockfile: files.some((file) =>
        /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|Cargo\.lock|poetry\.lock|uv\.lock|Pipfile\.lock|go\.sum)$/.test(
          file,
        ),
      ),
    },
    commands: Object.entries(scripts).map(([name, command]) => ({
      name,
      command: String(command),
    })),
    inventory: {
      total: files.length,
      source: classified.source.length,
      test: classified.test.length,
      docs: classified.doc.length,
      config: classified.config.length,
      ci: classified.ci.length,
      generated: classified.generated.length,
      excludedSensitive: excludedSensitiveFiles.length,
    },
    coverage: buildCoverage(classified, excerpts, sizeClass),
    agentGuidance: agentFiles,
    topology,
    gitHotspots,
    contradictions,
    riskSignals,
    excludedSensitiveFiles: excludedSensitiveFiles.slice(0, 30),
    heuristicBaseline: {
      overallScore: result.overallScore,
      rating: result.rating,
      categories: result.categories.map((category) => ({
        code: category.code,
        score: category.score,
        findings: category.findings.slice(0, 8),
      })),
      note: "These are structural priors only. The LLM judge must rescore from repository evidence and may disagree substantially.",
    },
    excerpts,
  };
}

function summarizeTopology(repoPath, classified) {
  const topLevel = new Map();
  for (const kind of ["source", "test"]) {
    for (const path of classified[kind]) {
      const segment = path.includes("/") ? path.split("/")[0] : "(root)";
      const current = topLevel.get(segment) || { source: 0, test: 0 };
      current[kind]++;
      topLevel.set(segment, current);
    }
  }

  const relativeImportEdges = [];
  let relativeImportCount = 0;
  let crossTopLevelImportCount = 0;
  const importPattern =
    /(?:from\s+|import\s*\(|require\s*\()\s*["'](\.{1,2}\/[^"']+)["']/g;
  for (const path of classified.source) {
    const content = readFile(repoPath, path);
    if (!content || content.length > 500_000) continue;
    for (const match of content.matchAll(importPattern)) {
      relativeImportCount++;
      const target = posix.normalize(posix.join(posix.dirname(path), match[1]));
      const fromTopLevel = path.includes("/") ? path.split("/")[0] : "(root)";
      const toTopLevel = target.includes("/") ? target.split("/")[0] : "(root)";
      const crossesTopLevel = fromTopLevel !== toTopLevel;
      if (crossesTopLevel) crossTopLevelImportCount++;
      if (relativeImportEdges.length < 30) {
        relativeImportEdges.push({
          from: path,
          specifier: match[1],
          target,
          crossesTopLevel,
        });
      }
    }
  }

  return {
    topLevelSurfaces: [...topLevel.entries()]
      .sort(
        (left, right) =>
          right[1].source + right[1].test - (left[1].source + left[1].test),
      )
      .map(([name, counts]) => ({ name, ...counts })),
    relativeImportCount,
    crossTopLevelImportCount,
    relativeImportEdges,
    sourceTestMappings: findSourceTestMappings(classified),
  };
}

function findSourceTestMappings(classified) {
  const testsByStem = new Map();
  for (const path of classified.test) {
    const stem = fileStem(path);
    if (!testsByStem.has(stem)) testsByStem.set(stem, []);
    testsByStem.get(stem).push(path);
  }

  return classified.source
    .map((source) => ({
      source,
      tests: testsByStem.get(fileStem(source)) || [],
    }))
    .filter((mapping) => mapping.tests.length > 0)
    .slice(0, 40);
}

function fileStem(path) {
  return posix
    .basename(path)
    .replace(/\.(?:test|spec)\b/i, "")
    .replace(/_test\b/i, "")
    .replace(/\.[^.]+$/, "")
    .toLowerCase();
}

function classify(files) {
  const buckets = {
    source: [],
    test: [],
    doc: [],
    config: [],
    ci: [],
    generated: [],
    other: [],
  };

  for (const file of files) {
    const type = classifyFile(file);
    buckets[type]?.push(file);
  }
  return buckets;
}

function collectGitHotspots(repoPath, knownFiles) {
  try {
    const output = execFileSync(
      "git",
      ["log", "-n", "200", "--name-only", "--pretty=format:"],
      {
        cwd: repoPath,
        encoding: "utf8",
        maxBuffer: 20 * 1024 * 1024,
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
    const known = new Set(knownFiles);
    const counts = new Map();
    for (const path of output.split("\n").map((line) => line.trim())) {
      if (!path || !known.has(path) || isSensitivePath(path)) continue;
      counts.set(path, (counts.get(path) || 0) + 1);
    }
    return [...counts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 20)
      .map(([path, changes]) => ({ path, changes }));
  } catch {
    return [];
  }
}

function collectRiskSignals(repoPath, classified) {
  const codeFiles = [...classified.source, ...classified.test];
  const definitions = [
    ["unfinished_work", /\b(?:TODO|FIXME|HACK|XXX)\b/],
    [
      "skipped_or_focused_tests",
      /\b(?:it|test|describe)\.(?:skip|only|todo)\b|@pytest\.mark\.skip|\bt\.Skip\(/,
    ],
    [
      "type_or_lint_suppressions",
      /@ts-ignore|@ts-expect-error|eslint-disable|biome-ignore|#\s*type:\s*ignore|nolint/,
    ],
    [
      "broad_error_handling",
      /catch\s*\([^)]*\)\s*\{\s*\}|except\s+(?:Exception|BaseException)\s*:/,
    ],
  ];

  return definitions.map(([signal, pattern]) => {
    const result = grepCount(repoPath, codeFiles, pattern);
    return {
      signal,
      count: result.count,
      examples: result.matches.slice(0, 8),
    };
  });
}

function findContradictions({
  files,
  classified,
  packageJson,
  readme,
  readmePath,
  agentFiles,
}) {
  const findings = [];
  const scripts = packageJson?.scripts || {};
  const documentedScripts = [...readme.matchAll(/npm\s+run\s+([\w:-]+)/g)].map(
    (match) => match[1],
  );

  for (const script of [...new Set(documentedScripts)]) {
    if (!scripts[script]) {
      findings.push({
        severity: "high",
        signal: "documented_command_missing",
        evidence: readmePath,
        detail: `README documents \`npm run ${script}\`, but package.json has no ${script} script.`,
      });
    }
  }

  const manager = detectPackageManager(files, packageJson);
  if (manager && readme) {
    const conflictingManagers = ["npm", "pnpm", "yarn"].filter(
      (candidate) =>
        candidate !== manager &&
        new RegExp(
          `(?:^|\\s)${candidate}\\s+(?:install|run|test|build)\\b`,
          "m",
        ).test(readme),
    );
    if (conflictingManagers.length > 0) {
      findings.push({
        severity: "medium",
        signal: "package_manager_ambiguity",
        evidence: readmePath,
        detail: `Lockfile indicates ${manager}, while README also uses ${conflictingManagers.join(
          ", ",
        )}.`,
      });
    }
  }

  if (
    /\b(?:test|testing|coverage)\b/i.test(readme) &&
    classified.test.length === 0
  ) {
    findings.push({
      severity: "high",
      signal: "tests_documented_but_absent",
      evidence: readmePath,
      detail: "README discusses testing, but no test files were discovered.",
    });
  }

  if (agentFiles.length > 0 && !readmePath) {
    findings.push({
      severity: "medium",
      signal: "agent_guidance_without_core_docs",
      evidence: agentFiles[0],
      detail:
        "Agent-specific guidance exists, but no root README was discovered.",
    });
  }

  return findings;
}

function selectEvidenceFiles({
  repoPath,
  files,
  classified,
  agentFiles,
  gitHotspots,
  sizeClass,
}) {
  if (sizeClass === "small" && files.length <= 60) {
    return files.filter(
      (file) => classifyFile(file) !== "generated" && isReadableTextFile(file),
    );
  }

  const limits =
    sizeClass === "large"
      ? { source: 30, test: 18, doc: 10, config: 10, total: 85 }
      : { source: 20, test: 12, doc: 8, config: 8, total: 60 };
  const selected = [];
  const seen = new Set();
  const push = (path) => {
    if (!path || seen.has(path) || !isReadableTextFile(path)) return;
    seen.add(path);
    selected.push(path);
  };

  for (const path of agentFiles.slice(0, 5)) push(path);
  for (const path of classified.doc.slice(0, limits.doc)) push(path);
  for (const path of classified.ci.slice(0, 6)) push(path);
  for (const path of classified.config.slice(0, limits.config)) push(path);

  const sourceCandidates = [];
  const seenSourceCandidates = new Set();
  const addSourceCandidate = (path) => {
    if (
      !path ||
      seenSourceCandidates.has(path) ||
      !classified.source.includes(path)
    ) {
      return;
    }
    seenSourceCandidates.add(path);
    sourceCandidates.push(path);
  };
  for (const path of classified.source.filter((file) =>
    ENTRYPOINT_PATTERNS.some((pattern) => pattern.test(file)),
  )) {
    addSourceCandidate(path);
  }
  for (const hotspot of gitHotspots) addSourceCandidate(hotspot.path);
  for (const path of rankLargeFiles(repoPath, classified.source).slice(
    0,
    Math.ceil(limits.source / 3),
  )) {
    addSourceCandidate(path);
  }
  for (const path of sampleAcrossTopLevel(classified.source, limits.source)) {
    addSourceCandidate(path);
  }
  const testCandidates = sampleAcrossTopLevel(classified.test, limits.test);
  const selectedSourceCandidates = sourceCandidates.slice(0, limits.source);
  const codeTargetCount = Math.max(
    testCandidates.length,
    selectedSourceCandidates.length,
  );
  for (let index = 0; index < codeTargetCount; index++) {
    push(testCandidates[index]);
    push(selectedSourceCandidates[index]);
  }

  return selected.slice(0, limits.total);
}

function rankLargeFiles(repoPath, files) {
  return files
    .map((path) => ({ path, lines: countLines(repoPath, path) }))
    .sort((left, right) => right.lines - left.lines)
    .map((entry) => entry.path);
}

function sampleAcrossTopLevel(files, limit) {
  const groups = new Map();
  for (const file of files) {
    const topLevel = file.includes("/") ? file.split("/")[0] : "(root)";
    if (!groups.has(topLevel)) groups.set(topLevel, []);
    groups.get(topLevel).push(file);
  }

  const output = [];
  const queues = [...groups.values()];
  while (output.length < limit && queues.some((queue) => queue.length > 0)) {
    for (const queue of queues) {
      const next = queue.shift();
      if (next) output.push(next);
      if (output.length >= limit) break;
    }
  }
  return output;
}

function buildExcerpts(repoPath, selectedPaths, options) {
  const perFileLimit = Number(options.perFileLimit) || 12_000;
  const totalLimit = Number(options.totalLimit) || 600_000;
  const excerpts = [];
  let used = 0;

  for (const path of selectedPaths) {
    if (used >= totalLimit) break;
    const content = readFile(repoPath, path);
    if (!content || content.includes("\0")) continue;
    const allowed = Math.min(perFileLimit, totalLimit - used);
    const truncated = content.length > allowed;
    const excerpt = content.slice(0, allowed);
    used += excerpt.length;
    excerpts.push({
      path,
      kind: classifyFile(path),
      lines: content.split("\n").length,
      truncated,
      content: excerpt,
    });
  }
  return excerpts;
}

function buildCoverage(classified, excerpts, sizeClass) {
  const inspected = {
    source: 0,
    test: 0,
    doc: 0,
    config: 0,
    ci: 0,
    other: 0,
  };
  for (const excerpt of excerpts) {
    const kind = excerpt.kind in inspected ? excerpt.kind : "other";
    inspected[kind]++;
  }
  const minimum =
    sizeClass === "large"
      ? { source: 25, test: 12 }
      : sizeClass === "medium"
        ? { source: 15, test: 8 }
        : {
            source: classified.source.length,
            test: classified.test.length,
          };
  minimum.source = Math.min(minimum.source, classified.source.length);
  minimum.test = Math.min(minimum.test, classified.test.length);

  return {
    inspected,
    available: {
      source: classified.source.length,
      test: classified.test.length,
      doc: classified.doc.length,
      config: classified.config.length,
      ci: classified.ci.length,
      other: classified.other.length,
    },
    totalExcerptCharacters: excerpts.reduce(
      (sum, excerpt) => sum + excerpt.content.length,
      0,
    ),
    minimum,
    minimumMet:
      inspected.source >= minimum.source && inspected.test >= minimum.test,
  };
}

function detectPackageManager(files, packageJson) {
  if (files.includes("pnpm-lock.yaml")) return "pnpm";
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

function detectInstallPath(files, packageJson, readme) {
  if (packageJson && /\b(?:npm|pnpm|yarn)\s+(?:install|ci)\b/i.test(readme)) {
    return true;
  }
  if (
    packageJson &&
    files.some((file) =>
      /(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/.test(file),
    )
  ) {
    return true;
  }
  return /\b(?:pip|uv|poetry|bundle|cargo|go)\s+(?:install|sync|mod download)\b/i.test(
    readme,
  );
}

function detectTestPath(repoPath, files, packageJson, readme) {
  if (isUsefulScript(packageJson?.scripts?.test)) return true;
  if (
    /\b(?:npm test|pnpm test|yarn test|pytest|go test|cargo test|mix test|bundle exec rspec)\b/i.test(
      readme,
    )
  ) {
    return true;
  }
  return files
    .filter((file) => /(^|\/)(Makefile|Justfile|Taskfile\.ya?ml)$/.test(file))
    .some((file) =>
      /(^|\n)\s*(?:test|check|verify)\s*:/im.test(
        readFile(repoPath, file) || "",
      ),
    );
}

function detectRunPath(files, packageJson, readme, repoType) {
  if (
    ["library", "cli"].includes(repoType) &&
    (isUsefulScript(packageJson?.scripts?.test) || packageJson?.bin)
  ) {
    return true;
  }
  if (
    packageJson?.scripts?.dev ||
    packageJson?.scripts?.start ||
    packageJson?.scripts?.build
  ) {
    return true;
  }
  if (/\b(?:npm|pnpm|yarn)\s+run\s+(?:dev|start|build)\b/i.test(readme)) {
    return true;
  }
  return files.some((file) =>
    /(^|\/)(docker-compose\.ya?ml|compose\.ya?ml)$/.test(file),
  );
}

function isUsefulScript(value) {
  const script = String(value || "").trim();
  if (!script) return false;
  return !/no test specified|not implemented|exit\s+1\b/i.test(script);
}

function isSensitivePath(filePath) {
  return SENSITIVE_PATH_PATTERNS.some((pattern) => pattern.test(filePath));
}

function isReadableTextFile(path) {
  return TEXT_EXTENSIONS.has(extname(path).toLowerCase());
}
