"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useNotification } from "@/context/NotificationContext";

type Invite = {
  id: string;
  status: string;
  team_id: string;
  teams: {
    id: string;
    name: string;
    description: string;
    max_members: number;
  };
  profiles: {
    full_name: string;
  };
};

export default function InvitesPage() {
  const { showToast } = useNotification();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadInvites();
  }, []);

  async function loadInvites() {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("team_invites")
        .select(`
          *,
          teams (
            id,
            name,
            description,
            max_members
          ),
          profiles!team_invites_invited_by_fkey (
            full_name
          )
        `)
        .eq("invited_user_id", user.id)
        .eq("status", "pending");

      if (error) {
        console.error(error);
      } else {
        setInvites(data as Invite[] || []);
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }

  async function acceptInvite(invite: Invite) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { error } = await supabase.rpc("accept_team_invite", {
        p_invite_id: invite.id,
      });

      if (error) {
        showToast(error.message, "error");
        return;
      }

      showToast("Invite accepted!", "success");
      loadInvites();
    } catch (err) {
      console.error(err);
      showToast("Failed to accept invite.", "error");
    }
  }

  async function rejectInvite(inviteId: string) {
    try {
      const { error } = await supabase.rpc("reject_team_invite", {
        p_invite_id: inviteId,
      });

      if (error) {
        showToast(error.message, "error");
        return;
      }

      showToast("Invite rejected.", "info");
      loadInvites();
    } catch (err) {
      console.error(err);
      showToast("Failed to reject invite.", "error");
    }
  }

  if (loading) {
    return (
      <main className="max-w-5xl mx-auto px-6 pt-24 pb-12">
        <div className="flex flex-col items-center justify-center min-h-[50vh]">
          <div className="w-6 h-6 border-2 border-zinc-800 border-t-white rounded-full animate-spin mb-3" />
          <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider">Loading invites...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-5xl mx-auto px-6 pt-24 pb-12">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-white mb-1">
          Team Invites
        </h1>

        <p className="text-xs text-zinc-400">
          Accept or reject invitations from team owners.
        </p>
      </div>

      {invites.length === 0 ? (
        <div className="card card-static p-12 text-center animate-fade-in-up">
          <div className="w-10 h-10 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto mb-4 text-zinc-500">
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21.75 9v.906a2.25 2.25 0 01-1.183 1.981l-7.5 4.125a2.25 2.25 0 01-2.134 0l-7.5-4.125A2.25 2.25 0 012.25 9V6.75m19.5 2.25v8.25A2.25 2.25 0 0119.5 19.5h-15A2.25 2.25 0 012.25 17.25V9"
              />
            </svg>
          </div>

          <h2 className="text-sm font-semibold text-white mb-1.5">
            No invites yet
          </h2>

          <p className="text-xs text-zinc-500">
            When team owners invite you, they&apos;ll appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {invites.map((invite) => (
            <div
              key={invite.id}
              className="card card-static p-5 animate-fade-in-up"
            >
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-semibold text-white mb-1">
                    {invite.teams?.name}
                  </h2>

                  <p className="text-xs text-zinc-400 mb-3">
                    {invite.teams?.description ||
                      "No description provided."}
                  </p>

                  <div className="text-[10px] text-zinc-500">
                    Invited by{" "}
                    <span className="text-zinc-400 font-semibold">
                      {invite.profiles?.full_name}
                    </span>
                  </div>
                </div>

                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => acceptInvite(invite)}
                    className="btn btn-primary btn-sm"
                  >
                    Accept
                  </button>

                  <button
                    onClick={() => rejectInvite(invite.id)}
                    className="btn btn-secondary btn-sm"
                  >
                    Reject
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
