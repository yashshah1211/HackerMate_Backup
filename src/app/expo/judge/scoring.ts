import { Builder, Capability, Challenge, ScoreResult } from "./types";

export function scoreTeam(challenge: Challenge, builders: Builder[]): ScoreResult {
  let coverageScore = 0;
  let complementarityScore = 0;
  let bonusScore = 0;

  // 1. Challenge Coverage (Max 60, each required = 15)
  const requiredResults = challenge.required.map((req) => {
    const coveringBuilders = builders.filter((b) => b.covers.includes(req));
    const covered = coveringBuilders.length > 0;
    if (covered) {
      coverageScore += 15;
    }
    return {
      capability: req,
      covered,
      builders: coveringBuilders.map((b) => b.name),
    };
  });

  // 2. Bonus Fit (Max 20, each bonus = 10)
  const bonusResults = challenge.bonus.map((bon) => {
    const coveringBuilders = builders.filter((b) => b.covers.includes(bon));
    const covered = coveringBuilders.length > 0;
    if (covered) {
      bonusScore += 10;
    }
    return {
      capability: bon,
      covered,
      builders: coveringBuilders.map((b) => b.name),
    };
  });

  // 3. Team Complementarity (Max 20, each builder's need met = 5)
  const complementarityResults = builders.map((b) => {
    // Cannot satisfy own need
    const otherBuilders = builders.filter((other) => other.id !== b.id);
    const coveringBuilders = otherBuilders.filter((other) => other.covers.includes(b.needsSupportWith));
    const covered = coveringBuilders.length > 0;
    if (covered) {
      complementarityScore += 5;
    }
    return {
      builder: b.name,
      needs: b.needsSupportWith,
      covered,
      coveredBy: coveringBuilders.map((ob) => ob.name),
    };
  });

  // Clamp total to 100 defensively
  const total = Math.min(100, Math.max(0, coverageScore + complementarityScore + bonusScore));

  return {
    total,
    coverageScore,
    complementarityScore,
    bonusScore,
    requiredResults,
    complementarityResults,
    bonusResults,
  };
}
