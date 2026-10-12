import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

export type TeamDocument = Database["public"]["Tables"]["team_documents"]["Row"];
export const DOCUMENT_COLUMNS = "id,team_id,content,revision,updated_at,updated_by";
export type SaveResult = { status: "saved" | "conflict"; document: TeamDocument } | { status: "missing" };
export interface DocumentGateway {
  load(): Promise<TeamDocument>;
  save(document: TeamDocument, content: string): Promise<SaveResult>;
}

export function parseDocument(raw: unknown, teamId: string): TeamDocument {
  const row = raw as Partial<TeamDocument> | null;
  if (!row || typeof row.id !== "string" || row.team_id !== teamId ||
      typeof row.content !== "string" || !Number.isSafeInteger(row.revision) || row.revision! < 1 ||
      typeof row.updated_at !== "string" || !(row.updated_by === null || typeof row.updated_by === "string")) {
    throw new Error("Invalid document response. Your edits are retained; reload after the workspace update is available.");
  }
  return { id: row.id, team_id: row.team_id, content: row.content, revision: row.revision!,
    updated_at: row.updated_at, updated_by: row.updated_by };
}

export function documentGateway(client: SupabaseClient<Database>, teamId: string): DocumentGateway {
  const read = () => client.from("team_documents").select(DOCUMENT_COLUMNS).eq("team_id", teamId).maybeSingle();
  return {
    async load() {
      const result = await read();
      if (result.error) throw result.error;
      if (result.data) return parseDocument(result.data, teamId);
      // Never upsert: two initial readers may race, but the unique team_id wins.
      const inserted = await client.from("team_documents")
        .insert({ team_id: teamId, content: "# Brainstorm\nStart sharing ideas here..." })
        .select(DOCUMENT_COLUMNS).single();
      if (inserted.error) {
        console.error("Creating team document:", inserted.error);
        if (inserted.error.code !== "23505") throw inserted.error;
        const winner = await read();
        if (winner.error) throw winner.error;
        return parseDocument(winner.data, teamId);
      }
      return parseDocument(inserted.data, teamId);
    },
    async save(document, content) {
      const { data, error } = await client.rpc("save_team_document", {
        p_team_id: teamId, p_document_id: document.id,
        p_expected_revision: document.revision, p_content: content,
      });
      if (error) throw error;
      const result = data as { status?: string; document?: unknown } | null;
      if (result?.status === "missing") return { status: "missing" };
      if (result?.status !== "saved" && result?.status !== "conflict") throw new Error("Save was not confirmed. Your edits are retained; try again.");
      const row = parseDocument(result.document, teamId);
      if (row.id !== document.id || (result.status === "saved" &&
          (row.revision !== document.revision + 1 || row.content !== content))) {
        throw new Error("Save was not confirmed. Your edits are retained; try again.");
      }
      return { status: result.status, document: row };
    },
  };
}

function errorMessage(error: unknown) {
  const code = (error as { code?: string })?.code;
  if (code === "42501" || code === "PGRST301") return "You no longer have permission to save this document. Copy your edits before leaving.";
  if (["PGRST202", "42703", "42883"].includes(code || "")) return "Document saving is awaiting the workspace update. Your edits are retained.";
  return "Could not confirm the request. Your edits are retained. Check your connection and retry.";
}

export type DocumentState = {
  base: TeamDocument | null;
  latest: TeamDocument | null;
  draft: string;
  conflict: TeamDocument | null;
  recovery: string | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  notice: string | null;
};

// A per-mounted-workspace store. Async operations capture an epoch; cleanup
// invalidates it so responses cannot mutate a later workspace or remount.
export class TeamDocumentEditor {
  private state: DocumentState = { base: null, latest: null, draft: "", conflict: null,
    recovery: null, loading: true, saving: false, error: null, notice: null };
  private listeners = new Set<() => void>();
  private epoch = 0;
  private loadSequence = 0;
  constructor(private gateway: DocumentGateway, private teamId: string) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private set(patch: Partial<DocumentState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach(listener => listener());
  }
  dispose() { this.epoch++; this.loadSequence++; }
  edit(draft: string) { this.set({ draft, notice: null }); }
  receive(raw: unknown) {
    let row: TeamDocument;
    try { row = parseDocument(raw, this.teamId); }
    catch (error) { console.error("Team document notification:", error); return; }
    const { base, latest, draft, saving } = this.state;
    // A different document ID means deletion/recreation, not an ordered revision.
    if (latest && row.id !== latest.id) {
      this.set({ error: "This document was replaced. Copy your edits before reloading." });
      return;
    }
    if (latest && row.revision <= latest.revision) return;
    if (base && (saving || draft !== base.content)) {
      this.set({ latest: row, conflict: row, notice: null });
    } else {
      this.set({ base: row, latest: row, draft: row.content, conflict: null });
    }
  }
  async load() {
    const epoch = this.epoch, sequence = ++this.loadSequence;
    this.set({ loading: !this.state.base, error: null });
    try {
      const row = await this.gateway.load();
      if (epoch !== this.epoch || sequence !== this.loadSequence) return;
      this.receive(row);
    } catch (error) {
      console.error("Loading team document:", error);
      if (epoch === this.epoch && sequence === this.loadSequence) this.set({ error: errorMessage(error) });
    } finally {
      if (epoch === this.epoch && sequence === this.loadSequence) this.set({ loading: false });
    }
  }
  loadTheirs(reviewed: TeamDocument) {
    if (this.state.saving || this.state.conflict !== reviewed) return;
    this.set({ recovery: this.state.draft, base: reviewed, draft: reviewed.content,
      conflict: null, error: null, notice: "Loaded the reviewed version. Your previous edits are kept below." });
  }
  restoreRecovery() {
    if (this.state.recovery === null || this.state.saving) return;
    const recovery = this.state.draft;
    this.set({ draft: this.state.recovery, recovery, notice: null });
  }
  async save(reviewed?: TeamDocument) {
    const { base, conflict, draft, saving } = this.state;
    if (!base || saving || (conflict && reviewed !== conflict) || (reviewed && reviewed !== conflict)) return;
    const expected = reviewed || base;
    const epoch = this.epoch;
    this.set({ saving: true, error: null, notice: null }); // synchronous double-click guard
    try {
      const result = await this.gateway.save(expected, draft);
      if (epoch !== this.epoch) return;
      if (result.status === "missing") {
        this.set({ error: "The saved document is no longer available. Copy your edits before reloading." });
      } else if (result.status === "conflict") {
        this.receive(result.document);
        // A duplicate notification may already have established this conflict.
        this.set({ conflict: this.state.latest, notice: "The saved version changed. Review it before choosing Keep mine." });
      } else {
        const row = result.document;
        const latest = this.state.latest && this.state.latest.revision > row.revision ? this.state.latest : row;
        const typedDuringSave = this.state.draft !== draft;
        // A newer remote revision may have arrived before this save response.
        // Never rewind it or lose text typed while the request was in flight.
        this.set({ base: row, latest, conflict: latest.revision > row.revision ? latest : null,
          notice: typedDuringSave ? "Saved the submitted version. You still have unsaved edits." :
            latest.revision > row.revision ? "Your save completed; a newer version needs review." : "Document saved." });
      }
    } catch (error) {
      console.error("Saving team document:", error);
      if (epoch === this.epoch) this.set({ error: errorMessage(error) });
    } finally {
      if (epoch === this.epoch) this.set({ saving: false });
    }
  }
}
