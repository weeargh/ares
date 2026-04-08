export const RATING_BANDS = [
  {
    min: 8.5,
    max: 10.0,
    label: "Frontier-Grade Repo Readiness",
    emoji: "🟢",
    meaning:
      "Repo exhibits frontier-grade static readiness for AI coding agents.",
  },
  {
    min: 7.0,
    max: 8.4,
    label: "Strong Repo Readiness",
    emoji: "🔵",
    meaning: "Agents can complete most scoped tasks independently.",
  },
  {
    min: 5.0,
    max: 6.9,
    label: "Practical Repo Readiness",
    emoji: "🟡",
    meaning: "Agents can handle routine tasks with guidance and validation.",
  },
  {
    min: 3.0,
    max: 4.9,
    label: "Limited Repo Readiness",
    emoji: "🟠",
    meaning:
      "Agents can make progress, but they still need close guidance and correction.",
  },
  {
    min: 0,
    max: 2.9,
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
