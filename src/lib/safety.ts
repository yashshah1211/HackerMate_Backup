/**
 * Chat & Message Safety & Content Moderation Utilities for HackerMate
 * Protects connection pitch notes, DMs, and team chats from profanity, vulgarity, scam/spam, and harmful links.
 */

// Profanity list covering English, Hinglish, Hindi vulgarities, and common slurs
const badWords = [
  // English vulgarities & slurs
  "fuck", "fucking", "fucked", "fucker", "shit", "bitch", "asshole", "bastard", 
  "cunt", "dick", "pussy", "motherfucker", "whore", "slut", "faggot", "nigger", 
  "retard", "cock", "prick", "twat", "douchebag", "jackass", "scum",

  // Hinglish & Hindi profanities
  "chutiya", "chut", "bhenchod", "bhanchod", "benchod", "madarchod", "madarchaud", 
  "gandu", "gand", "gaand", "bsdk", "bhosdike", "bhosdi", "lauda", "loda", "laund", 
  "randi", "saala", "harami", "kamina", "jhant", "jhat", "bhadwe", "bhadwa", "chutiyapa",
  "mc", "bc"
];

// Spam, scam, pornography, and phishing trigger phrases
const scamKeywords = [
  "nude", "nudes", "onlyfans", "telegram.me", "t.me/", "wa.me/", 
  "free crypto", "crypto giveaway", "free bitcoin", "free robux", 
  "send money", "pay upfront", "hack account", "buy followers", 
  "whatsapp group link", "cashapp", "paypal me"
];

// Obfuscation patterns for vulgarity (e.g. f*ck, fck, sh!t, a$$hole, b00bs, chut1ya)
const obfuscatedProfanityRegex = /\b(f[*a-z0-9]ck|sh[!*a-z0-9]t|b[*!a-z0-9]tch|a\$\$hole|d[!*a-z0-9]ck|p[*!a-z0-9]ssy|c[*!a-z0-9]nt|chut[!1i]ya|bh[e3]nch[o0]d|m[a4]d[a4]rch[o0]d)\b/gi;

// Obfuscated link regex (e.g. "example [dot] com", "example(dot)com", "t (dot) me")
const obfuscatedLinkRegex = /([a-zA-Z0-9-]+\s*(?:\[\s*dot\s*\]|\(\s*dot\s*\)|\s+dot\s+)\s*(?:com|org|net|in|co|io|xyz|top|me|app|site|online|tk|ru|click))\b/gi;

// Domains explicitly approved for sharing in pitches, team chats, and developer profiles
const allowedDomains = [
  "github.com", "gitlab.com", "bitbucket.org", "vercel.app", "netlify.app",
  "figma.com", "miro.com", "notion.so", "notion.site",
  "discord.gg", "discord.com", "whatsapp.com", "slack.com",
  "zoom.us", "meet.google.com", "google.com",
  "linkedin.com", "x.com", "twitter.com", "unstop.com", "devpost.com",
  "hackermate.in", "localhost"
];

// Matches standard URL formats
const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9.-]+\.(?:com|org|net|in|co|io|edu|gov|us|xyz|info|biz|me|cc|tv|top|site|online|tech|dev|app|link|click|download)\b[^\s]*)/gi;

// Dangerous file extensions often used in malware/phishing
const dangerousExtensionsRegex = /\.(exe|scr|bat|cmd|vbs|jar|apk|pif|msi|iso|zip|rar|7z)(\?|\s|$)/i;

/**
 * Moderates chat message and connection pitch text for profanity, harmful links, and scam content.
 * 
 * @param text The raw message content from the user
 * @returns An object stating if the message is valid, the sanitized text, and any error message if blocked
 */
export function moderateMessage(text: string): { isValid: boolean; sanitized: string; error?: string } {
  if (!text || typeof text !== "string") {
    return { isValid: true, sanitized: "" };
  }

  const rawText = text.trim();

  // 1. Character Limit & Flood Control
  if (rawText.length > 5000) {
    return {
      isValid: false,
      sanitized: rawText,
      error: "Message blocked: Message length exceeds the limit of 5000 characters."
    };
  }

  // Block excessive character repetitions (e.g., "aaaaaaaaaaaaaaaaa", "!!!!!!!!!!!!!!!")
  if (/(.)\1{14,}/i.test(rawText)) {
    return {
      isValid: false,
      sanitized: rawText,
      error: "Message blocked: Repeated character spam detected."
    };
  }

  // 2. Scam, Pornography & Abuse Trigger Words Check
  const lowerText = rawText.toLowerCase();
  for (const scamTerm of scamKeywords) {
    if (lowerText.includes(scamTerm)) {
      return {
        isValid: false,
        sanitized: rawText,
        error: `Message blocked: Contains prohibited spam or scam phrase ("${scamTerm}").`
      };
    }
  }

  // 3. Obfuscated Links Check (e.g. "github [dot] com")
  if (obfuscatedLinkRegex.test(rawText)) {
    return {
      isValid: false,
      sanitized: rawText,
      error: "Message blocked: Obfuscated links (e.g. 'domain [dot] com') are not permitted."
    };
  }

  // 4. Moderate Profanity & Vulgarity
  let sanitized = rawText;
  let containsProfanity = false;

  // Check exact bad words
  for (const word of badWords) {
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    if (regex.test(sanitized)) {
      containsProfanity = true;
      sanitized = sanitized.replace(regex, (match) => {
        if (match.length <= 2) {
          return "*".repeat(match.length);
        }
        return match[0] + "*".repeat(match.length - 2) + match[match.length - 1];
      });
    }
  }

  // Check Leetspeak / Obfuscated Profanity
  if (obfuscatedProfanityRegex.test(rawText)) {
    return {
      isValid: false,
      sanitized: rawText,
      error: "Message blocked: Inappropriate language or vulgarity detected."
    };
  }

  if (containsProfanity) {
    return {
      isValid: false,
      sanitized: rawText,
      error: "Message blocked: Inappropriate language or vulgarity detected."
    };
  }

  // 5. Link Safety & Malware/Phishing Check
  const urls = rawText.match(urlRegex);
  if (urls) {
    for (const url of urls) {
      // Check dangerous extensions
      if (dangerousExtensionsRegex.test(url)) {
        return {
          isValid: false,
          sanitized: rawText,
          error: "Message blocked: Links to executable or archived files (.exe, .apk, .zip) are restricted for security."
        };
      }

      let domain = "";
      try {
        const urlString = url.toLowerCase().startsWith("http") ? url : "http://" + url;
        const parsedUrl = new URL(urlString);
        domain = parsedUrl.hostname.toLowerCase();
      } catch {
        domain = url.replace(/(https?:\/\/)?(www\.)?/, "").split("/")[0].split(":")[0].toLowerCase();
      }

      // Restrict subdomains on generic hosting providers
      const userContentDomains = ["vercel.app", "netlify.app", "notion.site", "notion.so"];

      // Verify domain against allowed whitelist
      const isAllowed = allowedDomains.some((allowed) => {
        if (domain === allowed) return true;
        if (domain.endsWith("." + allowed)) {
          return !userContentDomains.includes(allowed);
        }
        return false;
      });

      if (!isAllowed) {
        return {
          isValid: false,
          sanitized: rawText,
          error: `Message blocked: Link sharing is restricted to verified platforms (GitHub, Figma, LinkedIn, Discord). Domain '${domain}' is not approved.`
        };
      }
    }
  }

  return {
    isValid: true,
    sanitized
  };
}
