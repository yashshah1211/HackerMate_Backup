/** Source links are data, never executable markup. */
export function safeEventUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 4096 || /[\u0000-\u0020\u007f\\]/.test(value)) return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function safeDescriptionUrl(value: unknown, baseUrl?: string | null): string | null {
  if (typeof value === "string" && /^mailto:[^\s?<>]+@[^\s?<>]+$/i.test(value)) return value;
  const absolute = safeEventUrl(value);
  if (absolute) return absolute;
  if (typeof value !== "string" || /[\u0000-\u0020\u007f\\]/.test(value) || !safeEventUrl(baseUrl)) return null;
  try { return safeEventUrl(new URL(value, baseUrl!).href); } catch { return null; }
}
