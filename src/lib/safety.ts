/**
 * Chat Safety & Content Moderation Utilities for HackerMate
 */

const badWords = [
  "fuck", "shit", "bitch", "asshole", "bastard", "cunt", "dick", "pussy", 
  "motherfuck", "whore", "slut", "faggot", "nigger", "chutiya", "bhenchod", 
  "madarchod", "gandu", "bsdk"
];

// Domains allowed for sharing in hackathon team chats and DMs
const allowedDomains = [
  "github.com", "gitlab.com", "bitbucket.org", "vercel.app", "netlify.app",
  "figma.com", "miro.com", "notion.so", "notion.site",
  "discord.gg", "discord.com", "whatsapp.com", "slack.com",
  "zoom.us", "meet.google.com", "google.com",
  "linkedin.com", "x.com", "twitter.com", "unstop.com", "devpost.com"
];

// Matches common URL formats but ignores code file extensions (.js, .ts, .py, etc.) to prevent false triggers
const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9.-]+\.(?:com|org|net|in|co|io|edu|gov|us|xyz|info|biz|me|cc|tv)\b[^\s]*)/gi;

/**
 * Moderates chat message text for profanity and unapproved links.
 * 
 * @param text The raw message content from the user
 * @returns An object stating if the message is valid, the sanitized text, and any error message if blocked
 */
export function moderateMessage(text: string): { isValid: boolean; sanitized: string; error?: string } {
  let sanitized = text;

  // 1. Moderate Profanity (Masking words with asterisks)
  for (const word of badWords) {
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    sanitized = sanitized.replace(regex, (match) => {
      if (match.length <= 2) {
        return "*".repeat(match.length);
      }
      return match[0] + "*".repeat(match.length - 2) + match[match.length - 1];
    });
  }

  // 2. Link Safety Check
  const urls = text.match(urlRegex);
  if (urls) {
    for (const url of urls) {
      let domain = "";
      try {
        const urlString = url.toLowerCase().startsWith("http") ? url : "http://" + url;
        const parsedUrl = new URL(urlString);
        domain = parsedUrl.hostname.toLowerCase();
      } catch {
        // Fallback basic parsing if URL parser fails
        domain = url.replace(/(https?:\/\/)?(www\.)?/, "").split("/")[0].toLowerCase();
      }

      // Check if domain is allowed or is a subdomain of an allowed domain
      const isAllowed = allowedDomains.some(allowed => 
        domain === allowed || domain.endsWith("." + allowed)
      );

      if (!isAllowed) {
        return {
          isValid: false,
          sanitized: text,
          error: "Message blocked: Link sharing is restricted to developer, collaboration, and hackathon platforms (GitHub, LinkedIn, Discord, etc.) to keep the community safe."
        };
      }
    }
  }

  return {
    isValid: true,
    sanitized
  };
}
