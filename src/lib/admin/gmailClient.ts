/**
 * Gmail API Client for HackerMate Outreach CRM
 * Uses Google OAuth 2.0 Refresh Token to fetch inbox messages & detect organizer replies.
 */

export type GmailMessageHeader = {
  name: string;
  value: string;
};

export type ParsedGmailReply = {
  messageId: string;
  threadId: string;
  fromEmail: string;
  fromName: string;
  subject: string;
  date: string;
  snippet: string;
};

/**
 * Obtain a fresh Google OAuth 2.0 Access Token using Refresh Token
 */
async function getGmailAccessToken(): Promise<string | null> {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    console.warn("[Gmail Client] Missing GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, or GMAIL_REFRESH_TOKEN in environment variables.");
    return null;
  }

  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!res.ok) {
      const errJson = await res.json();
      console.error("[Gmail Client] Failed to refresh access token:", errJson);
      return null;
    }

    const data = await res.json();
    return data.access_token || null;
  } catch (err: any) {
    console.error("[Gmail Client] Token refresh exception:", err);
    return null;
  }
}

/**
 * Fetch recent incoming messages from Gmail inbox
 * @param query Optional search query (e.g. "label:INBOX")
 * @param maxResults Max messages to retrieve (default: 30)
 */
export async function fetchRecentGmailMessages(
  query: string = "label:INBOX",
  maxResults: number = 30
): Promise<ParsedGmailReply[]> {
  const accessToken = await getGmailAccessToken();
  if (!accessToken) {
    return [];
  }

  try {
    const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`;
    const listRes = await fetch(listUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!listRes.ok) {
      console.error("[Gmail Client] List messages failed:", await listRes.text());
      return [];
    }

    const listData = await listRes.json();
    const messageSummaries: { id: string; threadId: string }[] = listData.messages || [];

    if (messageSummaries.length === 0) {
      return [];
    }

    // Fetch message details in parallel
    const parsedReplies: ParsedGmailReply[] = [];
    await Promise.all(
      messageSummaries.map(async (msg) => {
        try {
          const detailUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`;
          const detailRes = await fetch(detailUrl, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });

          if (!detailRes.ok) return;

          const detail = await detailRes.json();
          const headers: GmailMessageHeader[] = detail.payload?.headers || [];

          const fromHeader = headers.find((h) => h.name.toLowerCase() === "from")?.value || "";
          const subject = headers.find((h) => h.name.toLowerCase() === "subject")?.value || "No Subject";
          const date = headers.find((h) => h.name.toLowerCase() === "date")?.value || new Date().toISOString();

          // Extract clean email address and sender name from "Name <email@domain.com>"
          let fromEmail = fromHeader;
          let fromName = fromHeader;

          const emailMatch = fromHeader.match(/<([^>]+)>/);
          if (emailMatch) {
            fromEmail = emailMatch[1].trim().toLowerCase();
            fromName = fromHeader.replace(/<[^>]+>/, "").trim().replace(/^"|"$/g, "");
          } else {
            fromEmail = fromHeader.trim().toLowerCase();
          }

          parsedReplies.push({
            messageId: msg.id,
            threadId: msg.threadId,
            fromEmail,
            fromName,
            subject,
            date,
            snippet: detail.snippet || "",
          });
        } catch (e) {
          console.warn("[Gmail Client] Error fetching message detail:", e);
        }
      })
    );

    return parsedReplies;
  } catch (err: any) {
    console.error("[Gmail Client] Fetch Exception:", err);
    return [];
  }
}
