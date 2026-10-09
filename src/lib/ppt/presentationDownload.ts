import { lookup } from "node:dns/promises";
import type { LookupAddress } from "node:dns";
import { request } from "node:https";
import { isIP } from "node:net";

export const ALLOWED_PRESENTATION_DOMAINS = ["docs.google.com", "drive.google.com", "slides.google.com", "canva.com", "www.canva.com"];
const DOWNLOAD_DOMAINS = [...ALLOWED_PRESENTATION_DOMAINS, "googleusercontent.com", "drive.usercontent.google.com"];

export class PresentationLimitError extends Error {}

export function isPrivateAddress(address: string): boolean {
  const lower = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (isIP(lower) === 6) {
    // Only global unicast IPv6; reject mapped IPv4, loopback, ULA and link-local.
    return !/^[23][0-9a-f]{3}:/.test(lower) || lower.startsWith("2001:db8:");
  }
  if (isIP(lower) !== 4) return true;
  const [a, b, c] = lower.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 2))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113);
}

function allowedUrl(url: URL, domains: string[]): boolean {
  return url.protocol === "https:" && !url.username && !url.password && (!url.port || url.port === "443") &&
    domains.some(domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`));
}

export function validatePresentationUrl(value: string): { valid: boolean; error?: string; url?: URL } {
  try {
    const url = new URL(value.trim());
    if (!allowedUrl(url, ALLOWED_PRESENTATION_DOMAINS)) {
      return { valid: false, error: "Only HTTPS Google Slides, Google Drive and Canva links without credentials or custom ports are allowed." };
    }
    return { valid: true, url };
  } catch {
    return { valid: false, error: "Please provide a valid HTTPS presentation link." };
  }
}

/** Manual redirects, DNS validation AND pinned lookup prevent private-network access/rebinding.
 * One deadline includes DNS, redirects and streamed body reads. No cookies or credentials.
 */
export async function downloadPresentation(url: string, maxBytes: number, deadline: number): Promise<{ bytes: Buffer; contentType: string }> {
  let current = new URL(url);
  const signal = AbortSignal.timeout(Math.max(1, Math.min(4500, deadline - Date.now())));
  for (let hop = 0; hop <= 3; hop++) {
    signal.throwIfAborted();
    if (!allowedUrl(current, DOWNLOAD_DOMAINS)) throw new Error("Presentation download destination is not allowed.");
    const resolved = await new Promise<LookupAddress[]>((resolve, reject) => {
      const abort = () => reject(new Error("Presentation download timed out."));
      signal.addEventListener("abort", abort, { once: true });
      lookup(current.hostname, { all: true, verbatim: true }).then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
    });
    if (!resolved.length || resolved.some(entry => isPrivateAddress(entry.address))) throw new Error("Private-network presentation destination blocked.");
    signal.throwIfAborted();
    const selected = resolved[0];
    const result = await new Promise<{ redirect?: string; bytes: Buffer; contentType: string }>((resolve, reject) => {
      const req = request(current, {
        method: "GET", signal, family: selected.family,
        headers: { "User-Agent": "HackerMate-Presentation/2.0", "Accept-Encoding": "identity" },
        // Keep TLS certificate validation against the original hostname, pin the socket address.
        lookup: (_host, _options, callback) => callback(null, selected.address, selected.family),
      }, res => {
        const status = res.statusCode || 0;
        if ([301, 302, 303, 307, 308].includes(status)) {
          const redirect = res.headers.location;
          res.destroy();
          if (!redirect) return reject(new Error("Invalid presentation redirect."));
          return resolve({ redirect, bytes: Buffer.alloc(0), contentType: "" });
        }
        if (status < 200 || status >= 300) { res.destroy(); reject(new Error("Presentation is not publicly accessible.")); return; }
        if (res.headers["content-encoding"] && res.headers["content-encoding"] !== "identity") { res.destroy(); reject(new Error("Compressed downloads are unsupported.")); return; }
        const declared = Number(res.headers["content-length"] || 0);
        if (!Number.isFinite(declared) || declared < 0 || declared > maxBytes) { res.destroy(); reject(new PresentationLimitError("Presentation exceeds the download size limit.")); return; }
        const chunks: Buffer[] = [];
        let length = 0;
        res.on("data", (chunk: Buffer) => {
          length += chunk.length;
          if (length > maxBytes) { res.destroy(); reject(new PresentationLimitError("Presentation exceeds the download size limit.")); return; }
          chunks.push(chunk);
        });
        res.on("error", reject);
        res.on("aborted", () => reject(new Error("Presentation download interrupted.")));
        res.on("end", () => resolve({ bytes: Buffer.concat(chunks, length), contentType: String(res.headers["content-type"] || "").toLowerCase() }));
      });
      req.on("error", reject);
      req.end();
    });
    if (!result.redirect) return result;
    current = new URL(result.redirect, current);
  }
  throw new Error("Too many presentation redirects.");
}
