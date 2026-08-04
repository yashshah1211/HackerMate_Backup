import { NextRequest, NextResponse } from "next/server";
import nacl from "tweetnacl";
import {
  handleFindTeamCommand,
  handleCreateTeamCommand,
  handleHackathonsCommand,
} from "@/lib/discordCommandHelper";

function verifyDiscordSignature(
  body: string,
  signature: string | null,
  timestamp: string | null,
  publicKey: string
): boolean {
  if (!signature || !timestamp || !publicKey) return false;

  try {
    const isVerified = nacl.sign.detached.verify(
      Buffer.from(timestamp + body),
      Buffer.from(signature, "hex"),
      Buffer.from(publicKey, "hex")
    );
    return isVerified;
  } catch (err) {
    console.error("[Discord Webhook] nacl signature verification error:", err);
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-signature-ed25519");
    const timestamp = req.headers.get("x-signature-timestamp");
    const publicKey = (process.env.DISCORD_PUBLIC_KEY || "").trim();

    // Verify signature if DISCORD_PUBLIC_KEY is configured
    if (publicKey) {
      const isValid = verifyDiscordSignature(rawBody, signature, timestamp, publicKey);
      if (!isValid) {
        console.warn("[Discord Webhook] Invalid request signature.");
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

    return NextResponse.json({
      type: 4,
      data: { content: "Unknown interaction type" },
    });
  } catch (error: any) {
    console.error("[Discord Webhook API Error]:", error);
    return NextResponse.json(
      {
        type: 4,
        data: { content: "⚠️ HackerMate Bot service temporarily unavailable." },
      },
      { status: 500 }
    );
  }
}
