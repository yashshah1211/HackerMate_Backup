"use client";

import { useEffect, useRef, useState } from "react";
import { isLeadId, REMOVED_LEADS_PAGE_SIZE, RESTORED_REVIEW_STATUS, type RemovedLeadSummary } from "@/lib/admin/organizerLeadRestore";

function history(lead: RemovedLeadSummary) {
  if (lead.pitchSentAt) return `Prior send recorded: ${new Date(lead.pitchSentAt).toLocaleDateString()}`;
  if (lead.hasLastRecipient) return "Prior recipient recorded; send time unavailable";
  return "No durable sending evidence; contact history is uncertain";
}

export default function RemovedLeadsReview({ onClose, onRestored }: {
  onClose: () => void;
  onRestored: () => Promise<void>;
}) {
  const [rows, setRows] = useState<RemovedLeadSummary[]>([]);
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState<RemovedLeadSummary | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const busy = useRef(false);
  const mounted = useRef(true);
  const panel = useRef<HTMLDivElement>(null);
  const cursor = cursors[cursors.length - 1];

  useEffect(() => {
    mounted.current = true;
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    return () => { mounted.current = false; previous?.focus(); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    async function load() {
      try {
        const response = await fetch(`/api/admin/organizer-leads/removed${cursor ? `?cursor=${cursor}` : ""}`, {
          cache: "no-store", signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok || !Array.isArray(data.leads) || data.leads.length > REMOVED_LEADS_PAGE_SIZE ||
            !(data.nextCursor === null || isLeadId(data.nextCursor)) ||
            !data.leads.every((row: RemovedLeadSummary) => isLeadId(row.id) && typeof row.title === "string" &&
              (row.pitchSentAt === null || (typeof row.pitchSentAt === "string" && Number.isFinite(Date.parse(row.pitchSentAt)))) &&
              typeof row.hasLastRecipient === "boolean" && Number.isInteger(row.imageRequests))) throw Error("Invalid page");
        if (current) { setRows(data.leads); setNextCursor(data.nextCursor); }
      } catch {
        if (current) setLoadError("Removed leads unavailable. Refresh the list.");
      } finally { if (current) setLoading(false); }
    }
    void load();
    return () => { current = false; controller.abort(); };
  }, [cursor, revision]);

  function prepareLoad() {
    setLoading(true); setLoadError(""); setRows([]); setNextCursor(null); setSelected(null);
  }

  function changePage(next: (string | null)[]) {
    prepareLoad(); setCursors(next);
  }

  function refresh() {
    prepareLoad(); setMessage(""); setRevision(value => value + 1);
  }

  async function restore() {
    if (!selected || busy.current) return;
    const leadId = selected.id;
    busy.current = true; setPending(true); setMessage("");
    try {
      const response = await fetch("/api/admin/organizer-leads/restore", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leadId }),
      });
      const result = await response.json();
      if (!mounted.current) return;
      if (!response.ok) {
        setFailed(true);
        setMessage(response.status === 404 ? "Lead no longer exists. Refresh the list." : response.status === 409
          ? "Lead is no longer removed. Refresh the list." : "Restoration could not be confirmed. Refresh before retrying.");
        return;
      }
      if (result.success !== true || result.leadId !== leadId || result.status !== RESTORED_REVIEW_STATUS) throw Error("Unconfirmed receipt");
      setSelected(null); setFailed(false);
      setMessage("Selected lead restored to review hold. Contact history preserved; no email sent.");
      prepareLoad();
      setRevision(value => value + 1);
      try { await onRestored(); } catch {
        if (mounted.current) setMessage("Selected lead restored to review hold. Refresh the CRM table to see the change. No email sent.");
      }
    } catch {
      if (mounted.current) { setFailed(true); setMessage("Restoration could not be confirmed. Refresh before retrying."); }
    } finally {
      busy.current = false;
      if (mounted.current) setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="removed-leads-heading"
        className="w-full max-w-xl max-h-[90dvh] overflow-y-auto rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 text-zinc-900 dark:text-zinc-100 shadow-2xl"
        onKeyDown={event => {
          if (event.key === "Escape" && !busy.current) onClose();
          if (event.key === "Tab") {
            const buttons = [...(panel.current?.querySelectorAll<HTMLElement>("button:not(:disabled)") ?? [])];
            const first = buttons[0], last = buttons.at(-1);
            if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
              event.preventDefault(); last?.focus();
            } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) {
              event.preventDefault(); first?.focus();
            }
          }
        }}>
        <div className="flex items-start justify-between gap-3">
          <h2 id="removed-leads-heading" className="text-base font-semibold">Review Removed Leads</h2>
          <button type="button" disabled={pending} onClick={onClose} className="text-sm underline disabled:opacity-50">Close</button>
        </div>
        <p className="my-3 text-xs text-zinc-500 dark:text-zinc-400">Restore one selected lead to a review hold. Sending stays blocked until a separate authorized CRM status decision. All contact history is retained.</p>
        {message && <p role={failed ? "alert" : "status"} className={`my-3 text-sm ${failed ? "text-rose-600 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-400"}`}>{message}</p>}
        {selected ? (
          <section className="space-y-3 border-t border-zinc-200 dark:border-zinc-800 pt-3">
            <h3 className="font-semibold break-words">Restore {selected.title}?</h3>
            <p className="text-xs font-mono break-all">Lead: {selected.id}</p>
            <p className="text-sm">{history(selected)}</p>
            <p className="text-sm">Outcome: Restored — review held. This changes only this lead’s status and update timestamp. No email will be sent.</p>
            <div className="flex flex-wrap gap-3">
              <button type="button" disabled={pending} onClick={() => { setSelected(null); setMessage(""); }} className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm disabled:opacity-50">Cancel</button>
              <button type="button" disabled={pending || failed} onClick={restore} className="rounded-lg bg-[#B4F461] px-3 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-50">{pending ? "Restoring…" : "Confirm selected restoration"}</button>
            </div>
          </section>
        ) : (
          <>
            {loading && <p role="status" className="py-4 text-sm">Loading removed leads…</p>}
            {loadError && <p role="alert" className="py-4 text-sm text-rose-600 dark:text-rose-400">{loadError}</p>}
            {!loading && !loadError && rows.length === 0 && <p className="py-4 text-sm">No removed leads on this page.</p>}
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {rows.map(lead => <li key={lead.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0"><p className="break-words text-sm font-medium">{lead.title}</p><p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{history(lead)}</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">{lead.imageRequests} tracking image request(s); human reading unconfirmed</p></div>
                <button type="button" disabled={pending || loading} onClick={() => { setSelected(lead); setFailed(false); setMessage(""); }} className="shrink-0 rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-xs">Review</button>
              </li>)}
            </ul>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs">
              <button type="button" disabled={pending || loading || cursors.length === 1} onClick={() => changePage(cursors.slice(0, -1))} className="underline disabled:opacity-40">Previous page</button>
              <span>Page {cursors.length}</span>
              <button type="button" disabled={pending || loading || !nextCursor} onClick={() => nextCursor && changePage([...cursors, nextCursor])} className="underline disabled:opacity-40">Next page</button>
            </div>
          </>
        )}
        <button type="button" disabled={pending || loading} onClick={refresh} className="mt-4 text-xs underline disabled:opacity-40">Refresh removed list</button>
      </div>
    </div>
  );
}
