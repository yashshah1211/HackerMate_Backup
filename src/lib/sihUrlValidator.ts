export interface UrlValidationResult {
  isValid: boolean;
  error?: string;
  warning?: string;
  domain?: string;
}

export const ALLOWED_PPT_DOMAINS = [
  "docs.google.com",
  "drive.google.com",
  "google.com",
  "canva.com",
  "slideshare.net",
  "onedrive.live.com",
  "1drv.ms",
  "sharepoint.com",
  "office.com",
  "office365.com",
  "figma.com",
  "pitch.com",
  "gamma.app",
  "notion.site",
  "notion.so",
  "dropbox.com",
];

/**
 * SSRF Protection: Ensure URL scheme is http/https and target host is not a local/private network address.
 */
function isSafeUrl(urlStr: string): { safe: boolean; reason?: string; hostname?: string } {
  try {
    const parsed = new URL(urlStr.trim());
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return { safe: false, reason: "Only HTTP and HTTPS protocols are allowed." };
    }

    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname === "::1" ||
      hostname.startsWith("169.254.") ||
      hostname.startsWith("10.") ||
      hostname.startsWith("192.168.") ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal")
    ) {
      return { safe: false, reason: "Internal and loopback URLs are strictly forbidden." };
    }

    return { safe: true, hostname };
  } catch {
    return { safe: false, reason: "Invalid URL syntax." };
  }
}

/**
 * Validates domain whitelist for PPT pitch deck submissions.
 */
export function isPptDomainWhitelisted(urlStr: string): UrlValidationResult {
  if (!urlStr || !urlStr.trim()) {
    return { isValid: false, error: "PPT presentation link is required." };
  }

  const formatted = urlStr.trim().startsWith("http") ? urlStr.trim() : `https://${urlStr.trim()}`;
  const safeCheck = isSafeUrl(formatted);
  if (!safeCheck.safe || !safeCheck.hostname) {
    return { isValid: false, error: safeCheck.reason || "Invalid PPT URL format." };
  }

  const hostname = safeCheck.hostname;
  const isWhitelisted = ALLOWED_PPT_DOMAINS.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
  );

  if (!isWhitelisted) {
    return {
      isValid: false,
      domain: hostname,
      error: `Invalid PPT domain (${hostname}). Submission link must be hosted on Google Drive/Slides, Canva, OneDrive, Gamma, Pitch, Figma, Notion, or Dropbox.`,
    };
  }

  return { isValid: true, domain: hostname };
}

/**
 * Validates presentation links for domain whitelisting & Google Drive public accessibility.
 */
export async function validateGoogleDriveLink(urlStr: string): Promise<UrlValidationResult> {
  const domainCheck = isPptDomainWhitelisted(urlStr);
  if (!domainCheck.isValid) {
    return domainCheck;
  }

  const trimmed = urlStr.trim();
  const isGoogleDrive =
    trimmed.includes("drive.google.com") ||
    trimmed.includes("docs.google.com/presentation") ||
    trimmed.includes("docs.google.com/file") ||
    trimmed.includes("docs.google.com/document");

  if (!isGoogleDrive) {
    return { isValid: true, domain: domainCheck.domain };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500); // 3.5s strict timeout

    const res = await fetch(trimmed, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) HackerMate-SIH-Checker/1.0",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // If redirected to login page (accounts.google.com), permission is denied / private
    if (res.url.includes("accounts.google.com") || res.status === 403) {
      return {
        isValid: false,
        domain: domainCheck.domain,
        error:
          "Google Drive access restricted! Please set your link sharing setting to 'Anyone with the link can view' before submitting.",
      };
    }

    if (res.status === 404) {
      return {
        isValid: false,
        domain: domainCheck.domain,
        error: "Google Drive file not found (HTTP 404). Please verify the link.",
      };
    }

    if (!res.ok) {
      return {
        isValid: false,
        domain: domainCheck.domain,
        error: `Inaccessible Google Drive link (HTTP ${res.status}). Please check sharing settings.`,
      };
    }

    return { isValid: true, domain: domainCheck.domain };
  } catch (err: any) {
    if (err.name === "AbortError") {
      return {
        isValid: true,
        domain: domainCheck.domain,
        warning: "Drive access check timed out, but domain is whitelisted.",
      };
    }
    return { isValid: true, domain: domainCheck.domain };
  }
}

/**
 * Validates GitHub repository link syntax and host.
 */
export function validateGithubLink(urlStr?: string): UrlValidationResult {
  if (!urlStr || !urlStr.trim()) return { isValid: true };
  const safeCheck = isSafeUrl(urlStr);
  if (!safeCheck.safe) return { isValid: false, error: safeCheck.reason };

  const trimmed = urlStr.trim().toLowerCase();
  if (!trimmed.includes("github.com")) {
    return { isValid: false, error: "GitHub repository URL must be hosted on github.com" };
  }

  return { isValid: true };
}

/**
 * Validates live product demo link syntax.
 */
export function validateDemoLink(urlStr?: string): UrlValidationResult {
  if (!urlStr || !urlStr.trim()) return { isValid: true };
  const safeCheck = isSafeUrl(urlStr);
  if (!safeCheck.safe) return { isValid: false, error: safeCheck.reason };

  return { isValid: true };
}
