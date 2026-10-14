import { readFileSync } from "node:fs";

const minimumLifetime = 30 * 60;
export function assertSessionLifetime(path: string, origin: string, now = Date.now() / 1000) {
  // Decode locally for expiry checks only. Never log state, JWTs or identity claims.
  try {
    const state = JSON.parse(readFileSync(path, "utf8"));
    const hostname = new URL(origin).hostname;
    const cookies = (state.cookies || []).filter((cookie: { name: string; domain: string }) =>
      /^sb-.+-auth-token(?:\.\d+)?$/.test(cookie.name)
      && (hostname === cookie.domain.replace(/^\./, "") || hostname.endsWith(`.${cookie.domain.replace(/^\./, "")}`)));
    const groups = new Map<string, { name: string; value: string }[]>();
    for (const cookie of cookies) {
      const key = cookie.name.replace(/\.\d+$/, "");
      groups.set(key, [...(groups.get(key) || []), cookie]);
    }
    const values: string[] = [];
    for (const parts of groups.values()) {
      parts.sort((a, b) => Number(a.name.match(/\.(\d+)$/)?.[1] || 0) - Number(b.name.match(/\.(\d+)$/)?.[1] || 0));
      values.push(parts.map(part => part.value).join(""));
    }
    for (const item of state.origins || []) if (item.origin === origin) {
      for (const entry of item.localStorage || []) if (/^sb-.+-auth-token$/.test(entry.name)) values.push(entry.value);
    }
    if (!values.length) throw new Error();
    for (const value of values) {
      const decoded = decodeURIComponent(value);
      const session = JSON.parse(decoded.startsWith("base64-") ? Buffer.from(decoded.slice(7), "base64url").toString("utf8") : decoded);
      const claims = JSON.parse(Buffer.from(session.access_token.split(".")[1], "base64url").toString("utf8"));
      if (![session.expires_at, claims.exp].every(exp => typeof exp === "number" && exp - now >= minimumLifetime)) throw new Error();
    }
  } catch {
    throw new Error("QA session must contain a valid Supabase expiry with at least 30 minutes remaining; renew through normal authorized login outside this suite");
  }
}
