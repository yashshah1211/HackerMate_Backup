type HistoryRow = { id: string; created_at: string };

// Postgres timestamps can contain microseconds. Date alone truncates them.
export function compareMessageTime(a: string, b: string) {
  const milliseconds = Date.parse(a) - Date.parse(b);
  if (milliseconds) return milliseconds;
  const fraction = (value: string) => Number((value.match(/\.(\d+)/)?.[1] ?? "").padEnd(6, "0"));
  return fraction(a) - fraction(b);
}

function compareRows(a: HistoryRow, b: HistoryRow) {
  return compareMessageTime(a.created_at, b.created_at) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export function mergeMessageHistory<T extends HistoryRow>(current: T[], page: T[], events: ReadonlyMap<string, T | null>) {
  const rows = new Map([...page, ...current].map(row => [row.id, row]));
  for (const [id, event] of events) {
    if (event === null) rows.delete(id);
    else if (rows.has(id)) rows.set(id, event);
  }
  return [...rows.values()].sort(compareRows);
}

export function olderMessageFilter(cursor: HistoryRow) {
  // Values originate from stored rows. Quote filter literals and retain the
  // original timestamp precision instead of round-tripping through JS Date.
  const literal = (value: string) => `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
  const time = literal(cursor.created_at);
  return `created_at.lt.${time},and(created_at.eq.${time},id.lt.${literal(cursor.id)})`;
}
