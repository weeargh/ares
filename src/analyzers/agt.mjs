import { fileExists, mdHasSections, readFile } from "../utils.mjs";

export function analyzeAGT(ctx) {
  const { repoPath, files } = ctx;
  const findings = [];

  // ── Canonical agent instructions ───────────────────────────────────────
  const agentDoc = fileExists(
    repoPath,
    "CLAUDE.md",
    "claude.md",
    ".claude/CLAUDE.md",
    "AGENTS.md",
    "agents.md",
  );
  if (agentDoc) {
    const content = readFile(repoPath, agentDoc);
    const wordCount = content ? content.split(/\s+/).length : 0;

    findings.push({
      signal: "agent_doc_exists",
      value: true,
      impact: 2.5,
      detail: `${agentDoc} found (${wordCount} words)`,
    });

    if (content) {
      const sections = mdHasSections(content, [
        "build",
        "test",
        "lint",
        "structure",
        "architecture",
        "pattern",
        "convention",
        "style",
        "anti-pattern",
        "don't",
        "avoid",
        "important",
        "commands",
        "setup",
        "workflow",
        "database",
        "api",
        "migration",
        "deploy",
        "common task",
        "example",
      ]);

      const hasCommands =
        sections.build ||
        sections.test ||
        sections.lint ||
        sections.commands ||
        sections.setup;
      const hasPatterns =
        sections.pattern || sections.convention || sections.style;
      const hasAntiPatterns =
        sections["anti-pattern"] || sections["don't"] || sections.avoid;
      const hasWorkflows =
        sections["common task"] ||
        sections.workflow ||
        sections.example ||
        sections.migration;

      findings.push({
        signal: "agent_doc_commands",
        value: !!hasCommands,
        impact: hasCommands ? 1 : 0,
        detail: hasCommands
          ? `${agentDoc} includes build/test/lint commands`
          : `${agentDoc} missing build/test/lint commands`,
      });

      findings.push({
        signal: "agent_doc_patterns",
        value: !!hasPatterns,
        impact: hasPatterns ? 1 : 0,
        detail: hasPatterns
          ? `${agentDoc} documents coding patterns/conventions`
          : `${agentDoc} missing coding patterns section`,
      });

      findings.push({
        signal: "agent_doc_antipatterns",
        value: !!hasAntiPatterns,
        impact: hasAntiPatterns ? 0.5 : 0,
        detail: hasAntiPatterns
          ? `${agentDoc} includes anti-patterns / things to avoid`
          : `${agentDoc} missing anti-patterns section`,
      });

      findings.push({
        signal: "agent_doc_workflows",
        value: !!hasWorkflows,
        impact: hasWorkflows ? 0.5 : 0,
        detail: hasWorkflows
          ? `${agentDoc} includes common task workflows or examples`
          : `${agentDoc} missing common task workflows`,
      });

      findings.push({
        signal: "agent_doc_depth",
        value: wordCount,
        impact:
          wordCount > 1000
            ? 0.75
            : wordCount > 500
              ? 0.5
              : wordCount > 200
                ? 0.25
                : 0,
        detail: `${agentDoc} depth: ${wordCount} words (${wordCount > 1000 ? "comprehensive" : wordCount > 500 ? "decent" : wordCount > 200 ? "basic" : "minimal"})`,
      });
    }
  } else {
    findings.push({
      signal: "agent_doc_exists",
      value: false,
      impact: 0,
      detail: "No CLAUDE.md or AGENTS.md found",
    });
  }

  // ── Cursor rules ───────────────────────────────────────────────────────
  const cursorRules = fileExists(repoPath, ".cursorrules", ".cursor/rules");
  const cursorDir = files.filter((f) => f.startsWith(".cursor/rules/"));

  if (cursorRules || cursorDir.length > 0) {
    findings.push({
      signal: "cursor_rules",
      value: true,
      impact: 0.25,
      detail:
        cursorDir.length > 0
          ? `${cursorDir.length} Cursor rule files in .cursor/rules/`
          : ".cursorrules file found",
    });
  } else {
    findings.push({
      signal: "cursor_rules",
      value: false,
      impact: 0,
      detail: "No .cursorrules or .cursor/rules/ found",
    });
  }

  // ── GitHub Copilot instructions ────────────────────────────────────────
  const copilotInstructions = fileExists(
    repoPath,
    ".github/copilot-instructions.md",
  );
  findings.push({
    signal: "copilot_instructions",
    value: !!copilotInstructions,
    impact: copilotInstructions ? 0.25 : 0,
    detail: copilotInstructions
      ? "GitHub Copilot instructions found"
      : "No .github/copilot-instructions.md",
  });

  // ── Multi-agent support (has 2+ agent configs) ─────────────────────────
  const agentConfigs = [
    agentDoc,
    cursorRules || cursorDir.length > 0,
    copilotInstructions,
  ].filter(Boolean).length;
  if (agentConfigs >= 2) {
    findings.push({
      signal: "multi_agent_support",
      value: agentConfigs,
      impact: 0.25,
      detail: `${agentConfigs} different agent instruction files (multi-agent support)`,
    });
  }

  // ── .github/ISSUE_TEMPLATE or PR template ──────────────────────────────
  const issueTemplate = files.some((f) => /\.github\/ISSUE_TEMPLATE/i.test(f));
  const prTemplate = fileExists(
    repoPath,
    ".github/PULL_REQUEST_TEMPLATE.md",
    ".github/pull_request_template.md",
  );
  findings.push({
    signal: "pr_template",
    value: !!(issueTemplate || prTemplate),
    impact: prTemplate ? 0.5 : 0,
    detail:
      [prTemplate && "PR template", issueTemplate && "Issue templates"]
        .filter(Boolean)
        .join(", ") || "No PR/issue templates",
  });

  // ── Code generators / scaffolding ──────────────────────────────────────
  const generators = files.filter(
    (f) =>
      /generate|scaffold|template|plop|hygen/i.test(f) &&
      /\.(js|ts|mjs|json|yml)$/.test(f),
  );
  findings.push({
    signal: "code_generators",
    value: generators.length > 0,
    impact: generators.length > 0 ? 0.5 : 0,
    detail:
      generators.length > 0
        ? `${generators.length} generator/scaffold configs: ${generators.slice(0, 3).join(", ")}`
        : "No code generators/scaffolding tools",
  });

  // ── Score ──────────────────────────────────────────────────────────────
  const totalImpact = findings.reduce((s, f) => s + f.impact, 0);
  const score = Math.max(
    0,
    Math.min(10, Math.round(totalImpact * 1.15 * 10) / 10),
  );

  const recommendations = [];
  if (!agentDoc)
    recommendations.push(
      "Create one canonical agent instruction file at repo root (`CLAUDE.md` or `AGENTS.md`). Include commands, structure, patterns, anti-patterns, and common workflows.",
    );
  if (
    agentDoc &&
    !findings.find((f) => f.signal === "agent_doc_commands")?.value
  )
    recommendations.push(`Add build/test/lint commands to ${agentDoc}`);
  if (
    agentDoc &&
    !findings.find((f) => f.signal === "agent_doc_antipatterns")?.value
  )
    recommendations.push(
      `Add an anti-patterns section to ${agentDoc} so agents know what to avoid`,
    );
  if (
    agentDoc &&
    !findings.find((f) => f.signal === "agent_doc_workflows")?.value
  )
    recommendations.push(
      `Add common task workflows or examples to ${agentDoc}`,
    );

  return {
    category: "Agent-Explicit Configuration",
    code: "AGT",
    score,
    findings,
    recommendations,
  };
}
