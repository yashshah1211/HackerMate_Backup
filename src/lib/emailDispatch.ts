/** Server-side provider boundary. No retries: an interrupted request may be accepted. */
export type EmailDispatch = {
  status: "not_dispatched" | "accepted" | "failed" | "unknown";
  attempted: boolean;
  intendedRecipientAccepted: boolean;
  sandbox: boolean;
  providerId?: string;
  providerStatus?: number;
  reason: string;
  retrySafe: false;
};

type EmailPayload = {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  reply_to?: string | string[];
  attachments?: { filename: string; content: string }[];
};

export async function dispatchEmail(payload: EmailPayload): Promise<EmailDispatch> {
  const base = { attempted: false, intendedRecipientAccepted: false, sandbox: false, retrySafe: false as const };
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key || !process.env.RESEND_FROM_EMAIL?.trim()) {
    console.log("[Email dispatch] Not dispatched: provider key or sender is unavailable. No delivery occurred.");
    return { ...base, status: "not_dispatched", reason: "Email provider configuration unavailable; no request sent." };
  }
  const sandbox = payload.from.toLowerCase().includes("onboarding@resend.dev");
  const recipient = process.env.RESEND_SANDBOX_RECIPIENT?.trim();
  if (sandbox && !recipient) {
    return { ...base, sandbox, status: "not_dispatched", reason: "Sandbox recipient unavailable; no request sent." };
  }
  // Sandbox acknowledgments consume provider quota, but never contact the intended audience.
  const request = sandbox ? { ...payload, to: recipient!, subject: `[Sandbox] ${payload.subject}` } : payload;
  const attempted = { ...base, attempted: true, sandbox };
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(request), signal: AbortSignal.timeout(15_000),
    });
    const result: unknown = await response.json().catch(() => null);
    const receipt = result && typeof result === "object" ? result as Record<string, unknown> : null;
    if (response.ok && typeof receipt?.id === "string" && receipt.id.trim() &&
        !receipt.error && !receipt.mock && !receipt.sandbox) {
      return { ...attempted, status: "accepted", providerId: receipt.id.trim(), providerStatus: response.status,
        intendedRecipientAccepted: !sandbox, reason: sandbox
          ? "Provider accepted a sandbox email; intended recipient contact is not confirmed."
          : "Provider accepted the email; delivery is not confirmed." };
    }
    // 5xx/408/409 and malformed responses are ambiguous; never infer safe retry.
    const rejected = response.status >= 400 && response.status < 500 && ![408, 409].includes(response.status);
    return { ...attempted, status: rejected ? "failed" : "unknown", providerStatus: response.status,
      reason: rejected ? "Email provider rejected the request." : "Provider acceptance is unknown. Check provider records before sending again." };
  } catch {
    return { ...attempted, status: "unknown", reason: "Provider response unavailable. Check provider records before sending again." };
  }
}

export function dispatchHttpStatus(dispatch: EmailDispatch) {
  return dispatch.status === "accepted" ? 200 : dispatch.status === "not_dispatched" ? 503 : 502;
}

export function dispatchResponse(dispatch: EmailDispatch) {
  return { success: dispatch.intendedRecipientAccepted, dispatch, message: dispatch.reason,
    ...(!dispatch.intendedRecipientAccepted ? { error: dispatch.reason } : {}) };
}

/** Bookkeeping exceptions must never turn an accepted message into an apparently unsent one. */
export async function recordEmailBookkeeping(
  write: () => PromiseLike<{ data?: unknown; error: unknown }>, requireRow = true,
): Promise<"recorded" | "failed"> {
  try {
    const { data, error } = await write();
    if (error || (requireRow && (!Array.isArray(data) || data.length !== 1))) {
      console.error("[Email dispatch] Acceptance bookkeeping failed; do not resend:", error);
      return "failed";
    }
    return "recorded";
  } catch (error) {
    console.error("[Email dispatch] Acceptance bookkeeping unavailable; do not resend:", error);
    return "failed";
  }
}
