/**
 * HackerMate Transactional & Notification Email Template Engine
 * 
 * Generates email-client-safe, responsive dark-mode HTML emails with
 * HackerMate brand accents (#B4F461 lime, #22D3EE cyan), formatted callout
 * cards for personal notes, and high-deliverability anti-spam standards.
 */

export interface EmailDetailRow {
  label: string;
  value: string;
}

export interface HackerMateEmailOptions {
  title: string;
  recipientName?: string | null;
  introText: string;
  calloutQuote?: string | null;
  calloutLabel?: string | null;
  details?: EmailDetailRow[];
  actionLabel?: string;
  actionUrl?: string;
  badgeText?: string;
  footerNote?: string;
}

export function escapeHtml(str: string): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function renderHackerMateEmail(options: HackerMateEmailOptions): string {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://hackermate.in";
  const escapedTitle = escapeHtml(options.title);
  const escapedRecipientName = escapeHtml(options.recipientName || "Builder");
  const escapedIntroText = escapeHtml(options.introText).replace(/\n\n/g, "</p><p style=\"margin: 0 0 16px 0;\">").replace(/\n/g, "<br/>");
  const escapedActionUrl = options.actionUrl ? escapeHtml(options.actionUrl) : "";
  const escapedActionLabel = options.actionLabel ? escapeHtml(options.actionLabel) : "";
  const escapedBadge = options.badgeText ? escapeHtml(options.badgeText) : "";
  const escapedFooterNote = options.footerNote
    ? escapeHtml(options.footerNote)
    : `You are receiving this notification because of activity on your HackerMate account. To adjust your notification preferences, visit your profile settings.`;

  // Render optional callout quote (pitch note, invite message, etc.)
  let calloutHtml = "";
  if (options.calloutQuote && options.calloutQuote.trim().length > 0) {
    const escapedQuote = escapeHtml(options.calloutQuote.trim()).replace(/\n/g, "<br/>");
    const escapedLabel = options.calloutLabel ? escapeHtml(options.calloutLabel) : "Pitch Note";
    calloutHtml = `
      <div style="background-color: #090D14; border-left: 3px solid #B4F461; border-radius: 0 8px 8px 0; padding: 14px 18px; margin: 20px 0 24px 0;">
        <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #B4F461; margin-bottom: 6px;">
          ${escapedLabel}
        </div>
        <div style="font-size: 14px; font-style: italic; color: #CBD5E1; line-height: 1.6;">
          "${escapedQuote}"
        </div>
      </div>
    `;
  }

  // Render optional key-value detail list
  let detailsHtml = "";
  if (options.details && options.details.length > 0) {
    const rows = options.details
      .map(
        (d) => `
        <tr style="border-bottom: 1px solid #1E242E;">
          <td style="padding: 10px 0; font-size: 13px; font-weight: 600; color: #8B93A3; width: 120px;">
            ${escapeHtml(d.label)}
          </td>
          <td style="padding: 10px 0; font-size: 13px; color: #EDEFF3;">
            ${escapeHtml(d.value)}
          </td>
        </tr>
      `
      )
      .join("");

    detailsHtml = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 16px 0 24px 0; border-collapse: collapse; background-color: #0A0D12; border: 1px solid #1E242E; border-radius: 8px; padding: 12px 16px;">
        <tbody>
          ${rows}
        </tbody>
      </table>
    `;
  }

  // Render Action Button
  let ctaHtml = "";
  if (escapedActionUrl && escapedActionLabel) {
    ctaHtml = `
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 28px 0 32px 0;">
        <tr>
          <td align="center" style="border-radius: 8px; background-color: #B4F461;">
            <a href="${escapedActionUrl}"
               target="_blank"
               style="display: inline-block; background-color: #B4F461; color: #090D14 !important; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 13px; font-weight: 800; text-decoration: none; padding: 13px 28px; border-radius: 8px; text-transform: uppercase; letter-spacing: 0.8px; box-shadow: 0 4px 14px rgba(180, 244, 97, 0.25);">
              ${escapedActionLabel} &rarr;
            </a>
          </td>
        </tr>
      </table>
    `;
  }

  return `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <title>${escapedTitle}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    :root {
      color-scheme: dark;
      supported-color-schemes: dark;
    }
    body {
      background-color: #0A0D12;
      color: #EDEFF3;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
      -webkit-text-size-adjust: 100%;
    }
    a {
      color: #B4F461;
      text-decoration: none;
    }
    @media only screen and (max-width: 600px) {
      .container {
        width: 100% !important;
        padding: 24px 20px !important;
      }
      .wrapper {
        padding: 16px 8px !important;
      }
    }
  </style>
</head>
<body style="background-color: #0A0D12; margin: 0; padding: 0;">
  <div class="wrapper" style="width: 100%; background-color: #0A0D12; padding: 40px 16px; box-sizing: border-box;">
    <!-- Main Email Container -->
    <table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width: 540px; margin: 0 auto;">
      <tr>
        <td class="container" style="background-color: #10141B; border: 1px solid #1E242E; border-radius: 12px; padding: 36px 32px; box-sizing: border-box;">
          
          <!-- Header: Brand Mark -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 28px; border-bottom: 1px solid #171B23; padding-bottom: 20px;">
            <tr>
              <td align="left" style="vertical-align: middle;">
                <a href="${baseUrl}" target="_blank" style="text-decoration: none;">
                  <span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 19px; font-weight: 900; letter-spacing: -0.5px; color: #FFFFFF;">
                    <span style="color: #B4F461;">HACKER</span><span style="color: #22D3EE;">MATE</span><span style="color: #B4F461;">.</span>
                  </span>
                </a>
              </td>
              ${
                escapedBadge
                  ? `<td align="right" style="vertical-align: middle;">
                      <span style="display: inline-block; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; padding: 4px 10px; border-radius: 4px; background-color: #141B24; color: #94A3B8; border: 1px solid #222E3E;">
                        ${escapedBadge}
                      </span>
                    </td>`
                  : ""
              }
            </tr>
          </table>

          <!-- Title -->
          <h1 style="font-size: 21px; font-weight: 800; color: #FFFFFF; letter-spacing: -0.3px; margin: 0 0 16px 0; line-height: 1.3;">
            ${escapedTitle}
          </h1>

          <!-- Greeting -->
          <div style="font-size: 14px; font-weight: 600; color: #94A3B8; margin-bottom: 16px;">
            Hi ${escapedRecipientName},
          </div>

          <!-- Body Text -->
          <div style="font-size: 14px; color: #E2E8F0; line-height: 1.65; margin-bottom: 20px;">
            <p style="margin: 0 0 16px 0;">
              ${escapedIntroText}
            </p>
          </div>

          <!-- Optional Pitch Note / Callout Quote -->
          ${calloutHtml}

          <!-- Optional Details List -->
          ${detailsHtml}

          <!-- CTA Button -->
          ${ctaHtml}

          <!-- Footer Note -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top: 1px solid #171B23; padding-top: 22px; margin-top: 8px;">
            <tr>
              <td style="font-size: 11px; color: #565E6D; line-height: 1.6;">
                ${escapedFooterNote}<br/>
                <span style="display: inline-block; margin-top: 6px;">
                  &copy; ${new Date().getFullYear()} <a href="${baseUrl}" target="_blank" style="color: #8B93A3; text-decoration: underline;">HackerMate</a> &bull; The Team Operating System for Hackathons
                </span>
              </td>
            </tr>
          </table>

        </td>
      </tr>
    </table>
  </div>
</body>
</html>`;
}
