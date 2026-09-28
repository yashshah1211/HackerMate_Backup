/** Compact relative time: "now", "5m", "3h", "2d", then a short date. */
export function relativeTime(dateString: string | null | undefined, opts: { suffix?: boolean } = {}): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  const sfx = opts.suffix ? " ago" : "";

  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m${sfx}`;
  if (hours < 24) return `${hours}h${sfx}`;
  if (days < 7) return `${days}d${sfx}`;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/** Whole days from today (local) until the given date. Negative = past. */
export function daysUntil(dateString: string | null | undefined): number | null {
  if (!dateString) return null;
  const target = new Date(dateString);
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / 86400000);
}

/** Timeline label for an event window, e.g. "Starts in 4d", "Ends today". */
export function eventTimeline(
  start: string | null | undefined,
  end: string | null | undefined,
): { label: string; state: "upcoming" | "live" | "ended" | "unknown"; urgent: boolean } {
  const s = daysUntil(start);
  const e = daysUntil(end);
  if (s === null && e === null) return { label: "Dates TBA", state: "unknown", urgent: false };
  if (s !== null && s > 0) {
    return { label: s === 1 ? "Starts tomorrow" : `Starts in ${s}d`, state: "upcoming", urgent: s <= 3 };
  }
  if (e !== null && e >= 0) {
    if (e === 0) return { label: "Ends today", state: "live", urgent: true };
    return { label: e === 1 ? "Ends tomorrow" : `Ends in ${e}d`, state: "live", urgent: e <= 3 };
  }
  return { label: "Ended", state: "ended", urgent: false };
}

/** "Mon 28 Sep" style date stamp used in page headers. */
export function dateStamp(d: Date = new Date()): string {
  return d
    .toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })
    .replace(",", "");
}

/** Greeting keyed to local hour. Kept from V1 ("Still grinding" after midnight). */
export function greeting(d: Date = new Date()): string {
  const hr = d.getHours();
  if (hr < 5) return "Still grinding";
  if (hr < 12) return "Good morning";
  if (hr < 17) return "Good afternoon";
  return "Good evening";
}
