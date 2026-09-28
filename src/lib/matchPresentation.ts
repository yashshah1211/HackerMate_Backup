/**
 * Human-facing presentation of matchmaking output.
 *
 * `get_recommended_teammates` (mm-v1) scores
 *   0.55·complementarity + 0.20·foundations + 0.15·experience + 0.10·context
 * and most builders have no experience evidence yet, so that term defaults to
 * 0.5. Complementarity also saturates at 1.0 for anyone in a different domain.
 * The result is that many genuinely different builders land on the same
 * number (e.g. 93). The score is real and still drives ranking, but printing it
 * as a big numeral implies precision the data doesn't have. These helpers turn
 * the same inputs into a coarse band and a concrete, data-backed reason.
 */

export type FitBand = { label: string; tone: "accent" | "ok" | "neutral"; detail: string };

/** Coarse band for a 0–100 fit score. `evidence` is mm-v1 `confidence` (0–1). */
export function fitBand(score: number | null | undefined, evidence?: number | null): FitBand | null {
  if (typeof score !== "number" || Number.isNaN(score)) return null;
  const signals = typeof evidence === "number" ? Math.round(evidence * 100) : null;
  const detail = `Match score ${score}/100${signals !== null ? ` · ${signals}% of signals available` : ""}`;
  if (score >= 85) return { label: "Strong fit", tone: "accent", detail };
  if (score >= 70) return { label: "Good fit", tone: "ok", detail };
  return { label: "Possible fit", tone: "neutral", detail };
}

const norm = (s: string) => s.toLowerCase().trim();

function listTwo(items: string[]): string {
  if (items.length <= 1) return items[0] || "";
  return `${items[0]} and ${items[1]}`;
}

/** Plain-language rewrites of the mm-v1 reason codes. */
const REASON_COPY: [RegExp, string][] = [
  [/complementary domain/i, "Works in a different area than you"],
  [/collaboration foundations/i, "Shares your core fundamentals"],
  [/same verified college/i, "Same college as you"],
  [/available for a team/i, "Open to joining a team"],
  [/discovery suggestion/i, "New to HackerMate · profile still filling in"],
];

export function humanizeReason(reason: string | null | undefined): string | null {
  if (!reason) return null;
  for (const [re, copy] of REASON_COPY) if (re.test(reason)) return copy;
  return reason;
}

export type MatchReason = { text: string; discovery: boolean };

/**
 * One concrete sentence explaining why this builder was suggested, built from
 * their real skills where possible:
 *   complementary → "Adds Figma and Flutter to your stack"
 *   overlap       → "Also builds with React and Python"
 * Falls back to a plain rewrite of the engine's first reason.
 */
export function matchReason({
  reasons,
  builderSkills,
  viewerSkills,
}: {
  reasons?: string[] | null;
  builderSkills?: string[] | null;
  viewerSkills?: string[] | null;
}): MatchReason | null {
  const list = reasons || [];
  const first = list[0];
  const discovery = Boolean(first && /discovery suggestion/i.test(first));
  const theirs = (builderSkills || []).filter(Boolean);
  const mine = new Set((viewerSkills || []).map(norm));

  if (!discovery && theirs.length && mine.size) {
    const adds = theirs.filter((s) => !mine.has(norm(s)));
    const shared = theirs.filter((s) => mine.has(norm(s)));
    const complementary = list.some((r) => /complementary/i.test(r));
    if (complementary && adds.length) return { text: `Adds ${listTwo(adds.slice(0, 2))} to your stack`, discovery };
    if (shared.length) return { text: `Also builds with ${listTwo(shared.slice(0, 2))}`, discovery };
    if (adds.length) return { text: `Adds ${listTwo(adds.slice(0, 2))} to your stack`, discovery };
  }

  const text = humanizeReason(first);
  return text ? { text, discovery } : null;
}

/** How many of a team's wanted skills the viewer already has. */
export function teamSkillCoverage(teamSkills: string[] | null | undefined, viewerSkills: string[]) {
  const wanted = (teamSkills || []).filter(Boolean);
  const mine = new Set(viewerSkills.map(norm));
  const matched = wanted.filter((s) => mine.has(norm(s)));
  return { matched: matched.length, total: wanted.length, skills: matched };
}

/** Short label for team cards: "You cover 3 of 4 skills" / "You cover their 2 skills". */
export function coverageLabel({ matched, total }: { matched: number; total: number }): string | null {
  if (!total || !matched) return null;
  if (matched === total) return total === 1 ? "You have the skill they need" : `You have all ${total} skills they need`;
  return `You have ${matched} of ${total} skills they need`;
}
