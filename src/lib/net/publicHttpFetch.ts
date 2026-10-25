import { lookup as dnsLookup } from "node:dns/promises";
import type { LookupAddress, LookupOptions } from "node:dns";
import { request as httpRequest } from "node:http";
import type { ClientRequest, IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import type { RequestOptions } from "node:https";
import { BlockList, isIP } from "node:net";
import type { Transform } from "node:stream";
import { TextDecoder } from "node:util";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";

/**
 * Server-side fetcher for untrusted public HTTP(S) URLs (chat link previews).
 *
 * - Every hop: http/https only, no credentials, default port only, public hostname.
 * - DNS is resolved once per hop; every answer must be a public address. The socket is
 *   pinned to the validated address through a custom `lookup`, so nothing resolves again.
 * - TLS keeps Node defaults: certificate validation on, SNI/hostname check against the URL host.
 * - `agent: false`: no pooled sockets and no environment proxy (NODE_USE_ENV_PROXY).
 * - Redirects are manual and fully revalidated.
 * - One deadline covers DNS, connect, TLS, headers, decompression and body.
 * - Wire and decoded bytes are both capped.
 *
 * There is intentionally no option to relax the address policy.
 */

export const PUBLIC_FETCH_DEADLINE_MS = 4000;
export const PUBLIC_FETCH_MAX_REDIRECTS = 5;
export const PUBLIC_FETCH_MAX_HTML_BYTES = 120 * 1024;
export const PUBLIC_FETCH_MAX_URL_LENGTH = 2048;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 (compatible; HackerMateBot/1.0)";
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const HEAD_END = /<\/head\s*>/i;
/** Re-scan this many trailing characters so a `</head>` split across chunks is still found. */
const HEAD_END_OVERLAP = 16;

export type PublicFetchErrorCode =
  | "BLOCKED"
  | "TIMEOUT"
  | "TOO_MANY_REDIRECTS"
  | "BAD_REDIRECT"
  | "UNSUPPORTED_ENCODING"
  | "NETWORK";

export class PublicFetchError extends Error {
  readonly code: PublicFetchErrorCode;
  constructor(code: PublicFetchErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PublicFetchError";
    this.code = code;
  }
}

export function isBlockedDestinationError(error: unknown): boolean {
  return error instanceof PublicFetchError && error.code === "BLOCKED";
}

// IANA IPv4 special-purpose ranges, plus multicast and reserved space.
const DENIED_IPV4 = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  DENIED_IPV4.addSubnet(network, prefix, "ipv4");
}

// IPv6: only global unicast is allowed. Mapped/compatible IPv4, NAT64, loopback, ULA,
// link-local, site-local and multicast all fall outside 2000::/3.
const ALLOWED_IPV6 = new BlockList();
ALLOWED_IPV6.addSubnet("2000::", 3, "ipv6");
const DENIED_IPV6 = new BlockList();
for (const [network, prefix] of [
  ["2001::", 23], // IETF protocol assignments, including Teredo 2001::/32
  ["2001:db8::", 32], // documentation
  ["2002::", 16], // 6to4 (embeds IPv4)
  ["3fff::", 20], // documentation
] as const) {
  DENIED_IPV6.addSubnet(network, prefix, "ipv6");
}

export function isPublicAddress(address: string): boolean {
  const value = address.startsWith("[") && address.endsWith("]") ? address.slice(1, -1) : address;
  if (value.includes("%")) return false; // zone IDs are link-local by definition
  try {
    const version = isIP(value);
    if (version === 4) return !DENIED_IPV4.check(value, "ipv4");
    if (version === 6) return ALLOWED_IPV6.check(value, "ipv6") && !DENIED_IPV6.check(value, "ipv6");
  } catch {
    return false;
  }
  return false;
}

const DENIED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa"];

type PublicTarget = {
  url: URL;
  /** Hostname handed to http(s).request: brackets removed for IPv6 literals. */
  connectHost: string;
  /** Present for IP literals: validated, no DNS needed. */
  literal: LookupAddress | null;
};

function blocked(): PublicFetchError {
  return new PublicFetchError("BLOCKED", "Destination not allowed");
}

/** Synchronous URL policy. Throws BLOCKED for any forbidden destination. */
export function assertPublicHttpUrl(url: URL): PublicTarget {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw blocked();
  if (url.username || url.password) throw blocked();
  // WHATWG URL drops default ports, so any explicit port is non-standard.
  if (url.port !== "") throw blocked();
  if (url.href.length > PUBLIC_FETCH_MAX_URL_LENGTH) throw blocked();

  const raw = url.hostname.toLowerCase();
  if (!raw) throw blocked();
  const unbracketed = raw.startsWith("[") && raw.endsWith("]") ? raw.slice(1, -1) : raw;
  const family = isIP(unbracketed);
  if (family === 4 || family === 6) {
    if (!isPublicAddress(unbracketed)) throw blocked();
    return { url, connectHost: unbracketed, literal: { address: unbracketed, family } };
  }

  const name = raw.endsWith(".") ? raw.slice(0, -1) : raw;
  if (!name || !name.includes(".") || name.includes("..")) throw blocked();
  if (name === "localhost" || DENIED_HOST_SUFFIXES.some((suffix) => name.endsWith(suffix))) throw blocked();
  return { url, connectHost: raw, literal: null };
}

function timeoutError(): PublicFetchError {
  return new PublicFetchError("TIMEOUT", "Public fetch deadline exceeded");
}

function withDeadline<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    promise.catch(() => {});
    return Promise.reject(timeoutError());
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(timeoutError());
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

async function resolvePinnedAddress(target: PublicTarget, signal: AbortSignal): Promise<LookupAddress> {
  if (target.literal) return target.literal;
  let answers: LookupAddress[];
  try {
    answers = await withDeadline(dnsLookup(target.connectHost, { all: true, verbatim: true }), signal);
  } catch (error) {
    if (error instanceof PublicFetchError) throw error;
    throw new PublicFetchError("NETWORK", "DNS resolution failed", { cause: error });
  }
  if (!Array.isArray(answers) || answers.length === 0) {
    throw new PublicFetchError("NETWORK", "DNS returned no addresses");
  }
  // Any non-public answer blocks the destination, so mixed answers cannot be raced.
  for (const answer of answers) {
    if ((answer.family !== 4 && answer.family !== 6) || !isPublicAddress(answer.address)) throw blocked();
  }
  return { address: answers[0].address, family: answers[0].family };
}

type LookupCallback = (error: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/** Lookup that only ever returns the already validated address for the expected host. */
function pinnedLookup(expectedHost: string, pinned: LookupAddress) {
  return (hostname: string, options: LookupOptions | LookupCallback, callback?: LookupCallback): void => {
    const done = (typeof options === "function" ? options : callback) as LookupCallback;
    const opts = typeof options === "object" && options ? options : {};
    if (hostname.toLowerCase() !== expectedHost) {
      const error: NodeJS.ErrnoException = new Error("Unexpected lookup host");
      error.code = "ENOTFOUND";
      done(error, "", 0);
      return;
    }
    if (opts.all) done(null, [{ address: pinned.address, family: pinned.family }]);
    else done(null, pinned.address, pinned.family);
  };
}

function sendRequest(target: PublicTarget, pinned: LookupAddress, signal: AbortSignal): Promise<IncomingMessage> {
  const isHttps = target.url.protocol === "https:";
  const options: RequestOptions = {
    protocol: target.url.protocol,
    hostname: target.connectHost,
    port: isHttps ? 443 : 80,
    path: `${target.url.pathname}${target.url.search}`,
    method: "GET",
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Encoding": "identity",
    },
    agent: false,
    family: pinned.family,
    lookup: pinnedLookup(target.connectHost, pinned),
    signal,
  };
  if (isHttps && !target.literal) {
    // SNI and certificate hostname verification use the URL hostname, not the pinned IP.
    options.servername = target.connectHost.endsWith(".") ? target.connectHost.slice(0, -1) : target.connectHost;
  }

  return new Promise<IncomingMessage>((resolve, reject) => {
    let req: ClientRequest;
    try {
      req = (isHttps ? httpsRequest : httpRequest)(options);
    } catch (error) {
      reject(new PublicFetchError("NETWORK", "Request setup failed", { cause: error }));
      return;
    }
    const onAbort = () => req.destroy();
    signal.addEventListener("abort", onAbort, { once: true });
    // The listener stays attached for the request's lifetime so late socket errors are handled.
    req.on("error", (error: unknown) => {
      signal.removeEventListener("abort", onAbort);
      reject(signal.aborted ? timeoutError() : new PublicFetchError("NETWORK", "Request failed", { cause: error }));
    });
    req.once("response", (res: IncomingMessage) => {
      res.once("close", () => signal.removeEventListener("abort", onAbort));
      resolve(res);
    });
    req.end();
  });
}

function readHtmlBody(res: IncomingMessage, signal: AbortSignal): Promise<string> {
  const encoding = String(res.headers["content-encoding"] || "identity").trim().toLowerCase();
  let decoder: Transform | null = null;
  if (encoding === "gzip" || encoding === "x-gzip") decoder = createGunzip();
  else if (encoding === "deflate") decoder = createInflate();
  else if (encoding === "br") decoder = createBrotliDecompress();
  else if (encoding !== "identity") {
    res.destroy();
    return Promise.reject(new PublicFetchError("UNSUPPORTED_ENCODING", "Unsupported content encoding"));
  }

  return new Promise<string>((resolve, reject) => {
    const text = new TextDecoder("utf-8");
    let html = "";
    let scannedChars = 0;
    let wireBytes = 0;
    let decodedBytes = 0;
    let inputEnded = false;
    let settled = false;

    const cleanup = () => {
      signal.removeEventListener("abort", onAbort);
      res.destroy();
      decoder?.destroy();
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      html += text.decode();
      cleanup();
      resolve(html);
    };
    const fail = (error: PublicFetchError) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onAbort = () => fail(timeoutError());
    const endInput = () => {
      if (inputEnded) return;
      inputEnded = true;
      if (decoder) decoder.end();
      else finish();
    };
    const onDecoded = (chunk: Buffer) => {
      if (settled) return;
      const room = PUBLIC_FETCH_MAX_HTML_BYTES - decodedBytes;
      const slice = chunk.length > room ? chunk.subarray(0, room) : chunk;
      decodedBytes += slice.length;
      html += text.decode(slice, { stream: true });
      // Scan only new text (plus a small overlap): rescanning everything per chunk is quadratic
      // and lets a server that sends tiny chunks burn CPU the deadline cannot interrupt.
      const foundHeadEnd = HEAD_END.test(html.slice(Math.max(0, scannedChars - HEAD_END_OVERLAP)));
      scannedChars = html.length;
      if (decodedBytes >= PUBLIC_FETCH_MAX_HTML_BYTES || foundHeadEnd) finish();
    };

    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });

    if (decoder) {
      decoder.on("data", onDecoded);
      decoder.on("end", finish);
      // A truncated compressed stream errors at end of input; keep what was decoded.
      decoder.on("error", (error: unknown) => {
        if (wireBytes >= PUBLIC_FETCH_MAX_HTML_BYTES) finish();
        else fail(new PublicFetchError("NETWORK", "Response decoding failed", { cause: error }));
      });
    }

    res.on("data", (chunk: Buffer) => {
      if (settled || inputEnded) return;
      const room = PUBLIC_FETCH_MAX_HTML_BYTES - wireBytes;
      const slice = chunk.length > room ? chunk.subarray(0, room) : chunk;
      wireBytes += slice.length;
      if (decoder) decoder.write(slice);
      else onDecoded(slice);
      if (!settled && wireBytes >= PUBLIC_FETCH_MAX_HTML_BYTES) {
        res.destroy();
        endInput();
      }
    });
    res.on("end", endInput);
    res.on("error", (error: unknown) => {
      if (inputEnded) return;
      fail(signal.aborted ? timeoutError() : new PublicFetchError("NETWORK", "Response failed", { cause: error }));
    });
    res.on("close", () => {
      if (!inputEnded) fail(signal.aborted ? timeoutError() : new PublicFetchError("NETWORK", "Response closed early"));
    });
  });
}

function isHtmlContentType(contentType: string): boolean {
  return contentType.includes("text/html") || contentType.includes("application/xhtml+xml");
}

export type PublicHtmlResult = {
  /** Last validated URL after redirects; use it as the base for relative links. */
  finalUrl: URL;
  status: number;
  contentType: string;
  /** Up to PUBLIC_FETCH_MAX_HTML_BYTES of decoded HTML, or null for non-2xx/non-HTML responses. */
  html: string | null;
};

export async function fetchPublicHtml(input: URL): Promise<PublicHtmlResult> {
  const signal = AbortSignal.timeout(PUBLIC_FETCH_DEADLINE_MS);
  let current = new URL(input.href);
  try {
    for (let redirects = 0; ; redirects++) {
      if (signal.aborted) throw timeoutError();
      const target = assertPublicHttpUrl(current);
      const pinned = await resolvePinnedAddress(target, signal);
      if (signal.aborted) throw timeoutError();
      const res = await withDeadline(sendRequest(target, pinned, signal), signal);
      const status = res.statusCode ?? 0;

      if (REDIRECT_STATUSES.has(status)) {
        const location = res.headers.location;
        res.destroy();
        if (redirects >= PUBLIC_FETCH_MAX_REDIRECTS) {
          throw new PublicFetchError("TOO_MANY_REDIRECTS", "Too many redirects");
        }
        if (!location) throw new PublicFetchError("BAD_REDIRECT", "Redirect without location");
        try {
          current = new URL(location, current);
        } catch {
          throw new PublicFetchError("BAD_REDIRECT", "Invalid redirect location");
        }
        continue;
      }

      const contentType = String(res.headers["content-type"] || "").toLowerCase();
      if (status < 200 || status >= 300 || !isHtmlContentType(contentType)) {
        res.destroy();
        return { finalUrl: current, status, contentType, html: null };
      }
      const html = await readHtmlBody(res, signal);
      return { finalUrl: current, status, contentType, html };
    }
  } catch (error) {
    if (error instanceof PublicFetchError) throw error;
    if (signal.aborted) throw timeoutError();
    throw new PublicFetchError("NETWORK", "Public fetch failed", { cause: error });
  }
}
