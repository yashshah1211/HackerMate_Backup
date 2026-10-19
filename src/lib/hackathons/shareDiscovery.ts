import { discoveryQuery, readDiscoverySettings } from "./discovery";

/** Reuse the discovery contract, but never transport unrelated params or personal views. */
export function publicDiscoveryLink(params: Pick<URLSearchParams, "getAll">) {
  const settings = readDiscoverySettings(params);
  const saved = settings.tab === "saved";
  const personalOrder = settings.sort === "relevant";
  if (settings.from && settings.to && settings.from > settings.to) {
    return { url: null, explanation: "Fix the date range before copying a link." };
  }
  const query = discoveryQuery(new URLSearchParams(), {
    ...settings,
    tab: saved ? "recommended" : settings.tab,
    sort: personalOrder ? "date" : settings.sort,
  });
  const explanation = saved
    ? personalOrder ? "Copies public discovery with date order, not your saved list."
      : "Copies public discovery with these filters, not your saved list."
    : personalOrder ? "Copies these filters with date order. Personal recommendations aren’t shared."
      : "Copies these filters as a public discovery link.";
  return { url: `https://www.hackermate.in/hackathons${query ? `?${query}` : ""}`, explanation };
}
