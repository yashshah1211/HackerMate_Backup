import "server-only";
import { createHash } from "node:crypto";
import { identifySource, nextData, type SourceIdentity } from "./providers";
import { array, object, text } from "./source";

export type SourceResponse = { body: string; hash: string; checkedAt: number };
type Rule = { allow: boolean; pattern: string };
export class SourceUnavailable extends Error {}

/** RFC-style longest-match rules for our truthful bot identity, falling back to User-agent: *. */
export function robotsAllowed(body: string, path: string): boolean {
  const groups: { agents: string[]; rules: Rule[] }[] = []; let current = { agents: [] as string[], rules: [] as Rule[] };
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim(), colon = line.indexOf(":"); if (colon < 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase(), value = line.slice(colon + 1).trim();
    if (key === "user-agent") {
      if (current.rules.length) { groups.push(current); current = { agents: [], rules: [] }; }
      current.agents.push(value.toLowerCase());
    } else if ((key === "allow" || key === "disallow") && value && value.length < 2048) current.rules.push({ allow: key === "allow", pattern: value });
  }
  groups.push(current);
  const specific = groups.filter(g => g.agents.some(a => a !== "*" && "hackermate-catalog".startsWith(a)));
  const chosen = specific.length ? specific : groups.filter(g => g.agents.includes("*"));
  const matching = chosen.flatMap(g => g.rules).filter(r => {
    const end = r.pattern.endsWith("$"), pattern = end ? r.pattern.slice(0, -1) : r.pattern;
    const escaped = pattern.split("*").map(s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*");
    return new RegExp("^" + escaped + (end ? "$" : "")).test(path);
  }).sort((a, b) => b.pattern.replaceAll("*", "").length - a.pattern.replaceAll("*", "").length || Number(b.allow) - Number(a.allow));
  return matching[0]?.allow ?? true;
}

export class SourceTransport {
  readonly deadline: number;
  private last = new Map<string, number>();
  private policies = new Map<string, string>();
  constructor(private readonly fetcher: typeof fetch = fetch, budgetMs = 240000, private readonly pauseMs = 1000) {
    this.deadline = Date.now() + Math.min(240000, budgetMs);
  }
  remaining(): number { return this.deadline - Date.now(); }
  private validate(value: string): URL {
    const u = new URL(value);
    if (u.protocol !== "https:" || u.username || u.password || u.port || !["unstop.com", "devfolio.co", "hack2skill.com"].includes(u.hostname)
      && !/^[a-z0-9]+(?:-[a-z0-9]+)*\.devfolio\.co$/.test(u.hostname)) throw new SourceUnavailable("Source origin is not allowed");
    const p = u.pathname;
    if (p !== "/robots.txt" && !(u.hostname === "unstop.com" && /^\/api\/public\/(?:competition\/\d+|opportunity\/search-result)$/.test(p))
      && !(u.hostname === "devfolio.co" && p === "/hackathons")
      && !(u.hostname.endsWith(".devfolio.co") && p === "/")
      && !(u.hostname === "hack2skill.com" && (/^\/api\/v1\/event\/[a-zA-Z0-9_-]+\/event-details$/.test(p) || p === "/api/v1/innovator/public/event/list"))) throw new SourceUnavailable("Source path is not allowed");
    return u;
  }
  private async raw(value: string): Promise<SourceResponse & { status: number }> {
    const u = this.validate(value), wait = Math.max(0, this.pauseMs - (Date.now() - (this.last.get(u.origin) || 0)));
    if (this.remaining() < wait + 1000) throw new SourceUnavailable("Source run time budget exhausted");
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    this.last.set(u.origin, Date.now());
    const response = await this.fetcher(u.href, { headers: { "User-Agent": "HackerMate-Catalog/1.0", Accept: "application/json,text/html,text/plain" },
      redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(Math.max(1, Math.min(10000, Math.floor(this.remaining())))) });
    // Never follow redirects to login pages, private routes, arbitrary custom URLs or credentials.
    if (response.status >= 300 && response.status < 400) throw new SourceUnavailable("Source redirected; review required");
    const reader = response.body?.getReader(), chunks: Uint8Array[] = []; let bytes = 0;
    if (reader) try { for (;;) { const part = await reader.read(); if (part.done) break; bytes += part.value.length;
      if (bytes > 2 * 1024 * 1024) throw new SourceUnavailable("Source response exceeds size limit"); chunks.push(part.value); }
    } finally { await reader.cancel(); }
    const body = Buffer.concat(chunks).toString("utf8");
    return { body, hash: createHash("sha256").update(body).digest("hex"), checkedAt: Date.now(), status: response.status };
  }
  async allowed(value: string): Promise<void> {
    const u = new URL(value);
    if (!this.policies.has(u.origin)) {
      const r = await this.raw(u.origin + "/robots.txt");
      if (r.status !== 200 && r.status !== 404) throw new SourceUnavailable("Source robots policy unavailable");
      this.policies.set(u.origin, r.status === 404 ? "" : r.body);
    }
    if (!robotsAllowed(this.policies.get(u.origin)!, u.pathname + u.search)) throw new SourceUnavailable("Source disallows this path");
  }
  async get(value: string): Promise<SourceResponse> {
    await this.allowed(value); const r = await this.raw(value);
    if (r.status !== 200) throw new SourceUnavailable(`Source HTTP ${r.status}`);
    return r;
  }
  async detail(identity: SourceIdentity): Promise<SourceResponse> {
    // Respect an event-specific restriction even if its JSON API is otherwise public.
    await this.allowed(identity.canonical_url);
    return this.get(identity.provider === "unstop" ? `https://unstop.com/api/public/competition/${identity.provider_id}`
      : identity.provider === "devfolio" ? identity.canonical_url + "/"
      : `https://hack2skill.com/api/v1/event/${identity.slug}/event-details`);
  }
}

export async function discoverSources(transport: SourceTransport): Promise<{ identities: SourceIdentity[]; failures: string[] }> {
  const identities: SourceIdentity[] = [], failures: string[] = [];
  try {
    for (const status of ["open", "upcoming"]) for (let page = 1; page <= 3; page++) {
      const r = await transport.get(`https://unstop.com/api/public/opportunity/search-result?opportunity=hackathons&per_page=30&page=${page}&oppstatus=${status}`), j = object(JSON.parse(r.body)), data = object(j.data);
      if (!Array.isArray(data.data)) throw new SourceUnavailable("Unstop listing shape changed");
      if (!data.data.length) break;
      for (const item of data.data) { const v = object(item), path = text(v.public_url); if (!path) continue;
        const id = identifySource(path.startsWith("https://") ? path : "https://unstop.com/" + path);
        if (id && String(v.id) === id.provider_id) identities.push(id); }
    }
  } catch (e) { console.error("Unstop discovery unavailable:", e); failures.push("unstop"); }
  try {
    const r = await transport.get("https://devfolio.co/hackathons"), pp = object(object(nextData(r.body).props).pageProps), state = object(pp.dehydratedState);
    const q = array(state.queries).map(object).find(q => q.queryKey === "fetchAllHackathonTypes");
    const data = object(object(q?.state).data);
    if (!Array.isArray(data.open_hackathons)) throw new SourceUnavailable("Devfolio listing shape changed");
    for (const item of [...array(data.open_hackathons), ...array(data.upcoming_hackathons)]) {
      const v = object(item), slug = text(v.slug), uuid = text(v.uuid); if (!slug || !uuid) continue;
      const id = identifySource(`https://${slug}.devfolio.co`); if (id) identities.push({ ...id, provider_id: uuid });
    }
  } catch (e) { console.error("Devfolio discovery unavailable:", e); failures.push("devfolio"); }
  try {
    const r = await transport.get("https://hack2skill.com/api/v1/innovator/public/event/list?page=1&records=100"), data = object(object(JSON.parse(r.body)).data);
    if (!Array.isArray(data.flagshipEvents) || !Array.isArray(data.communityEvents)) throw new SourceUnavailable("Hack2Skill listing shape changed");
    for (const item of [...data.flagshipEvents, ...data.communityEvents]) {
      const v = object(item), slug = text(v.eventUrl), uid = text(v._id); if (!slug || !uid) continue;
      const id = identifySource(`https://hack2skill.com/event/${slug}`); if (id) identities.push({ ...id, provider_id: uid });
    }
  } catch (e) { console.error("Hack2Skill discovery unavailable:", e); failures.push("hack2skill"); }
  return { identities: [...new Map(identities.map(i => [i.provider + ":" + i.provider_id, i])).values()], failures };
}
