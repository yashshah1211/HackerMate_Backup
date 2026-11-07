// Shared wire contract; no privileged client or contact data in this module.
export const RESTORED_REVIEW_STATUS = "restored_review";
export const REMOVED_LEADS_PAGE_SIZE = 25;
export function isLeadId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
// Log actual SQLSTATE/PostgREST codes without record-bearing messages/details.
export function restorationErrorCode(error: unknown): string {
  const code = error && typeof error === "object" && "code" in error ? error.code : null;
  return typeof code === "string" && /^(?:[A-Z0-9]{5}|PGRST\d{3})$/.test(code) ? code : "unavailable";
}
export interface RemovedLeadSummary {
  id: string;
  title: string;
  pitchSentAt: string | null;
  hasLastRecipient: boolean;
  imageRequests: number;
}
