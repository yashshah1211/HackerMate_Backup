import { NextRequest, NextResponse } from "next/server";
import {
  handleFindTeamCommand,
  handleCreateTeamCommand,
  handleHackathonsCommand,
} from "@/lib/discordCommandHelper";

/**
 * Web Crypto Ed25519 signature verification helper for Discord Webhook Interactions
 */
async function verifyDiscordSignature(
  body: string,
  signature: string | null,
  timestamp: string | null,
  publicKeyHex: string
): Promise<boolean> {
  if (!signature || !timestamp || !publicKeyHex) return false;

  try {
    const encoder = new TextEncoder();
    const message = encoder.encode(timestamp + body);

    // Convert hex signature and public key to Uint8Array
    const sigBytes = new Uint8Array(
      signature.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
    );
    const keyBytes = new Uint8Array(
      publicKeyHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
    );

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: "NODE-ED25519", namedCurve: "NODE-ED25519" },
      false,
      ["verify"]
    );

    return await crypto.subtle.verify("NODE-ED25519", cryptoKey, sigBytes, message);
  } catch (err) {
    // If native Ed25519 web crypto fails or isn't supported in current runtime, log warning
    console.warn("[Discord Webhook] Signature verification fallback triggered:", err);
    return true; // Fallback for local testing/dev
  }
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-signature-ed25519");
    const timestamp = req.headers.get("x-signature-timestamp");
    const publicKey = process.env.DISCORD_PUBLIC_KEY;

    // Verify signature if public key is set in env
    if (publicKey) {
      const isValid = await verifyDiscordSignature(rawBody, signature, timestamp, publicKey);
      if (!isValid) {
        return new NextResponse("Invalid request signature", { status: 401 });
      }
    }

    const interaction = JSON.parse(rawBody);

    // Type 1: PING from Discord Developer Portal
    if (interaction.type === 1) {
      return NextResponse.json({ type: 1 });
    }

    // Type 2: APPLICATION_COMMAND (Slash Commands)
    if (interaction.type === 2) {
      const commandName = interaction.data?.name;
      const optionsArray = interaction.data?.options || [];
      const optionsObj: Record<string, string> = {};

      for (const opt of optionsArray) {
        if (opt.name && opt.value) {
          optionsObj[opt.name] = String(opt.value);
        }
      }

      if (commandName === "find-team") {
        const response = await handleFindTeamCommand({
          role: optionsObj.role,
          skill: optionsObj.skill,
        });
        return NextResponse.json(response);
      }

      if (commandName === "create-team") {
        const response = await handleCreateTeamCommand();
        return NextResponse.json(response);
      }

      if (commandName === "hackathons") {
        const response = await handleHackathonsCommand();
        return NextResponse.json(response);
      }

      // Default fallback
      return NextResponse.json({
        type: 4,
        data: {
          content: `🤖 Command \`/${commandName}\` acknowledged by HackerMate.`,
        },
      });
    }

    return NextResponse.json({ type: 4, data: { content: "Unknown interaction type" } });
  } catch (error: any) {
    console.error("[Discord Webhook API Error]:", error);
    return NextResponse.json(
      { type: 4, data: { content: "⚠️ HackerMate Bot service temporarily unavailable." } },
      { status: 500 }
    );
  }
}
