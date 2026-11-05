// Binary magic-byte signature validation to prevent disguised malware or fake extensions

export function validateMagicBytes(buffer: Buffer, claimedMime: string): { isValid: boolean; detectedType?: string } {
  if (!buffer || buffer.length < 4) {
    return { isValid: false };
  }

  const hex = buffer.subarray(0, 12).toString("hex").toUpperCase();
  const mime = claimedMime.toLowerCase();

  // PNG: 89 50 4E 47
  if (hex.startsWith("89504E47")) {
    return { isValid: mime === "image/png" || mime === "image/webp", detectedType: "image/png" };
  }

  // JPEG: FF D8 FF
  if (hex.startsWith("FFD8FF")) {
    return { isValid: mime === "image/jpeg" || mime === "image/jpg" || mime === "image/webp", detectedType: "image/jpeg" };
  }

  // GIF: 47 49 46 38
  if (hex.startsWith("47494638")) {
    return { isValid: mime === "image/gif", detectedType: "image/gif" };
  }

  // WebP: RIFF (52 49 46 46) .... WEBP (57 45 42 50)
  if (hex.startsWith("52494646") && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    return { isValid: mime === "image/webp", detectedType: "image/webp" };
  }

  // WebM / Matroska (Audio/Video): 1A 45 DF A3
  if (hex.startsWith("1A45DFA3")) {
    return { isValid: mime.includes("webm") || mime.includes("matroska"), detectedType: "audio/webm" };
  }

  // Ogg Audio: 4F 67 67 53 (OggS)
  if (hex.startsWith("4F676753")) {
    return { isValid: mime.includes("ogg"), detectedType: "audio/ogg" };
  }

  // MP4 / M4A: starts with ftyp (at byte 4..8)
  if (buffer.length >= 8 && buffer.subarray(4, 8).toString("ascii") === "ftyp") {
    return { isValid: mime.includes("mp4") || mime.includes("m4a"), detectedType: "audio/mp4" };
  }

  // WAV: RIFF (52 49 46 46) .... WAVE (57 41 56 45)
  if (hex.startsWith("52494646") && buffer.length >= 12 && buffer.subarray(8, 12).toString("ascii") === "WAVE") {
    return { isValid: mime.includes("wav"), detectedType: "audio/wav" };
  }

  // ID3 or an MPEG audio frame header, including CRC and MPEG 2/2.5 variants.
  // Check sync, reserved version/layer, bitrate and sampling-frequency bits.
  const mpegFrame = buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0 &&
    (buffer[1] & 0x18) !== 0x08 && (buffer[1] & 0x06) !== 0 &&
    (buffer[2] & 0xF0) !== 0xF0 && (buffer[2] & 0x0C) !== 0x0C;
  if (hex.startsWith("494433") || mpegFrame) {
    return { isValid: mime.includes("mpeg") || mime.includes("mp3"), detectedType: "audio/mpeg" };
  }

  // An allowlisted MIME claim is not evidence of a recognized media format.
  return { isValid: false };
}
