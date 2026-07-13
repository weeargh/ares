export const STATIC_ASSESSMENT_MAX = 8.5;

export const RATING_BANDS = [
  {
    min: 10.0,
    max: 10.0,
    label: "Empirically Autonomous Repo Readiness",
    emoji: "🟢",
    meaning:
      "Repeated benchmark tasks show that agents can operate, validate, and recover without repository-specific human rescue.",
  },
  {
    min: 9.0,
    max: 9.5,
    label: "Autonomous-Ready Repo Readiness",
    emoji: "🟢",
    meaning:
      "Verified evidence shows that agents can complete normal repository work independently; only exceptional workflows still need help.",
  },
  {
    min: 7.5,
    max: 8.5,
    label: "Strong Repo Readiness",
    emoji: "🔵",
    meaning:
      "Agents can complete most scoped tasks independently with limited human correction.",
  },
  {
    min: 5.5,
    max: 7.4,
    label: "Practical Repo Readiness",
    emoji: "🟡",
    meaning:
      "Agents can handle routine tasks, but recurring friction still slows or constrains them.",
  },
  {
    min: 3.5,
    max: 5.4,
    label: "Limited Repo Readiness",
    emoji: "🟠",
    meaning:
      "Agents can make progress, but they still need frequent steering, clarification, and correction.",
  },
  {
    min: 0,
    max: 3.4,
    label: "Fragile Repo Readiness",
    emoji: "🔴",
    meaning:
      "Agents are likely to stall or make unsafe changes without substantial human help.",
  },
];

export function getRatingForScore(score) {
  return (
    RATING_BANDS.find((band) => score >= band.min)?.label ||
    "Fragile Repo Readiness"
  );
}

export function getRatingBand(rating) {
  return (
    RATING_BANDS.find((band) => band.label === rating) || RATING_BANDS.at(-1)
  );
}
