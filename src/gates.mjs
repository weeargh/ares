import { getRatingForScore, STATIC_ASSESSMENT_MAX } from "./ratings.mjs";

const CRITICAL_CATEGORIES = new Set(["MRC", "TEST", "ENV", "MOD", "AGT"]);
const CONFIDENCE_LEVELS = new Set(["High", "Medium", "Low"]);
const TASK_CEILINGS = new Set([
  "localized",
  "cross-module",
  "operational",
  "autonomous",
]);

export function finalizeAssessment(rawAssessment, scanResult, evidence) {
  if (!rawAssessment || typeof rawAssessment !== "object") {
    throw new Error("LLM assessment must be a JSON object");
  }

  const expectedCategories = new Map(
    scanResult.categories.map((category) => [category.code, category]),
  );
  if (!Array.isArray(rawAssessment.categories)) {
    throw new Error("LLM assessment categories must be an array");
  }
  const submittedCodes = rawAssessment.categories.map((category) =>
    String(category?.code || "").toUpperCase(),
  );
  if (new Set(submittedCodes).size !== submittedCodes.length) {
    throw new Error("LLM assessment contains duplicate category codes");
  }
  const unexpectedCodes = submittedCodes.filter(
    (code) => !expectedCategories.has(code),
  );
  if (unexpectedCodes.length > 0) {
    throw new Error(
      `LLM assessment contains unexpected categories: ${unexpectedCodes.join(", ")}`,
    );
  }
  const submittedCategories = new Map(
    rawAssessment.categories.map((category) => [
      String(category.code || "").toUpperCase(),
      category,
    ]),
  );
  const knownEvidencePaths = new Map(
    evidence.excerpts.map((excerpt) => [excerpt.path, excerpt.lines]),
  );
  const appliedCaps = [];

  const categories = [...expectedCategories.entries()].map(
    ([code, baseline]) => {
      const submitted = submittedCategories.get(code);
      if (!submitted) {
        throw new Error(`LLM assessment is missing category ${code}`);
      }

      const citations = normalizeCitations(
        submitted.evidence,
        knownEvidencePaths,
      );
      let score = normalizeScore(submitted.score, `category ${code}`);
      const strongEvidenceCount = citations.filter(
        (citation) => citation.path && citation.evidenceType === "observed",
      ).length;
      if (score >= 9 && strongEvidenceCount < 2) {
        score = 8.5;
        appliedCaps.push(
          `${code} capped at 8.5 because fewer than two directly observed repository evidence citations support a 9+ score.`,
        );
      }

      return {
        code,
        category: baseline.category,
        weight: baseline.weight,
        score,
        rationale: requireText(
          submitted.rationale,
          `category ${code} rationale`,
        ),
        evidence: citations,
        failureModes: normalizeTextList(submitted.failureModes),
        recommendations: normalizeTextList(submitted.recommendations),
      };
    },
  );

  const weightedAverage = calculateWeightedAverage(categories);
  const modelOverallScore = normalizeScore(
    rawAssessment.overallScore,
    "overall score",
  );
  let overallScore = modelOverallScore;

  if (overallScore > weightedAverage + 0.5) {
    overallScore = normalizeScore(weightedAverage + 0.5);
    appliedCaps.push(
      `Overall score capped at ${overallScore.toFixed(1)} because it exceeded the evidence-backed category average by more than 0.5.`,
    );
  }

  const capabilities = evidence.capabilities || {};
  if (!capabilities.testPath && !capabilities.runPath) {
    overallScore = applyCap(
      overallScore,
      5.5,
      "No clear repository-native run or test path was discovered.",
      appliedCaps,
    );
  }

  const categoryScores = new Map(
    categories.map((category) => [category.code, category.score]),
  );
  if (
    !capabilities.testPath ||
    (categoryScores.has("TEST") && categoryScores.get("TEST") < 5)
  ) {
    overallScore = applyCap(
      overallScore,
      6.5,
      "The validation loop is missing or materially weak.",
      appliedCaps,
    );
  }

  if (evidence.inventory.source > 25 && !capabilities.ci) {
    overallScore = applyCap(
      overallScore,
      7.5,
      "No CI feedback loop was discovered for a non-trivial repository.",
      appliedCaps,
    );
  }

  if (evidence.sizeClass !== "small" && !capabilities.agentGuidance) {
    overallScore = applyCap(
      overallScore,
      8,
      "No meaningful agent guidance was discovered in a medium or large repository.",
      appliedCaps,
    );
  }

  if (categoryScores.has("MOD") && categoryScores.get("MOD") < 5) {
    overallScore = applyCap(
      overallScore,
      7,
      "Weak change boundaries create a high blast-radius risk.",
      appliedCaps,
    );
  }

  const criticalScores = categories
    .filter((category) => CRITICAL_CATEGORIES.has(category.code))
    .map((category) => category.score);
  if (criticalScores.some((score) => score < 5)) {
    overallScore = applyCap(
      overallScore,
      6.5,
      "At least one critical readiness category is below 5.0.",
      appliedCaps,
    );
  }
  if (criticalScores.some((score) => score < 7)) {
    overallScore = applyCap(
      overallScore,
      8.5,
      "At least one critical readiness category is below 7.0.",
      appliedCaps,
    );
  }

  if (
    evidence.inventory.source > 0 &&
    evidence.coverage.inspected.source === 0
  ) {
    overallScore = applyCap(
      overallScore,
      6,
      "No source files were included in the model-visible evidence.",
      appliedCaps,
    );
  }
  if (evidence.inventory.test > 0 && evidence.coverage.inspected.test === 0) {
    overallScore = applyCap(
      overallScore,
      7.5,
      "Tests exist but none were included in the model-visible evidence.",
      appliedCaps,
    );
  }

  overallScore = applyCap(
    overallScore,
    STATIC_ASSESSMENT_MAX,
    "Static inspection cannot prove autonomous task completion; verified or benchmark evidence is required above 8.5.",
    appliedCaps,
  );

  const confidence = normalizeConfidence(rawAssessment.confidence, evidence);
  let taskCeiling = normalizeTaskCeiling(rawAssessment.taskCeiling);
  const maximumTaskCeiling =
    overallScore >= 10
      ? "autonomous"
      : overallScore >= 9
        ? "operational"
        : overallScore >= 7.5
          ? "cross-module"
          : "localized";
  if (taskCeilingRank(taskCeiling) > taskCeilingRank(maximumTaskCeiling)) {
    const proposedTaskCeiling = taskCeiling;
    taskCeiling = maximumTaskCeiling;
    appliedCaps.push(
      `Task ceiling reduced from ${proposedTaskCeiling} to ${taskCeiling} because the final readiness score does not support the higher autonomy claim.`,
    );
  }

  return {
    schemaVersion: 1,
    assessmentMode: "static-llm",
    overallScore,
    modelOverallScore,
    weightedCategoryAverage: weightedAverage,
    rating: getRatingForScore(overallScore),
    confidence,
    taskCeiling,
    summary: requireText(rawAssessment.summary, "assessment summary"),
    categories,
    strengths: normalizeTextList(rawAssessment.strengths),
    gaps: normalizeTextList(rawAssessment.gaps),
    failureModes: normalizeTextList(rawAssessment.failureModes),
    priorityActions: normalizeTextList(rawAssessment.priorityActions),
    safeStartingCommands: normalizeTextList(rawAssessment.safeStartingCommands),
    modelSuggestedCaps: normalizeTextList(rawAssessment.appliedCaps),
    appliedCaps,
    evidenceCoverage: evidence.coverage,
  };
}

function normalizeCitations(citations, knownPaths) {
  if (!Array.isArray(citations)) return [];
  const output = [];
  const seen = new Set();

  for (const citation of citations) {
    if (!citation || typeof citation !== "object") continue;
    const path = typeof citation.path === "string" ? citation.path.trim() : "";
    const absence =
      typeof citation.absence === "string" ? citation.absence.trim() : "";
    if (path && !knownPaths.has(path)) continue;
    if (!path && !absence) continue;
    if (
      path &&
      Number.isInteger(citation.line) &&
      citation.line > knownPaths.get(path)
    ) {
      continue;
    }
    const claim = String(citation.claim || "").trim();
    if (!claim) continue;
    const key = `${path}:${absence}:${claim}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push({
      ...(path ? { path } : { absence }),
      ...(Number.isInteger(citation.line) && citation.line > 0
        ? { line: citation.line }
        : {}),
      claim,
      evidenceType: ["observed", "inferred"].includes(citation.evidenceType)
        ? citation.evidenceType
        : "observed",
    });
  }

  return output.slice(0, 8);
}

function normalizeConfidence(value, evidence) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  let confidence =
    normalized === "high" ? "High" : normalized === "low" ? "Low" : "Medium";

  if (confidence === "High" && evidence.coverage.minimumMet === false) {
    confidence = "Medium";
  }
  return CONFIDENCE_LEVELS.has(confidence) ? confidence : "Medium";
}

function normalizeTaskCeiling(value) {
  const normalized = String(value || "localized")
    .trim()
    .toLowerCase();
  return TASK_CEILINGS.has(normalized) ? normalized : "localized";
}

function taskCeilingRank(value) {
  return ["localized", "cross-module", "operational", "autonomous"].indexOf(
    value,
  );
}

function calculateWeightedAverage(categories) {
  const totalWeight = categories.reduce(
    (sum, category) => sum + (category.weight || 1),
    0,
  );
  const total = categories.reduce(
    (sum, category) => sum + category.score * (category.weight || 1),
    0,
  );
  return normalizeScore(totalWeight > 0 ? total / totalWeight : 0);
}

function applyCap(score, cap, reason, appliedCaps) {
  if (score <= cap) return score;
  appliedCaps.push(`${reason} Overall score capped at ${cap.toFixed(1)}.`);
  return cap;
}

function normalizeScore(value, label = "score") {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`LLM assessment ${label} must be numeric`);
  }
  return Math.min(10, Math.max(0, Math.round(numeric * 2) / 2));
}

function requireText(value, label) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`LLM assessment is missing ${label}`);
  return text;
}

function normalizeTextList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 12);
}
