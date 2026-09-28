"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AuthGuard from "@/components/AuthGuard";
import QuickOnboardingModal from "@/components/QuickOnboardingModal";
import PostAcceptanceTeamPrompt from "@/components/PostAcceptanceTeamPrompt";
import { PageLoader } from "@/components/system";
import { useShell } from "@/components/shell/ShellContext";
import { DashboardView } from "./DashboardView";
import { useDashboardData } from "./useDashboardData";

function DashboardContent() {
  const router = useRouter();
  const shell = useShell();
  const dash = useDashboardData();
  const [setupOpen, setSetupOpen] = useState(false);

  if (dash.data.redirecting) return <PageLoader label="Finishing setup" />;

  return (
    <>
      <DashboardView
        data={dash.data}
        unreadMessages={shell?.session.unreadMessages ?? 0}
        handlers={{
          onConfirmYear: dash.confirmYear,
          onYearChange: dash.setYearValue,
          onOpenProfileSetup: () => setSetupOpen(true),
          onAcceptInvite: dash.acceptInvite,
          onDeclineInvite: dash.declineInvite,
          onAcceptConnection: dash.acceptConnection,
          onDeclineConnection: dash.declineConnection,
          onOpenInbox: () => shell?.openInbox(),
        }}
      />

      <QuickOnboardingModal
        isOpen={setupOpen}
        onClose={() => setSetupOpen(false)}
        onSuccess={dash.reload}
        initialGithubUrl={dash.data.profile?.github_url ?? undefined}
      />

      {dash.prompt.user && (
        <PostAcceptanceTeamPrompt
          open={dash.prompt.open}
          onClose={dash.closePrompt}
          connectedUser={dash.prompt.user}
          teamsWithSlots={dash.prompt.teams}
          onCreateTeam={() => router.push(`/teams/create?invite=${dash.prompt.user?.id}`)}
          onInviteToTeam={dash.inviteFromPrompt}
        />
      )}
    </>
  );
}

export default function DashboardPage() {
  return (
    <AuthGuard>
      <DashboardContent />
    </AuthGuard>
  );
}
