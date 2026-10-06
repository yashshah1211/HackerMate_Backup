"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { EventOrganizerAccount } from "@/lib/partners/adminTypes";
import { partnerButton, partnerInput, partnerRequest } from "./partnerClient";

export default function PartnerOrganizerAccess({ eventId, eventName }: { eventId: string; eventName: string }) {
  const [rows, setRows] = useState<EventOrganizerAccount[] | null>(null), [error, setError] = useState<string | null>(null);
  const [epoch, setEpoch] = useState(0), [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<EventOrganizerAccount | null>(null), [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    partnerRequest<{ eventId: string; organizers: EventOrganizerAccount[] }>(`/api/admin/partner-organizers?eventId=${encodeURIComponent(eventId)}`, "GET", undefined, controller.signal)
      .then(data => { if (active) { if (data.eventId !== eventId) throw new Error("Unable to verify organizer scope."); setRows(data.organizers); } })
      .catch(err => { if (active) { console.error("[admin/partners] Organizer list failed:", err); setError(err instanceof Error ? err.message : "Unable to load organizer assignments."); } });
    return () => { active = false; controller.abort(); };
  }, [eventId, epoch]);
  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (busy) return;
    const form = e.currentTarget, userId = String(new FormData(form).get("userId") || "").trim();
    setBusy(true); setError(null); setMessage(null);
    try {
      const data = await partnerRequest<{ eventId: string; organizer: EventOrganizerAccount }>("/api/admin/partner-organizers", "POST", { eventId, userId });
      if (data.eventId !== eventId) throw new Error("Unable to verify organizer scope.");
      setRows(value => [...(value || []), { ...data.organizer, full_name: null }]); form.reset(); setMessage("Organizer access granted for this event.");
    } catch (err) { console.error("[admin/partners] Organizer grant failed:", err); setError(err instanceof Error ? err.message : "Unable to grant access."); }
    finally { setBusy(false); }
  }
  async function revoke() {
    if (!pending || busy) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const data = await partnerRequest<{ eventId: string; userId: string; revoked: boolean }>("/api/admin/partner-organizers", "DELETE", { eventId, userId: pending.user_id });
      if (data.eventId !== eventId || data.userId !== pending.user_id) throw new Error("Unable to verify organizer scope.");
      setRows(value => value?.filter(row => row.user_id !== pending.user_id) || []); setPending(null);
      setMessage(data.revoked ? "Assignment revoked. Assigned access ends on the next authorized request." : "This assignment was already revoked.");
    } catch (err) { console.error("[admin/partners] Organizer revoke failed:", err); setError(err instanceof Error ? err.message : "Unable to revoke access."); }
    finally { setBusy(false); }
  }
  return <section aria-label="Organizer access" className="space-y-3 pt-5 border-t border-zinc-200 dark:border-zinc-800">
    <h4 className="text-sm font-semibold">Organizer access · {eventName}</h4>
    <p className="text-xs text-zinc-500 dark:text-zinc-400">Event-specific read/export access. Use an existing HackerMate account UUID from its profile URL. No account is created and no platform role changes.</p>
    <p className="text-xs text-zinc-500 dark:text-zinc-400">HackerMate admins already have access. Revoking an assignment does not remove independent admin or native-host access.</p>
    {rows === null ? <p role="status" className="text-xs">{error ? "Organizer list unavailable." : "Loading organizer assignments…"}</p>
      : rows.length ? <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">{rows.map(row => <li key={row.user_id} className="py-2 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 text-xs"><a href={`/profile/${row.user_id}`} className="underline break-all">{row.full_name || row.user_id}</a><p className="text-zinc-500 dark:text-zinc-400 break-all">{row.user_id}</p></div>
        <button type="button" disabled={busy} className={partnerButton} onClick={() => setPending(row)}>Revoke assignment</button>
      </li>)}</ul> : <p className="text-xs text-zinc-500 dark:text-zinc-400">No organizer accounts are assigned to this event.</p>}
    {pending && <div role="group" aria-label="Confirm revocation" className="space-y-2 p-3 border border-rose-400/40 rounded-lg text-xs">
      <p className="break-words">Revoke {pending.full_name || pending.user_id} ({pending.user_id}) for {eventName}? Their other event assignments remain unchanged.</p>
      <button type="button" disabled={busy} className={partnerButton} onClick={revoke}>Confirm revoke</button>{" "}
      <button type="button" disabled={busy} className={partnerButton} onClick={() => setPending(null)}>Cancel</button>
    </div>}
    {rows !== null && <form onSubmit={add} className="flex flex-wrap items-end gap-2"><label className="flex-1 min-w-0 space-y-1 text-xs">Existing account UUID<input name="userId" required maxLength={36} className={partnerInput} disabled={busy} /></label>
      <button type="submit" disabled={busy} className={partnerButton}>{busy ? "Saving access…" : "Add organizer"}</button></form>}
    {error && <div role="alert" className="text-xs text-rose-600 dark:text-rose-400"><p>{error}</p><button type="button" disabled={busy} className={partnerButton} onClick={() => { setError(null); setRows(null); setPending(null); setMessage(null); setEpoch(value => value + 1); }}>Reload organizer list</button></div>}
    {message && <p role="status" className="text-xs">{message}</p>}
  </section>;
}
