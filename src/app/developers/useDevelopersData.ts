"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useNotification } from "@/context/NotificationContext";
import { SAFE_PROFILE_COLUMNS } from "@/lib/profileColumns";

export type Builder = {
  id: string;
  full_name: string | null;
  college: string | null;
  year_of_study?: string | null;
  bio: string | null;
  avatar_url: string | null;
  skills: string[] | null;
  is_available?: boolean | null;
  has_participated_hackathon?: boolean | null;
  hackathon_participations?: number | null;
  has_won_hackathon?: boolean | null;
  hackathon_wins?: number | null;
  last_seen_at?: string | null;
  created_at?: string | null;
};

export type Recommendation = { compatibility: number; reasons: string[]; confidence?: number; matchEngine?: "v3" | "v2" };
export type Relationship = "connected" | "request_sent" | "request_received";
export type OwnedTeam = { id: string; name: string; owner_id: string };

const PROFILE_COLUMNS = `${SAFE_PROFILE_COLUMNS}, year_of_study`;

/**
 * /developers data. Same reads as V1 (viewer profile, owned teams, both-way
 * blocklists, matchmaking RPC, profiles scan ≤1000 with server search) plus
 * a read of friend_requests so each row can show the relationship state.
 * `year_of_study` is now selected (it is a granted column) so the year
 * filter actually works.
 */
export function useDevelopersData(search: string, sort: "fit" | "active" | "new") {
  const { showToast } = useNotification();
  const [builders, setBuilders] = useState<Builder[]>([]);
  const [viewer, setViewer] = useState<Builder | null>(null);
  const [ownedTeams, setOwnedTeams] = useState<OwnedTeam[]>([]);
  const [recs, setRecs] = useState<Record<string, Recommendation>>({});
  const [relationships, setRelationships] = useState<Record<string, Relationship>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const firstLoad = useRef(true);
  const blockedRef = useRef<Set<string>>(new Set());

  const load = useCallback(async (term: string, sortOrder: "fit" | "active" | "new") => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const blocked = new Set<string>();

      if (user && firstLoad.current) {
        const fetchMatch = async () => {
          const res = await supabase.rpc("get_recommended_teammates_v3", { p_user_id: user.id, p_limit: 100 });
          if (res.error && (res.error.code === "PGRST202" || res.error.code === "42883" || res.error.message?.includes("Could not find the function") || res.error.message?.includes("function get_recommended_teammates_v3 does not exist"))) {
            console.info("[matchmaking] V3 unavailable; using V2 compatibility fallback");
            const v2Res = await supabase.rpc("get_recommended_teammates", { p_user_id: user.id, p_limit: 100 });
            return { data: v2Res.data, error: v2Res.error, matchEngine: "v2" as const };
          }
          return { data: res.data, error: res.error, matchEngine: "v3" as const };
        };

        const [profileRes, teamsRes, myBlocks, theirBlocks, recRes, frRes] = await Promise.all([
          supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", user.id).single(),
          supabase.from("teams").select("id, name, owner_id").eq("owner_id", user.id),
          supabase.from("blocked_users").select("blocked_id").eq("blocker_id", user.id),
          supabase.from("blocked_users").select("blocker_id").eq("blocked_id", user.id),
          fetchMatch(),
          supabase.from("friend_requests").select("sender_id, receiver_id, status").or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`),
        ]);
        if (profileRes.error) console.error("[developers] viewer profile failed:", profileRes.error);
        if (teamsRes.error) console.error("[developers] owned teams failed:", teamsRes.error);
        if (myBlocks.error) console.error("[developers] blocklist (mine) failed:", myBlocks.error);
        if (theirBlocks.error) console.error("[developers] blocklist (theirs) failed:", theirBlocks.error);
        if (recRes.error) console.error("[developers] get_recommended_teammates failed:", recRes.error);
        if (frRes.error) console.error("[developers] friend_requests failed:", frRes.error);

        setViewer((profileRes.data as Builder | null) ?? null);
        setOwnedTeams((teamsRes.data as OwnedTeam[] | null) || []);
        (myBlocks.data || []).forEach((b) => blocked.add(b.blocked_id));
        (theirBlocks.data || []).forEach((b) => blocked.add(b.blocker_id));
        const map: Record<string, Recommendation> = {};
        ((recRes.data as { id: string; compatibility: number; reasons: string[]; confidence?: number }[] | null) || []).forEach((r) => {
          map[r.id] = { compatibility: r.compatibility, reasons: r.reasons, confidence: r.confidence, matchEngine: recRes.matchEngine };
        });
        setRecs(map);
        const rel: Record<string, Relationship> = {};
        (frRes.data || []).forEach((r) => {
          const other = r.sender_id === user.id ? r.receiver_id : r.sender_id;
          if (r.status === "accepted") rel[other] = "connected";
          else if (r.status === "pending") rel[other] = r.sender_id === user.id ? "request_sent" : "request_received";
        });
        setRelationships(rel);
        blockedRef.current = blocked;
      }

      let q = supabase.from("profiles").select(PROFILE_COLUMNS);
      if (sortOrder === "active") {
        q = q.order("last_seen_at", { ascending: false, nullsFirst: false });
      } else {
        q = q.order("created_at", { ascending: false });
      }

      const t = term.trim();
      if (t) q = q.or(`full_name.ilike.%${t}%,college.ilike.%${t}%,skills.cs.{${t}}`);
      const primary = await q.limit(1000);
      let data = primary.data;
      const qErr = primary.error;
      if (qErr) {
        console.warn("[developers] primary query failed, retrying:", qErr);
        let fb = supabase.from("profiles").select(PROFILE_COLUMNS);
        if (sortOrder === "active") {
          fb = fb.order("last_seen_at", { ascending: false, nullsFirst: false });
        } else {
          fb = fb.order("created_at", { ascending: false });
        }
        if (t) fb = fb.or(`full_name.ilike.%${t}%,college.ilike.%${t}%,skills.cs.{${t}}`);
        const retry = await fb.limit(1000);
        data = retry.data;
        if (retry.error) {
          console.error("[developers] builder list failed:", retry.error);
          setError(retry.error.message);
        }
      } else {
        setError(null);
      }

      if (data) {
        const skip = blockedRef.current;
        setBuilders((data as Builder[]).filter((d) => d.id !== user?.id && !skip.has(d.id)));
      }
    } catch (err) {
      console.error("[developers] load failed:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      firstLoad.current = false;
      setLoading(false);
    }
  }, []);

  // Debounced server search (300ms) and sort changes.
  useEffect(() => {
    const h = setTimeout(() => load(search, sort), 300);
    return () => clearTimeout(h);
  }, [search, sort, load]);

  /** V1 invite flow: membership check → pending-invite check → send_team_invite RPC. */
  const sendInvite = useCallback(
    async (teamId: string, builderId: string): Promise<boolean> => {
      setInviteBusy(true);
      try {
        const { data: existingMember, error: mErr } = await supabase
          .from("team_members")
          .select("id")
          .eq("team_id", teamId)
          .eq("user_id", builderId)
          .maybeSingle();
        if (mErr) console.error("[developers] membership check failed:", mErr);
        if (existingMember) {
          showToast("This builder is already a member of that team.", "warning");
          return false;
        }
        const { data: existingInvite, error: iErr } = await supabase
          .from("team_invites")
          .select("id")
          .eq("team_id", teamId)
          .eq("invited_user_id", builderId)
          .eq("status", "pending")
          .maybeSingle();
        if (iErr) console.error("[developers] pending invite check failed:", iErr);
        if (existingInvite) {
          showToast("An invite has already been sent to this builder.", "warning");
          return false;
        }
        const { error } = await supabase.rpc("send_team_invite", { p_team_id: teamId, p_invited_user_id: builderId });
        if (error) {
          showToast(error.message, "error");
          return false;
        }
        showToast("Invite sent successfully!", "success");
        return true;
      } catch (err) {
        console.error(err);
        showToast("Failed to send invite.", "error");
        return false;
      } finally {
        setInviteBusy(false);
      }
    },
    [showToast],
  );

  return { builders, viewer, ownedTeams, recs, relationships, loading, error, inviteBusy, sendInvite, retry: () => load(search, sort) };
}


