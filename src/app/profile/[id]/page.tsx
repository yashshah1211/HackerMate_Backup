"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Check, UserRound } from "lucide-react";
import CertificateModal, { type UserBadge } from "@/components/CertificateModal";
import ShareModal from "@/components/ShareModal";
import ConnectPitchModal from "@/components/ConnectPitchModal";
import PostAcceptanceTeamPrompt from "@/components/PostAcceptanceTeamPrompt";
import { Button, ButtonLink, Dialog, EmptyState, ErrorNotice, FieldLabel, Page, PageLoader, Select, TeamMark, Textarea } from "@/components/system";
import { useNotification } from "@/context/NotificationContext";
import { cn } from "@/lib/utils";
import { ProfileView } from "./ProfileView";
import { useProfileData } from "./useProfileData";

const REPORT_REASONS = [
  { value: "Spam", label: "Spam or scams" },
  { value: "Harassment", label: "Harassment or abuse" },
  { value: "Inappropriate Content", label: "Inappropriate profile content" },
  { value: "Off-topic", label: "Off-topic link sharing" },
  { value: "Other", label: "Other" },
];

export default function ProfilePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { showToast } = useNotification();
  const p = useProfileData(id);

  const [pitchOpen, setPitchOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteTeam, setInviteTeam] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("Spam");
  const [reportDetails, setReportDetails] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [certBadge, setCertBadge] = useState<UserBadge | null>(null);
  const [shareBadge, setShareBadge] = useState<UserBadge | null>(null);
  const [promptOpen, setPromptOpen] = useState(false);
  const autoConnectHandled = useRef(false);

  // `?connect=1` (from dashboard/discovery "Connect") opens the pitch once.
  useEffect(() => {
    if (p.loading || autoConnectHandled.current) return;
    const wants = new URLSearchParams(window.location.search).get("connect") === "1";
    if (!wants) return;
    autoConnectHandled.current = true;
    router.replace(`/profile/${id}`, { scroll: false });
    if (p.viewerId && !p.isOwnProfile && !p.isBlockedByMe && p.connectionState === "not_connected") {
      Promise.resolve().then(() => setPitchOpen(true));
    }
  }, [id, p.connectionState, p.isBlockedByMe, p.isOwnProfile, p.loading, p.viewerId, router]);

  if (p.loading) return <PageLoader label="Loading profile" />;

  if (!p.profile) {
    return (
      <Page width="narrow" className="pt-10">
        {p.loadError ? (
          <ErrorNotice title="Couldn't load this profile" detail={p.loadError} onRetry={p.reload} />
        ) : (
          <EmptyState
            icon={<UserRound />}
            title="Profile not found"
            body="This builder doesn't exist or has deleted their account."
            action={
              <ButtonLink href="/developers" size="sm" variant="secondary">
                Browse builders
              </ButtonLink>
            }
          />
        )}
      </Page>
    );
  }

  if (p.hasBlockedMe) {
    return (
      <Page width="narrow" className="pt-10">
        <EmptyState
          icon={<UserRound />}
          title="This profile isn't available"
          body="Find other builders to team up with."
          action={
            <ButtonLink href="/developers" size="sm" variant="secondary">
              Back to builders
            </ButtonLink>
          }
        />
      </Page>
    );
  }

  const profile = p.profile;
  const invitable = p.ownedTeams.filter((t) => !t.max_members || t.memberCount < t.max_members);
  const selectedInvite = inviteTeam || (invitable.length === 1 ? invitable[0].id : "");

  return (
    <>
      <ProfileView
        profile={profile}
        viewerId={p.viewerId}
        isOwnProfile={p.isOwnProfile}
        connectionState={p.connectionState}
        isBlockedByMe={p.isBlockedByMe}
        badges={p.badges}
        trackRecord={p.trackRecord}
        trackRecordLoading={p.trackRecordLoading}
        stats={p.stats}
        canInvite={p.ownedTeams.length > 0}
        alreadyInvited={p.alreadyInvited}
        busy={p.busy}
        actions={{
          onConnect: () => setPitchOpen(true),
          onAccept: async () => {
            const ok = await p.acceptConnection();
            if (ok) setPromptOpen(true);
          },
          onRemove: (msg) => p.removeConnection(msg),
          onToggleBlock: p.toggleBlock,
          onReport: () => setReportOpen(true),
          onInvite: () => setInviteOpen(true),
          onSyncGithub: p.syncGithub,
          onDelete: () => setDeleteOpen(true),
          onViewCertificate: setCertBadge,
          onShareBadge: setShareBadge,
          onCopyLink: async () => {
            const url = `${window.location.origin}/profile/${profile.id}`;
            try {
              await navigator.clipboard.writeText(url);
              showToast("Profile link copied", "success");
            } catch {
              showToast(url, "info");
            }
          },
        }}
      />

      <ConnectPitchModal
        isOpen={pitchOpen}
        onClose={() => setPitchOpen(false)}
        onSend={async (note) => {
          await p.sendConnectionRequest(note);
          setPitchOpen(false);
        }}
        targetProfile={{ id: profile.id, full_name: profile.full_name, avatar_url: profile.avatar_url, college: profile.college, skills: profile.skills }}
        loading={p.busy === "connect"}
      />

      <Dialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        size="sm"
        title={`Invite ${profile.full_name.split(" ")[0]} to a team`}
        description={invitable.length ? "They'll get a notification and can accept from their home screen." : "All of your teams are full."}
        footer={
          <>
            <Button variant="ghost" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={p.busy === "invite"}
              disabled={!selectedInvite}
              onClick={async () => {
                const ok = await p.sendInvite(selectedInvite);
                if (ok) {
                  setInviteOpen(false);
                  setInviteTeam("");
                }
              }}
            >
              Send invite
            </Button>
          </>
        }
      >
        <div role="radiogroup" aria-label="Your teams" className="space-y-1.5">
          {invitable.map((t) => {
            const active = selectedInvite === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setInviteTeam(t.id)}
                className={cn("flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left ring-1 ring-inset", active ? "bg-selected ring-ink-4" : "ring-line hover:bg-hover")}
              >
                <TeamMark name={t.name} size="sm" />
                <span className="flex-1 truncate text-[13.5px] font-medium text-ink">{t.name}</span>
                <span className="font-mono text-[11px] text-ink-4">
                  {t.memberCount}/{t.max_members ?? "—"}
                </span>
                {active && <Check className="size-4" aria-hidden />}
              </button>
            );
          })}
        </div>
      </Dialog>

      <Dialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        title={`Report ${profile.full_name.split(" ")[0]}`}
        description="Reports are anonymous. Our safety team reviews every one."
        footer={
          <>
            <Button variant="ghost" onClick={() => setReportOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="inverse"
              loading={p.busy === "report"}
              onClick={async () => {
                const ok = await p.submitReport(reportReason, reportDetails);
                if (ok) {
                  setReportOpen(false);
                  setReportDetails("");
                  setReportReason("Spam");
                }
              }}
            >
              Submit report
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <FieldLabel htmlFor="report-reason">Reason</FieldLabel>
            <Select id="report-reason" value={reportReason} onChange={(e) => setReportReason(e.target.value)}>
              {REPORT_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <FieldLabel htmlFor="report-details" hint="optional">
              Details
            </FieldLabel>
            <Textarea id="report-details" rows={4} value={reportDetails} onChange={(e) => setReportDetails(e.target.value)} placeholder="What happened?" />
          </div>
        </div>
      </Dialog>

      <Dialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        size="sm"
        title="Delete your account?"
        description="This permanently deletes your profile, DMs and files, and disbands any team where you're the only member. It can't be undone."
        footer={
          <>
            <Button variant="ghost" disabled={p.busy === "delete"} onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={p.busy === "delete"} onClick={p.deleteAccount}>
              Delete permanently
            </Button>
          </>
        }
      />

      <CertificateModal isOpen={!!certBadge} onClose={() => setCertBadge(null)} badge={certBadge} recipientName={profile.full_name} />

      <ShareModal
        isOpen={!!shareBadge}
        onClose={() => setShareBadge(null)}
        title={`Flex Achievement — ${shareBadge?.badge_name || ""}`}
        subtitle="Showcase your verified achievement on LinkedIn, X, WhatsApp, or Telegram"
        shareUrl={typeof window !== "undefined" ? window.location.href : `https://hackermate.in/profile/${profile.id}`}
        shareText={`🏆 Proud to share my verified achievement '${shareBadge?.badge_name}' (${shareBadge?.rank_title || "Verified Winner"}) verified by ${shareBadge?.issuer_name || "HackerMate Partner Network"}! Check out my profile & certificate:`}
        type="badge"
        metadata={{
          badgeTitle: shareBadge?.badge_name,
          rankTitle: shareBadge?.rank_title || "Verified Winner",
          issuerName: shareBadge?.issuer_name || "HackerMate Partner Network",
        }}
      />

      {!p.isOwnProfile && (
        <PostAcceptanceTeamPrompt
          open={promptOpen}
          onClose={() => setPromptOpen(false)}
          connectedUser={{ id: profile.id, full_name: profile.full_name, avatar_url: profile.avatar_url, college: profile.college }}
          teamsWithSlots={p.ownedTeams
            .filter((t) => (t.max_members ?? 4) - t.memberCount > 0)
            .map((t) => ({ id: t.id, name: t.name, openSlots: (t.max_members ?? 4) - t.memberCount }))}
          onCreateTeam={() => router.push(`/teams/create?invite=${profile.id}`)}
          onInviteToTeam={async (teamId) => {
            const ok = await p.inviteFromPrompt(teamId);
            if (ok) setPromptOpen(false);
          }}
        />
      )}
    </>
  );
}
