import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Safely extracts user initials for avatar displays.
 * Skips leading numbers, special characters, and symbols so that names
 * like "107 AKKSHAT KUMAR" or "61_Ashish.Singh" render initials ("AK", "AS", "A")
 * instead of numbers.
 */
export function getInitials(name?: string | null, maxChars: number = 2): string {
  if (!name || typeof name !== "string") return "U";

  // Strip leading non-alphabetic characters (digits, underscores, spaces, symbols)
  const cleaned = name.replace(/^[^a-zA-Z]+/, "").trim();
  if (!cleaned) return "U";

  // Split by whitespace, underscores, dots, or hyphens
  const words = cleaned
    .split(/[\s_.\-]+/)
    .filter((w) => /[a-zA-Z]/.test(w));

  if (words.length === 0) return "U";

  if (words.length === 1 || maxChars === 1) {
    const firstLetter = words[0].match(/[a-zA-Z]/);
    return firstLetter ? firstLetter[0].toUpperCase() : "U";
  }

  const initials = words
    .slice(0, maxChars)
    .map((w) => {
      const match = w.match(/[a-zA-Z]/);
      return match ? match[0].toUpperCase() : "";
    })
    .join("");

  return initials || "U";
}

