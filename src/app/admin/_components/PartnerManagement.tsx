"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ManagedPartner, PartnerEventOption } from "@/lib/partners/adminTypes";
import PartnerConfigEditor from "./PartnerConfigEditor";
import PartnerOrganizerAccess from "./PartnerOrganizerAccess";
import { partnerButton, partnerInput, partnerRequest } from "./partnerClient";

export default function PartnerManagement({ onChanged }: { onChanged: () => Promise<void> }) {
  const [data, setData] = useState<{ partners: ManagedPartner[]; events: PartnerEventOption[] } | null>(null);
  const [error, setError] = useState<string | null>(null), [epoch, setEpoch] = useState(0);
  const [selection, setSelection] = useState(""), [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    partnerRequest<{ partners: ManagedPartner[]; events: PartnerEventOption[] }>("/api/admin/partner-config", "GET", undefined, controller.signal)
      .then(value => { if (active) setData(value); })
      .catch(err => { if (active) { console.error("[admin/partners] Configuration list failed:", err); setError(err instanceof Error ? err.message : "Partner configuration is unavailable."); } });
    return () => { active = false; controller.abort(); };
  }, [epoch]);
  const partner = data?.partners.find(value => value.id === selection) || null;
  const event = data?.events.find(value => value.id === partner?.hackathon_id);
  function saved(value: ManagedPartner, savedSelection: string) {
    setData(current => current ? { ...current, partners: [value, ...current.partners.filter(item => item.id !== value.id)] } : null);
    setSelection(current => current === savedSelection ? value.id : current);
    setMessage(`Public configuration saved for ${value.partner_name}. Organizer assignments are managed separately.`);
    onChanged().catch(err => console.error("[admin/partners] Legacy list refresh failed:", err));
  }
  return <section aria-label="Partner configuration and access" className="p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/30 space-y-4 text-zinc-900 dark:text-zinc-100">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-semibold">Partner configuration & organizer access</h3>
      <button type="button" className={partnerButton} onClick={() => { setData(null); setError(null); setMessage(null); setEpoch(value => value + 1); }}>Reload configuration</button></div>
    {error ? <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{error}</p> : !data ? <p role="status" className="text-xs">Loading partner configuration…</p> : <>
      <label className="block space-y-1 text-xs">Configured partner<select value={selection} onChange={e => { setSelection(e.target.value); setMessage(null); }} className={partnerInput}>
        <option value="">Configure an existing event as a new partner</option>{data.partners.map(value => <option key={value.id} value={value.id}>{value.partner_name} / {value.slug} · {value.portal_version}</option>)}
      </select></label>
      {!data.partners.length && <p className="text-xs text-zinc-500 dark:text-zinc-400">No partner configurations yet. Choose an existing event below.</p>}
      {message && <p role="status" className="text-xs">{message}</p>}
      <PartnerConfigEditor key={partner ? `${partner.id}:${partner.revision}` : `new:${epoch}`} partner={partner} events={data.events} saved={value => saved(value, selection)} />
      {partner && <div className="flex flex-wrap gap-3 text-xs"><Link href={`/partners/${encodeURIComponent(partner.slug)}`} className="underline focus-visible:outline-2">Open public page</Link>
        {partner.portal_version === "organizer-v1" && <Link href={`/partners/${encodeURIComponent(partner.slug)}/organizer`} className="underline focus-visible:outline-2">Open organizer workspace</Link>}</div>}
      {partner && (event ? <PartnerOrganizerAccess key={partner.hackathon_id} eventId={partner.hackathon_id} eventName={event.name} />
        : <p role="status" className="text-xs text-zinc-500 dark:text-zinc-400">Organizer access is unavailable until this partner is associated with an existing event.</p>)}
    </>}
  </section>;
}
