function stripHtml(str: string | null): string {
  if (!str) return "";
  return str.replace(/<[^>]*>/g, "").replace(/&[^;]+;/g, "").trim();
}

export function formatPrizeDisplay(prize: string | null | undefined, currency?: string | null): string {
  if (!prize) return "";

  const clean = stripHtml(prize);
  if (!clean) return "";

  // If already starts with currency symbol, preserve as-is
  if (/^[₹$€£]/.test(clean)) {
    return clean;
  }

  // Check if string represents a monetary amount like "50,000", "1,00,000", "50K", "1 Lakh", "10M"
  const isNumericAmount = /^[\d,.\s]+(?:k|lakh|lac|crore|cr|m|million)?$/i.test(clean);

  // If prize description is descriptive text (e.g. "Nomination to SIH 2026 National Round", "Swag & Perks")
  if (!isNumericAmount) {
    return clean;
  }

  const isUSD = currency === "USD" || currency === "$" || clean.includes("$") || /\bUSD\b/i.test(clean);
  const targetSymbol = isUSD ? "$" : "₹";
  return `${targetSymbol} ${clean.replace(/^[₹$]\s*/, "")}`;
}
