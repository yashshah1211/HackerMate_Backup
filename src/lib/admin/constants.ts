export const EXCLUDED_EMAIL_DOMAINS = [
  "sentry",
  "w3.org",
  "schema.org",
  "example.com",
  "domain.com",
  "infegy.com",
  "unstop.com",
  "devfolio.co",
  "hack2skill.com",
  "google-analytics.com",
  "googletagmanager.com",
  "doubleclick.net",
  "segment.io",
  "mixpanel.com",
  "hotjar.com",
  "intercom.io",
  "zendesk.com",
  "hubspot.com",
  "cloudflare.com",
  "bugsnag.com",
  "rollbar.com",
  "datadoghq.com",
  "newrelic.com",
];

export function extractValidEmails(text: string | null | undefined): string[] {
  if (!text) return [];
  const matches = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
  const validTldRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.(com|in|org|io|co|net|edu|dev|tech|app|xyz|me|global|ai)$/i;

  const valid = matches.filter((email) => {
    const lower = email.toLowerCase().trim();
    if (
      lower.endsWith(".css") ||
      lower.endsWith(".js") ||
      lower.endsWith(".png") ||
      lower.endsWith(".jpg") ||
      lower.endsWith(".svg") ||
      lower.endsWith(".webp")
    ) {
      return false;
    }
    if (EXCLUDED_EMAIL_DOMAINS.some((pat) => lower.includes(pat))) {
      return false;
    }
    return validTldRegex.test(lower);
  });

  return Array.from(new Set(valid.map((e) => e.trim())));
}
