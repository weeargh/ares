import { fileExists, mdHasSections, readFile } from "../utils.mjs";

export function analyzeMRC(ctx) {
  const { repoPath, files } = ctx;
  const findings = [];
  let score = 0;

  // ── README ──────────────────────────────────────────────────────────────
  const readme = fileExists(
    repoPath,
    "README.md",
    "readme.md",
    "README.rst",
    "README.txt",
    "README",
  );
  if (!readme) {
    findings.push({
      signal: "readme_exists",
      value: false,
      impact: -3,
      detail: "No README found",
    });
  } else {
    findings.push({
      signal: "readme_exists",
      value: true,
      impact: 1,
      detail: readme,
    });
    const content = readFile(repoPath, readme);
    const wordCount = content ? content.split(/\s+/).length : 0;
    findings.push({
      signal: "readme_words",
      value: wordCount,
      impact: wordCount > 500 ? 1 : wordCount > 200 ? 0.5 : 0,
      detail: `${wordCount} words`,
    });

    const sections = mdHasSections(content, [
      "architecture",
      "structure",
      "overview",
      "getting started",
      "setup",
      "install",
      "development",
      "contributing",
      "api",
      "usage",
      "design",
      "project structure",
      "folder",
      "directory",
    ]);
    const hasArchSection =
      sections.architecture ||
      sections.structure ||
      sections.overview ||
      sections["project structure"] ||
      sections.directory ||
      sections.folder;
    const hasSetupSection =
      sections["getting started"] ||
      sections.setup ||
      sections.install ||
      sections.development;

    findings.push({
      signal: "readme_architecture",
      value: !!hasArchSection,
      impact: hasArchSection ? 1.5 : 0,
      detail: hasArchSection
        ? "Architecture/structure section found"
        : "No architecture section in README",
    });
    findings.push({
      signal: "readme_setup",
      value: !!hasSetupSection,
      impact: hasSetupSection ? 0.5 : 0,
      detail: hasSetupSection
        ? "Setup section found"
        : "No setup section in README",
    });
  }

  // ── CONTRIBUTING ────────────────────────────────────────────────────────
  const contributing = fileExists(
    repoPath,
    "CONTRIBUTING.md",
    "contributing.md",
    ".github/CONTRIBUTING.md",
  );
  findings.push({
    signal: "contributing_exists",
    value: !!contributing,
    impact: contributing ? 0.5 : 0,
    detail: contributing || "No CONTRIBUTING.md",
  });

  // ── Architecture docs ──────────────────────────────────────────────────
  const archDocs = files.filter(
    (f) => /^docs?\//i.test(f) && /\.(md|mdx|rst|txt)$/i.test(f),
  );
  findings.push({
    signal: "docs_count",
    value: archDocs.length,
    impact:
      archDocs.length > 10
        ? 1.5
        : archDocs.length > 3
          ? 1
          : archDocs.length > 0
            ? 0.5
            : 0,
    detail: `${archDocs.length} doc files in docs/`,
  });

  // ── ADRs ────────────────────────────────────────────────────────────────
  const adrs = files.filter(
    (f) => /adr/i.test(f) && /\.(md|rst|txt)$/i.test(f),
  );
  findings.push({
    signal: "adrs_exist",
    value: adrs.length > 0,
    impact: adrs.length > 0 ? 0.5 : 0,
    detail: `${adrs.length} ADR files`,
  });

  // ── API schemas ─────────────────────────────────────────────────────────
  const apiSchemas = files.filter(
    (f) =>
      /openapi|swagger/i.test(f) ||
      /schema\.graphql/i.test(f) ||
      /\.proto$/i.test(f),
  );
  findings.push({
    signal: "api_schemas",
    value: apiSchemas.length,
    impact: apiSchemas.length > 0 ? 0.5 : 0,
    detail:
      apiSchemas.length > 0
        ? apiSchemas.slice(0, 5).join(", ")
        : "No API schema files",
  });

  // ── Agent instruction file (scored here for context, detailed in AGT) ──
  const agentFile = fileExists(
    repoPath,
    "CLAUDE.md",
    ".cursorrules",
    ".cursor/rules",
    ".github/copilot-instructions.md",
    "AGENTS.md",
  );
  findings.push({
    signal: "agent_instruction_file",
    value: !!agentFile,
    impact: agentFile ? 1 : 0,
    detail: agentFile || "No agent instruction file",
  });

  // ── Compute score ───────────────────────────────────────────────────────
  const totalImpact = findings.reduce((s, f) => s + f.impact, 0);
  // Normalize: max achievable ~7.5 from static, leave room for LLM quality assessment
  score = Math.max(0, Math.min(10, Math.round(totalImpact * 1.3 * 10) / 10));

  const recommendations = [];
  if (!readme)
    recommendations.push(
      "Create a README.md with project overview, architecture, and setup instructions",
    );
  if (
    readme &&
    !findings.find((f) => f.signal === "readme_architecture")?.value
  )
    recommendations.push(
      "Add an architecture/project structure section to README",
    );
  if (!contributing)
    recommendations.push(
      "Add a CONTRIBUTING.md with coding patterns and PR conventions",
    );
  if (archDocs.length === 0)
    recommendations.push(
      "Create a docs/ directory with architecture documentation",
    );
  if (!agentFile)
    recommendations.push(
      "Create a CLAUDE.md with agent-specific instructions (highest-ROI single action)",
    );

  return {
    category: "Machine-Readable Context",
    code: "MRC",
    score,
    findings,
    recommendations,
  };
}
