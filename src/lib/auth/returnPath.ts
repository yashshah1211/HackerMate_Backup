export const AUTH_RETURN_FALLBACK = "/dashboard";

const VALIDATION_ORIGIN = "https://auth-return.invalid";
const UNSAFE_LITERAL = /[\\\u0000-\u0020\u007f-\u009f]/;
const NON_RETURN_ROUTE = /^\/(?:login|onboarding|auth|api|_next)(?:\/|$)/i;
const ENCODED_CONTROL = /%(?:0[0-9a-f]|1[0-9a-f]|7f|c2%[89][0-9a-f])/i;

/**
 * Accept application-root-relative destinations only, returning a canonical
 * path + query + fragment. Never accept a caller-supplied origin or decode query
 * values into routing syntax. Validation decoding is bounded and is never used
 * as the returned destination. This is navigation validation, not authorization.
 */
export function safeAuthReturnPath(value: unknown): string {
  if (typeof value !== "string" || !value || value.length > 8192
    || !value.startsWith("/") || value.startsWith("//")
    || UNSAFE_LITERAL.test(value) || /%(?![0-9a-f]{2})/i.test(value)) {
    return AUTH_RETURN_FALLBACK;
  }

  // Detect encoded controls through nested percent encoding without decoding
  // nested query URLs or changing their separators/values.
  let controlAudit = value;
  for (let depth = 0; depth < 8; depth++) {
    if (ENCODED_CONTROL.test(controlAudit)) return AUTH_RETURN_FALLBACK;
    const decodedPercent = controlAudit.replace(/%25/gi, "%");
    if (decodedPercent === controlAudit) break;
    if (depth === 7) return AUTH_RETURN_FALLBACK;
    controlAudit = decodedPercent;
  }

  try {
    const url = new URL(value, VALIDATION_ORIGIN);
    if (url.origin !== VALIDATION_ORIGIN || url.username || url.password) return AUTH_RETURN_FALLBACK;
    let pathAudit = value.split(/[?#]/, 1)[0];
    let visitsRoot = false;
    for (let depth = 0; depth < 8; depth++) {
      // Encoded path separators are ambiguous across browser/router decoding
      // layers. Encoded separators in query/fragment DATA remain valid.
      if (UNSAFE_LITERAL.test(pathAudit) || /[?#]/.test(pathAudit)
        || /%(?:2f|5c)/i.test(pathAudit)) return AUTH_RETURN_FALLBACK;
      const parsed = new URL(pathAudit, VALIDATION_ORIGIN);
      if (parsed.origin !== VALIDATION_ORIGIN || parsed.pathname.startsWith("//")
        || NON_RETURN_ROUTE.test(parsed.pathname)) return AUTH_RETURN_FALLBACK;
      visitsRoot ||= parsed.pathname === "/";
      const decodedPath = decodeURIComponent(pathAudit);
      if (decodedPath === pathAudit) break;
      if (depth === 7) return AUTH_RETURN_FALLBACK;
      pathAudit = decodedPath;
    }
    // The landing page consumes `next` itself. Do not transport another redirect
    // instruction through it, including one hidden by dot-segment normalization.
    if (visitsRoot && ["next", "redirect", "returnTo"].some(key => url.searchParams.has(key))) {
      return AUTH_RETURN_FALLBACK;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return AUTH_RETURN_FALLBACK;
  }
}
