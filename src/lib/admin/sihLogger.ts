type LogLevel = "info" | "warn" | "error";

interface SihLogPayload {
  event:
    | "SIH_SUBMIT"
    | "SIH_EVALUATE"
    | "SIH_URL_VALIDATE"
    | "SIH_ERROR"
    | "SIH_FALLBACK"
    | "SIH_RETRY"
    | "SIH_STALE_CHECK"
    | "SPOC_UPDATE";
  submissionId?: string | null;
  teamId?: string | null;
  userId?: string | null;
  durationMs?: number;
  message: string;
  details?: Record<string, any>;
}

export function logSihEvent(level: LogLevel, payload: SihLogPayload) {
  const timestamp = new Date().toISOString();

  const safeDetails = payload.details ? { ...payload.details } : {};
  if (safeDetails.pptUrl) safeDetails.pptUrl = "[REDACTED_URL]";
  if (safeDetails.githubUrl) safeDetails.githubUrl = "[REDACTED_URL]";
  if (safeDetails.demoUrl) safeDetails.demoUrl = "[REDACTED_URL]";
  if (safeDetails.authorization) safeDetails.authorization = "[REDACTED_TOKEN]";

  const logLine = JSON.stringify({
    timestamp,
    level,
    event: payload.event,
    submissionId: payload.submissionId || null,
    teamId: payload.teamId || null,
    userId: payload.userId || null,
    durationMs: payload.durationMs ?? null,
    message: payload.message,
    details: safeDetails,
  });

  if (level === "error") {
    console.error(`[SIH_AUDIT_LOG] ${logLine}`);
  } else if (level === "warn") {
    console.warn(`[SIH_AUDIT_LOG] ${logLine}`);
  } else {
    console.log(`[SIH_AUDIT_LOG] ${logLine}`);
  }
}
