export const RATING_BANDS = [
  {
    min: 9.0,
    max: 10.0,
    label: "Frontier-Grade Repo Readiness",
    emoji: "🟢",
    meaning:
      "Reserved for exceptionally legible, operable repos approaching frontier-lab standards for autonomous agent work.",
  },
  {
    min: 7.5,
    max: 8.9,
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
