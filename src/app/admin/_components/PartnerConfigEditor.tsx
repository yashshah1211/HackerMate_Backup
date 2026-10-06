"use client";

import { useState, type FormEvent } from "react";
import type { ManagedPartner, PartnerEventOption } from "@/lib/partners/adminTypes";
import { partnerButton, partnerInput, partnerRequest } from "./partnerClient";

export default function PartnerConfigEditor({ partner, events, saved }: {
  partner: ManagedPartner | null; events: PartnerEventOption[]; saved: (partner: ManagedPartner) => void;
}) {
  const [eventId, setEventId] = useState(partner?.hackathon_id || "");
  const [links, setLinks] = useState(partner?.approved_links || []);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const event = events.find(value => value.id === eventId);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const values = new FormData(e.currentTarget);
    const text = (key: string) => String(values.get(key) || "").trim();
    const nullable = (key: string) => text(key) || null;
    setBusy(true); setError(null);
    try {
      const approved_links = links.map((_, index) => ({ label: text(`link_label_${index}`), url: text(`link_url_${index}`) }))
        .filter(link => link.label || link.url);
      if (approved_links.some(link => !link.label || !link.url)) throw new Error("Each public link needs both a label and a URL.");
      const contactLabel = text("contact_label"), contactUrl = text("contact_url");
      if (Boolean(contactLabel) !== Boolean(contactUrl)) throw new Error("Public contact needs both a label and a URL.");
      const config = { hackathon_id: eventId, partner_name: text("partner_name"), slug: text("slug"), tagline: nullable("tagline"),
        logo_url: nullable("logo_url"), banner_url: nullable("banner_url"), accent_color: nullable("accent_color"),
        portal_version: text("portal_version"), registration_mode: nullable("registration_mode"), official_website: nullable("official_website"),
        public_contact: contactLabel ? { label: contactLabel, url: contactUrl } : null, approved_links };
      // Send only deliberate edits; normalized legacy values are not a rewrite.
      const changes = partner ? Object.fromEntries(Object.entries(config).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(partner[key as keyof ManagedPartner]))) : config;
      if (!Object.keys(changes).length) throw new Error("No configuration changes to save.");
      const result = await partnerRequest<{ partner: ManagedPartner }>("/api/admin/partner-config", partner ? "PATCH" : "POST",
        partner ? { partnerId: partner.id, expectedRevision: partner.revision, config: changes } : { config });
      saved(result.partner);
    } catch (err) { console.error("[admin/partners] Configuration save failed:", err); setError(err instanceof Error ? err.message : "Unable to save configuration."); }
    finally { setBusy(false); }
  }
  const field = (label: string, name: string, value: string | null | undefined, maxLength = 2048, required = false) =>
    <label className="space-y-1 text-xs">{label}<input name={name} defaultValue={value || ""} maxLength={maxLength} required={required} className={partnerInput} /></label>;
  return <form onSubmit={submit} className="space-y-4">
    <h4 className="text-sm font-semibold">{partner ? "Public configuration" : "Configure a partner using an existing event"}</h4>
    <p className="text-xs text-zinc-500 dark:text-zinc-400">This flow uses an existing HackerMate event. It does not create or edit an event. Review uncertain facts with the organizer before publishing.</p>
    <fieldset disabled={busy} className="space-y-4 min-w-0">
      <label className="block space-y-1 text-xs">Existing event<select name="hackathon_id" required value={eventId} onChange={e => setEventId(e.target.value)} className={partnerInput}>
        <option value="">Select an existing event</option>
        {partner?.hackathon_id && !event && <option value={partner.hackathon_id}>Unavailable event ({partner.hackathon_id})</option>}
        {events.map(value => <option key={value.id} value={value.id}>{value.name} ({value.id}){value.archived ? " — archived" : ""}</option>)}
      </select></label>
      {event ? <p className="text-xs text-zinc-500 dark:text-zinc-400 break-words">Stored event facts for review: {event.start_date || "start date not recorded"} / {event.end_date || "end date not recorded"}; {event.mode || "mode not recorded"}; {event.location || "venue not recorded"}; team limits {event.min_team_size ?? "unknown"}–{event.max_team_size ?? "unknown"}. These values are not edited here.</p>
        : <p className="text-xs text-zinc-500 dark:text-zinc-400" role="status">{eventId ? "The associated event is unavailable. Select an existing event before saving." : events.length ? "Select the event this partner page will represent." : "No existing events are available. The legacy lead flow below can create or match an event."}</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {field("Display name", "partner_name", partner?.partner_name, 200, true)}{field("Public slug", "slug", partner?.slug, 100, true)}
        <label className="space-y-1 text-xs">Portal version<select name="portal_version" defaultValue={partner?.portal_version || "legacy"} className={partnerInput}>
          <option value="legacy">Legacy presentation</option><option value="organizer-v1">Partner V1 public page and workspace</option></select></label>
        <label className="space-y-1 text-xs">Registration mode<select name="registration_mode" defaultValue={partner?.registration_mode || ""} className={partnerInput}>
          <option value="">Not specified</option><option value="external">External organizer registration</option><option value="native">Native HackerMate registration</option></select></label>
        {field("Public introduction (optional)", "tagline", partner?.tagline, 360)}{field("Accent hex color (optional)", "accent_color", partner?.accent_color, 7)}
        {field("Logo URL or local asset path (optional)", "logo_url", partner?.logo_url)}{field("Banner URL or local asset path (optional)", "banner_url", partner?.banner_url)}
        {field("Official website (optional)", "official_website", partner?.official_website)}{field("Public contact label (optional)", "contact_label", partner?.public_contact?.label, 80)}
        {field("Public contact URL (optional)", "contact_url", partner?.public_contact?.url)}
      </div>
      <details className="space-y-3 text-xs"><summary className="cursor-pointer focus-visible:outline-2">Approved public links ({links.length}/8)</summary>
        {links.map((link, index) => <div key={index} className="grid grid-cols-1 md:grid-cols-[1fr_2fr_auto] gap-2 items-end">
          <label>Link label<input name={`link_label_${index}`} maxLength={80} value={link.label} onChange={e => setLinks(value => value.map((item, i) => i === index ? { ...item, label: e.target.value } : item))} className={partnerInput} /></label>
          <label>Link URL<input name={`link_url_${index}`} maxLength={2048} value={link.url} onChange={e => setLinks(value => value.map((item, i) => i === index ? { ...item, url: e.target.value } : item))} className={partnerInput} /></label>
          <button type="button" className={partnerButton} onClick={() => setLinks(value => value.filter((_, i) => i !== index))}>Remove link</button>
        </div>)}
        <button type="button" disabled={links.length >= 8} className={partnerButton} onClick={() => setLinks(value => [...value, { label: "", url: "" }])}>Add public link</button>
      </details>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">Every value in this form is public. Never enter private organizer contact details or secrets.</p>
      {partner && <p className="text-xs text-zinc-500 dark:text-zinc-400">Changing the associated event does not transfer its organizer assignments. Review access separately for the selected event.</p>}
      <button type="submit" disabled={!event || busy} className={`${partnerButton} bg-[#B4F461] text-zinc-950 dark:text-zinc-950 border-transparent`}>{busy ? "Saving configuration…" : partner ? "Save public configuration" : "Create partner configuration"}</button>
    </fieldset>
    {error && <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{error} Reload configuration to review current values before retrying a conflicting save.</p>}
  </form>;
}
