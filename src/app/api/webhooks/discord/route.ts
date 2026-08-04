import { NextRequest, NextResponse } from "next/server";
import { verifyKey, InteractionType, InteractionResponseType } from "discord-interactions";
import {
  handleFindTeamCommand,
  handleCreateTeamCommand,
  handleHackathonsCommand,
} from "@/lib/discordCommandHelper";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-signature-ed25519");
    const timestamp = req.headers.get("x-signature-timestamp");
    const publicKey = process.env.DISCORD_PUBLIC_KEY;

    // Verify signature if DISCORD_PUBLIC_KEY environment variable is configured
    if (publicKey) {
      if (!signature || !timestamp) {
        return new NextResponse("Missing signature headers", { status: 401 });
      }

      const isValid = await verifyKey(rawBody, signature, timestamp, publicKey);
      if (!isValid) {
        console.warn("[Discord Webhook] Invalid request signature.");
        return new NextResponse("Invalid request signature", { status: 401 });
      }
    }

    const interaction = JSON.parse(rawBody);

    // Type 1: PING from Discord Developer Portal
    if (interaction.type === InteractionType.PING) {
      return NextResponse.json({ type: InteractionResponseType.PONG });
    }

    // Type 2: APPLICATION_COMMAND (Slash Commands)
    if (interaction.type === InteractionType.APPLICATION_COMMAND) {
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
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `🤖 Command \`/${commandName}\` acknowledged by HackerMate.`,
        },
      });
    }

    return NextResponse.json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: "Unknown interaction type" },
    });
  } catch (error: any) {
    console.error("[Discord Webhook API Error]:", error);
    return NextResponse.json(
      {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: "⚠️ HackerMate Bot service temporarily unavailable." },
      },
      { status: 500 }
    );
  }
}
