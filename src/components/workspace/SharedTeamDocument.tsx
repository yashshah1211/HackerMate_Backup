"use client";

import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { AlertTriangle, Save } from "lucide-react";
import { supabase, subscribeWithRetry } from "@/lib/supabase";
import { documentGateway, TeamDocumentEditor, type TeamDocument } from "@/lib/teamDocument";
import { Button, FieldLabel, Panel, Segmented, Spinner, Textarea } from "@/components/system";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/time";

type Props = {
  teamId: string;
  canEdit: boolean;
  renderMarkdown: (text: string) => ReactNode;
  onDocument?: (document: TeamDocument) => void;
};

export default function SharedTeamDocument({ teamId, canEdit, renderMarkdown, onDocument }: Props) {
  const editor = useMemo(() => new TeamDocumentEditor(documentGateway(supabase, teamId), teamId), [teamId]);
  const state = useSyncExternalStore(editor.subscribe, editor.getSnapshot, editor.getSnapshot);
  const [pane, setPane] = useState<"write" | "preview">("write");
  const dirty = !!state.base && state.draft !== state.base.content;

  useEffect(() => {
    if (canEdit && state.latest) onDocument?.(state.latest);
  }, [canEdit, state.latest, onDocument]);

  useEffect(() => {
    if (!canEdit) { editor.dispose(); return; }
    let active = true;
    editor.activate();
    void editor.load();
    const channel = supabase.channel(`team_document_editor:${teamId}`).on("postgres_changes", {
      event: "*", schema: "public", table: "team_documents", filter: `team_id=eq.${teamId}`,
    }, payload => {
      if (!active) return;
      if (payload.eventType === "DELETE") void editor.load();
      else editor.receive(payload.new);
    });
    const unsubscribe = subscribeWithRetry(channel, status => {
      if (active && status === "SUBSCRIBED") void editor.load(); // close load/subscribe gaps and reconnect gaps
    });
    return () => { active = false; editor.dispose(); unsubscribe(); };
  }, [editor, teamId, canEdit]);

  useEffect(() => {
    if (!dirty && !state.saving) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, state.saving]);

  if (!canEdit) return <Panel className="p-4 text-[13px] text-ink-3">The shared document is for team members.</Panel>;
  if (state.loading) return <Panel className="flex h-40 items-center justify-center"><Spinner label="Loading the shared doc" /></Panel>;
  const conflict = state.conflict;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[12px] text-ink-3" role="status">
          {state.saving ? "Saving submitted version…" : dirty ? "Unsaved edits" : state.base ? `Saved revision ${state.base.revision}` : "Document unavailable"}
          {state.base && <span className="ml-2 hidden sm:inline">{relativeTime(state.base.updated_at, { suffix: true })}</span>}
        </span>
        <Button variant="primary" size="sm" icon={<Save />} loading={state.saving}
          disabled={!state.base || state.saving || !!conflict || !dirty} onClick={() => void editor.save()}>Save doc</Button>
      </div>
      {state.error && <div role="alert" className="rounded-lg bg-warn-soft p-3 text-[13px] text-ink">
        <p>{state.error}</p>
        <Button size="sm" variant="secondary" className="mt-2" disabled={state.saving} onClick={() => void editor.load()}>Retry loading latest</Button>
      </div>}
      {state.notice && <p role="status" className="text-[13px] text-ink-3">{state.notice}</p>}
      {conflict && <div role="alert" className="space-y-3 rounded-lg bg-warn-soft px-4 py-3 ring-1 ring-inset ring-warn/30">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
          <div>
            <p className="text-[13px] font-semibold text-ink">The saved document changed while you were editing</p>
            <p className="mt-0.5 text-[12.5px] text-ink-3">Compare saved revision {conflict.revision} below with your edits in Write. Keep mine replaces only this reviewed revision; another save will require a new review. Load theirs keeps a recovery copy of your edits.</p>
          </div>
        </div>
        <FieldLabel htmlFor="ws-doc-theirs">Saved version · revision {conflict.revision}</FieldLabel>
        <Textarea id="ws-doc-theirs" readOnly value={conflict.content} className="max-h-64 min-h-32 font-mono text-[13px]" />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" disabled={state.saving} onClick={() => editor.loadTheirs(conflict)}>Load theirs</Button>
          <Button size="sm" variant="inverse" disabled={state.saving} onClick={() => void editor.save(conflict)}>Keep mine</Button>
        </div>
      </div>}
      <Segmented<"write" | "preview"> label="Doc view" size="sm" className="md:hidden" value={pane} onChange={setPane}
        options={[{ value: "write", label: "Write" }, { value: "preview", label: "Preview" }]} />
      <div className="grid gap-4 md:grid-cols-2">
        <div className={cn("min-w-0", pane !== "write" && "hidden md:block")}>
          <FieldLabel htmlFor="ws-doc" hint="Markdown">Write</FieldLabel>
          <Textarea id="ws-doc" value={state.draft} disabled={!state.base} onChange={e => editor.edit(e.target.value)}
            className="h-[52dvh] min-h-[280px] resize-none font-mono text-[13px] md:h-[420px]"
            placeholder={"# Our idea\n- Problem we're solving\n- Who it's for\n- **Must-have** features"} />
        </div>
        <div className={cn("min-w-0", pane !== "preview" && "hidden md:block")}>
          <p className="mb-1.5 caps-label text-ink-3">Preview</p>
          <div className="h-[52dvh] min-h-[280px] overflow-y-auto rounded-md bg-raised p-4 ring-1 ring-inset ring-line md:h-[420px]">
            {renderMarkdown(state.draft) || <p className="text-[13px] text-ink-3">Nothing written yet.</p>}
          </div>
        </div>
      </div>
      {state.recovery !== null && <details className="rounded-lg bg-raised p-3 ring-1 ring-line">
        <summary className="cursor-pointer text-[13px] font-semibold">Recover previous local edits</summary>
        <p className="my-2 text-[12px] text-ink-3">Copy this text before leaving the workspace. This recovery copy lasts while this workspace stays open.</p>
        <Textarea aria-label="Previous local edits" readOnly value={state.recovery} className="min-h-32 font-mono text-[13px]" />
        <Button size="sm" variant="secondary" className="mt-2" disabled={state.saving} onClick={() => editor.restoreRecovery()}>Restore to editor</Button>
      </details>}
    </div>
  );
}
