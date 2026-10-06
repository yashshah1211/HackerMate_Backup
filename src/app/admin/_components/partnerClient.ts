export class PartnerRequestError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
export async function partnerRequest<T>(url: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { method, credentials: "same-origin", cache: "no-store",
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000),
    ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok) throw new PartnerRequestError(response.status, typeof data.error === "string" ? data.error : "Partner management is unavailable.");
  return data as T;
}
export const partnerInput = "w-full min-w-0 px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B4F461]";
export const partnerButton = "px-3 py-2 rounded-lg text-xs font-semibold border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B4F461]";
