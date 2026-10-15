export const WARNING_LIMIT = 2000;
export const WARNING_ACCEPTED = "Warning accepted by the email provider. Delivery is not confirmed.";

export async function sendModerationWarning(senderId: string | null | undefined, recipientId: string, message: string) {
  if (!senderId || !message.trim() || message.trim().length > WARNING_LIMIT) throw new Error(`Enter a warning of 1–${WARNING_LIMIT} characters.`);
  let response: Response;
  try {
    response = await fetch("/api/send-email", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senderId, recipientId, type: "moderation_warning", warningMessage: message.trim() }) });
  } catch {
    throw new Error("Warning outcome is unknown. Check provider records before sending again.");
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.success !== true || data.status !== "accepted" || data.mock || data.sandbox) {
    throw new Error(data?.error || "Warning acceptance was not confirmed. Check provider records before sending again.");
  }
}
