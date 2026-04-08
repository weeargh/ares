import { spawnSync } from "node:child_process";

function buildLLMInput(result) {
  const topRecommendations = [];
  for (const category of [...result.categories].sort(
    (a, b) => a.score - b.score,
  )) {
    for (const rec of category.recommendations) {
      topRecommendations.push({
        code: category.code,
        category: category.category,
        score: category.score,
        recommendation: rec,
      });
    }
  }

  return {
    repoPath: result.repoPath,
    scanDate: result.scanDate,
    elapsed: result.elapsed,
    summary: result.summary,
    repoType: result.repoType,
    scorable: result.scorable,
    unscorableReason: result.unscorableReason,
    overallScore: result.overallScore,
    rawOverallScore: result.rawOverallScore,
    packageAverageScore: result.packageAverageScore,
    rating: result.rating,
    categories: result.categories.map((category) => ({
      code: category.code,
      category: category.category,
      score: category.score,
      findings: category.findings.slice(0, 8),
      recommendations: category.recommendations,
    })),
    packages: (result.packages || []).map((pkg) => ({
      name: pkg.name,
      path: pkg.path,
      repoType: pkg.repoType,
      overallScore: pkg.overallScore,
      rating: pkg.rating,
    })),
    topRecommendations: topRecommendations.slice(0, 12),
  };
}

export function buildMarkdownPrompt(result) {
  const payload = JSON.stringify(buildLLMInput(result), null, 2);

  return [
    "You are writing a repository readiness report in Markdown.",
    "Use only the scan data below. Do not invent files, tools, configs, or test results.",
    "Keep all numeric scores exactly as provided.",
    "Write a concise, practical report with these sections:",
    "1. Title",
    "2. Overall Score",
    "3. What Is Working",
    "4. Biggest Gaps",
    "5. Priority Actions",
    "6. Category Scorecard",
    "Return Markdown only. Do not wrap the response in code fences.",
    "",
    "Scan data:",
    payload,
  ].join("\n");
}

export function runMarkdownLLM(result, command, options = {}) {
  const timeoutMs = Number(options.timeoutMs) || 120000;
  const prompt = buildMarkdownPrompt(result);

  const run = spawnSync(command, {
    shell: true,
    input: prompt,
    encoding: "utf-8",
    maxBuffer: 10 * 1024 * 1024,
    timeout: timeoutMs,
  });

  if (run.error) {
    throw run.error;
  }

  if (run.status !== 0) {
    const stderr = (run.stderr || "").trim();
    throw new Error(stderr || `LLM command exited with status ${run.status}`);
  }

  const stdout = stripMarkdownFences((run.stdout || "").trim());
  if (!stdout) {
    throw new Error("LLM command returned empty output");
  }

  return stdout.endsWith("\n") ? stdout : `${stdout}\n`;
}

function stripMarkdownFences(output) {
  if (!output.startsWith("```")) return output;

  const lines = output.split("\n");
  if (lines.length < 3) return output;
  if (!lines[lines.length - 1].startsWith("```")) return output;

  return lines.slice(1, -1).join("\n").trim();
}
