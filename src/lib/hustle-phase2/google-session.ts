import "server-only";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";

/** Called ONLY with the session returned by the server's PKCE exchange.
 * Account metadata/linked identities alone cannot prove the session's provider.
 * No route accepts a client-supplied provider token or session attestation.
 */
export async function attestGoogleSession(session: Session, auth: SupabaseClient): Promise<boolean> {
  try {
    if (!session.provider_token || session.user.is_anonymous !== false || !session.user.email_confirmed_at) return false;
    const identity = session.user.identities?.filter(i => i.provider === "google");
    if (identity?.length !== 1 || typeof identity[0].identity_data?.sub !== "string") return false;
    const { data, error } = await auth.auth.getClaims(session.access_token);
    const claims = data?.claims;
    if (error || claims?.sub !== session.user.id || claims?.role !== "authenticated"
      || typeof claims.session_id !== "string"
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(claims.session_id)) return false;
    // Fixed HTTPS destination, credential only in the header, never URL/log/storage.
    // A GitHub provider token fails here even on an account also linked to Google.
    const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${session.provider_token}` },
      cache: "no-store", redirect: "error", credentials: "omit", signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return false;
    const text = await response.text();
    if (text.length > 8192) return false;
    const google: unknown = JSON.parse(text);
    if (!google || typeof google !== "object") return false;
    const info = google as Record<string, unknown>;
    if (info.sub !== identity[0].identity_data.sub || info.email_verified !== true
      || typeof info.email !== "string" || !session.user.email
      || info.email.trim().toLowerCase() !== session.user.email.trim().toLowerCase()) return false;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return false;
    const service = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const result = await service.rpc("hustle_phase2_attest_google_session", {
      p_user: session.user.id, p_session: claims.session_id,
    });
    if (result.error) {
      console.error("[hustle-phase2] Google session attestation failed", { code: result.error.code });
      return false;
    }
    return result.data === true;
  } catch {
    // Do not log exceptions which might contain provider/session credentials.
    console.error("[hustle-phase2] Google session verification unavailable");
    return false;
  }
}
