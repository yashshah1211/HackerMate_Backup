// AI Content Moderation for HackerMate Media using Google Gemini Flash (₹0 Free Tier)

export async function moderateImageWithGemini(
  imageBuffer: Buffer,
  mimeType: string
): Promise<{ isSafe: boolean; reason?: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    // If no API key configured, pass safely
    return { isSafe: true };
  }

  try {
    const base64Data = imageBuffer.toString("base64");

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const prompt = `You are a strict safety and compliance moderation engine for HackerMate, a student developer and hackathon community platform.
Analyze the attached image strictly for safety violations.

Flags to check:
1. Adult / NSFW / Sexually Explicit / Nudity / Provocative imagery.
2. Violence, weapons, gore, blood, or graphic injuries.
3. Hate symbols, offensive/derogatory gestures, harassment, or vulgarity.
4. Illegal drugs, phishing screenshots, or malicious scams.

If the image contains ANY of the above violations, it MUST be marked as NOT safe.
If it is a normal profile photo, screenshot of code, UI design, project diagram, or everyday image, mark it as safe.

Respond STRICTLY with a single JSON object in this exact format (no markdown formatting, no backticks):
{"isSafe": true}
OR
{"isSafe": false, "reason": "Short user-friendly explanation of violation"}`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: mimeType || "image/webp",
                  data: base64Data,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 150,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn("Gemini moderation API error (non-fatal):", response.status, errText);
      return { isSafe: true }; // Don't block uploads if AI rate limits occur
    }

    const data = await response.json();
    const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

    const parsed = JSON.parse(replyText);
    if (parsed && typeof parsed.isSafe === "boolean") {
      return {
        isSafe: parsed.isSafe,
        reason: parsed.reason || "Content violates community safety guidelines.",
      };
    }

    return { isSafe: true };
  } catch (error) {
    console.error("Gemini AI moderation execution error:", error);
    return { isSafe: true }; // Fail-open to avoid breaking legitimate user experience on network hiccups
  }
}
