/** Public API projection only. Never infer verification from transport success. */
export type VerifiedCertificate = {
  recipient: string; achievement: string; event: string; issuer: string; issued: string; id: string;
};
export type VerificationResult =
  | { kind: "verified"; certificate: VerifiedCertificate }
  | { kind: "loading" | "invalid" | "missing" | "ambiguous" | "unavailable" };

export function certificateLookupPath(id: string): string | null {
  // Match the API's format guard without trimming, sanitizing or decoding again.
  if (!/[a-zA-Z0-9_-]/.test(id) || /[\u0000-\u001f\u007f]/.test(id)) return null;
  try { return `/api/certificates/verify/${encodeURIComponent(id)}`; }
  catch { return null; }
}

const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

export function certificateResponse(status: number, body: unknown): VerificationResult {
  if (status === 400) return { kind: "invalid" };
  if (status === 404) return { kind: "missing" };
  if (status === 409) return { kind: "ambiguous" };
  if (status !== 200 || !body || typeof body !== "object" || Array.isArray(body)) return { kind: "unavailable" };
  const data = body as Record<string, unknown>;
  if (data.valid !== true || data.error != null) return { kind: "unavailable" };
  const id = typeof data.certificate_id === "number" && Number.isFinite(data.certificate_id)
    ? String(data.certificate_id) : data.certificate_id;
  if (!text(id) || !text(data.recipient_name) || !text(data.badge_name) || !text(data.event_name) ||
      !text(data.issuer_name) || !text(data.issued_at)) return { kind: "unavailable" };
  // Reject invalid or normalized calendar dates rather than inventing an issue date.
  const day = data.issued_at.slice(0, 10);
  const date = new Date(data.issued_at);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(date.getTime()) ||
      new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day) return { kind: "unavailable" };
  return { kind: "verified", certificate: {
    recipient: data.recipient_name, achievement: text(data.rank_title) ? data.rank_title : data.badge_name,
    event: data.event_name, issuer: data.issuer_name, issued: day, id,
  } };
}

export async function lookupCertificate(id: string, signal: AbortSignal): Promise<VerificationResult> {
  const path = certificateLookupPath(id);
  if (!path) return { kind: "invalid" };
  try {
    const response = await fetch(path, { signal, cache: "no-store", credentials: "omit", redirect: "error" });
    // Error payloads may be non-JSON; never display their contents.
    const body: unknown = response.status === 200 ? await response.json() : null;
    return certificateResponse(response.status, body);
  } catch { return { kind: "unavailable" }; }
}
