/** Pure Challenge contract: safe for the details page as well as server routes. */
export const CHALLENGE_UPLOAD_LIMITS = { fileBytes: 4_000_000, requestBytes: 4_100_000 } as const;
export const CHALLENGE_UPLOAD_ERROR = "Upload rejected: PDFs must be at most 4,000,000 bytes and the complete request at most 4,100,000 bytes. No evaluation was started.";

export function isParticipantConstraint(value: string): boolean {
  return !value.trim().startsWith("ReactionTheme:");
}

export interface ChallengeTemplateGuidance { slideNumber: number; title: string; category: string }
export interface ChallengeRequirements { bindingRules: string[]; templateGuidance: ChallengeTemplateGuidance[] }

/** Reject malformed/oversized stored requirements rather than silently judging without them. */
export function normalizeChallengeRequirements(record: {
  constraints?: unknown; additional_rules?: unknown; slide_template?: unknown;
}): ChallengeRequirements {
  const fail = (): never => { throw new Error("Invalid stored challenge requirements"); };
  const text = (value: unknown, maximum: number) => {
    if (typeof value !== "string" || !value.trim() || value.length > maximum) return fail();
    return value.trim();
  };
  const constraints = record.constraints ?? [];
  if (!Array.isArray(constraints) || constraints.length > 64) return fail();
  const bindingRules = constraints.map(value => text(value, 1000)).filter(isParticipantConstraint);
  if (record.additional_rules != null && record.additional_rules !== "") bindingRules.push(text(record.additional_rules, 6000));
  const template = record.slide_template ?? [];
  if (!Array.isArray(template) || template.length > 60) return fail();
  const templateGuidance = template.map(value => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return fail();
    const row = value as Record<string, unknown>;
    if (!Number.isInteger(row.slideNumber) || (row.slideNumber as number) < 1 || (row.slideNumber as number) > 60) return fail();
    return { slideNumber: row.slideNumber as number, title: text(row.title, 300), category: text(row.category, 100) };
  });
  if (bindingRules.join("\n").length + JSON.stringify(templateGuidance).length > 12_000) return fail();
  return { bindingRules, templateGuidance };
}

/** Exact decoded slug first, then its supported normalized spelling; never fuzzy matching. */
export function challengeIdentity(raw: string): { slug: string; normalized: string; id?: string } {
  const slug = decodeURIComponent(raw).trim();
  if (!slug || slug.length > 200) throw new Error("Invalid challenge identity");
  const normalized = slug.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const id = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug) ? slug.toLowerCase() : undefined;
  return { slug, normalized, id };
}
