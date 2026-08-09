export type SihNotification = {
  id: string;
  timestamp: string;
  type: "status_change" | "revision_request" | "shortlist" | "nomination" | "rejection";
  title: string;
  message: string;
  spocNotes?: string;
};

export function createSihNotification(
  status: string,
  stage: string,
  teamName: string,
  spocNotes?: string
): SihNotification {
  const timestamp = new Date().toISOString();
  const id = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  if (status === "revision_requested") {
    return {
      id,
      timestamp,
      type: "revision_request",
      title: "⚠️ Action Required: SPOC Requested Pitch Revision",
      message: `The DJSCE SPOC has reviewed Team ${teamName}'s submission and requested pitch slide revisions before final screening.`,
      spocNotes: spocNotes || "Please review feedback and re-upload your pitch PPT link.",
    };
  }

  if (stage === "shortlisted_round2" || status === "approved") {
    return {
      id,
      timestamp,
      type: "shortlist",
      title: "⭐ Shortlisted for Round 2 Jury Viva",
      message: `Congratulations Team ${teamName}! Your pitch passed Round 1 screening and has been shortlisted for the Round 2 Faculty Jury Viva.`,
      spocNotes: spocNotes || "Be prepared for a 5-minute presentation and Q&A session.",
    };
  }

  if (stage === "final_nominated" || status === "nominated") {
    return {
      id,
      timestamp,
      type: "nomination",
      title: "🏆 Official Nomination Winner",
      message: `Official Confirmation: Team ${teamName} has been selected as an official DJSCE nominee for SIH 2026!`,
      spocNotes: spocNotes || "Congratulations on reaching the national round nominations.",
    };
  }

  if (status === "rejected" || stage === "round1_rejected") {
    return {
      id,
      timestamp,
      type: "rejection",
      title: "🚨 Pitch Review Feedback",
      message: `Team ${teamName}'s pitch was evaluated in Round 1 screening.`,
      spocNotes: spocNotes || "Review jury scores and feedback to refine your project for future rounds.",
    };
  }

  return {
    id,
    timestamp,
    type: "status_change",
    title: "📋 Pitch Status Updated",
    message: `Team ${teamName}'s submission status has been updated.`,
    spocNotes,
  };
}
