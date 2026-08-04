import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import {
  handleFindTeamCommand,
  handleCreateTeamCommand,
  handleHackathonsCommand,
} from "@/lib/discordCommandHelper";

/**
 * Standard Node.js Ed25519 signature verification for Discord Webhook Interactions
 */
function verifyDiscordSignature(
  body: string,
  signature: string | null,
  timestamp: string | null,
  publicKeyHex: string
): boolean {
  if (!signature || !timestamp || !publicKeyHex) return false;

  try {
    const key = crypto.createPublicKey({
      key: Buffer.concat([
        Buffer.from("302a300506032b6570032100", "hex"), // SPKI DER prefix for Ed25519
        Buffer.from(publicKeyHex, "hex"),
      ]),
      format: "der",
      type: "spki",
    });

    const message = Buffer.from(timestamp + body);
    const sigBuffer = Buffer.from(signature, "hex");

    return crypto.verify(null, message, key, sigBuffer);
  } catch (err) {
    console.error("[Discord Webhook] Signature verification error:", err);
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-signature-ed25519");
    const timestamp = req.headers.get("x-signature-timestamp");
    const publicKey = process.env.DISCORD_PUBLIC_KEY;

    // Verify signature if DISCORD_PUBLIC_KEY environment variable is configured
    if (publicKey) {
      const isValid = verifyDiscordSignature(rawBody, signature, timestamp, publicKey);
      if (!isValid) {
        console.warn("[Discord Webhook] Signature verification failed.");
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
