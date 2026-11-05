/** A defensive client boundary for an admin-only, read-only catalog preview. */
export interface CatalogPreviewSummary {
  message: string;
  checked: number;
  discovered: number;
  remaining: number;
}

export async function requestCatalogPreview(fetcher: typeof fetch = fetch): Promise<CatalogPreviewSummary> {
  const response = await fetcher("/api/admin/hackathon-catalog-preview", {
    method: "GET",
    cache: "no-store",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });

  const type = response.headers.get("content-type")?.toLowerCase() ?? "";
  const text = await response.text();
  let value: unknown = null;
  if (type.includes("application/json")) {
    try { value = JSON.parse(text); } catch { /* Never expose raw invalid error bodies. */ }
  }
  const data = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error(type.includes("application/json")
        ? "Catalog preview access denied. Please refresh your administrator session."
        : "Catalog preview was blocked by site security (HTTP 403). Please refresh or contact the site administrator.");
    }
    throw new Error(typeof data?.error === "string" && data.error.length < 240
      ? data.error
      : `Catalog preview unavailable (HTTP ${response.status}). No records or emails were changed.`);
  }

  // A successful JSON response is not sufficient: enforce the server's
  // read-only result contract before showing a success notification.
  if (!data || data.success !== true || data.dryRun !== true
    || typeof data.checked !== "number" || typeof data.discovered !== "number") {
    throw new Error("Catalog preview returned an unexpected response. No changes were confirmed.");
  }
  return {
    message: typeof data.message === "string" ? data.message
      : `Catalog preview complete: ${data.checked} source checks. No records or emails changed.`,
    checked: data.checked,
    discovered: data.discovered,
    remaining: typeof data.remaining === "number" ? data.remaining : 0,
  };
}
