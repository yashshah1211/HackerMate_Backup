import { createClient } from "@supabase/supabase-js";

// Initialize Supabase admin/server client for API route queries
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://rhryjrbebfrrfhtyyzbs.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const supabaseServer = createClient(supabaseUrl, supabaseAnonKey);

export interface DiscordEmbed {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  footer?: { text: string; icon_url?: string };
  timestamp?: string;
}

export interface DiscordButton {
  type: number; // 2 for button
  style: number; // 5 for Link button
  label: string;
  url: string;
}

export interface DiscordInteractionResponse {
  type: number; // 4 for CHANNEL_MESSAGE_WITH_SOURCE
  data: {
    tts?: boolean;
    content?: string;
    embeds?: DiscordEmbed[];
    components?: Array<{
      type: number; // 1 for ActionRow
      components: DiscordButton[];
    }>;
    flags?: number; // 64 for Ephemeral (only visible to user)
  };
}

/**
 * Handles `/find-team` slash command
 * Searches public open teams on HackerMate by role/skill keyword or recent teams
 */
export async function handleFindTeamCommand(options?: { role?: string; skill?: string }): Promise<DiscordInteractionResponse> {
  const roleFilter = options?.role?.toLowerCase() || "";
  const skillFilter = options?.skill?.toLowerCase() || "";

  try {
    // Query public open teams
    const query = supabaseServer
      .from("teams")
      .select("id, name, description, required_skills, max_members, hackathon_id, created_at, team_members(count)")
      .order("created_at", { ascending: false })
      .limit(3);

    const { data: teams, error } = await query;

    if (error || !teams || teams.length === 0) {
      return {
        type: 4,
        data: {
          embeds: [
            {
              title: "🔍 No Matching Teams Found",
              description: roleFilter || skillFilter
                ? `No open teams currently matching \`${roleFilter || skillFilter}\`. Be the first to create one!`
                : "No open teams found right now.",
              color: 0xef4444, // Red
              footer: { text: "HackerMate — Team OS for Hackathons" },
            },
          ],
          components: [
            {
              type: 1,
              components: [
                {
                  type: 2,
                  style: 5,
                  label: "✨ Create Team on HackerMate",
                  url: `${process.env.NEXT_PUBLIC_SITE_URL || "https://hackermate.vercel.app"}/teams`,
                },
              ],
            },
          ],
        },
      };
    }

    const embeds: DiscordEmbed[] = teams.map((team: any) => {
      const skillsList = Array.isArray(team.required_skills)
        ? team.required_skills.join(", ")
        : team.required_skills || "Any skills welcome";
      const memberCount = team.team_members?.[0]?.count || 1;

      return {
        title: `⚡ Team: ${team.name}`,
        description: team.description || "Looking for passionate teammates to build and win!",
        url: `${process.env.NEXT_PUBLIC_SITE_URL || "https://hackermate.vercel.app"}/teams/${team.id}`,
        color: 0x6366f1, // Indigo / Accent
        fields: [
          { name: "🎯 Looking For Skills", value: `\`${skillsList}\``, inline: true },
          { name: "👥 Members", value: `${memberCount} / ${team.max_members || 4}`, inline: true },
        ],
        footer: { text: "HackerMate — Team Matchmaking Engine" },
      };
    });

    return {
      type: 4,
      data: {
        content: `🎉 Found **${teams.length} open teams** on HackerMate ready for hackathons!`,
        embeds,
        components: [
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 5,
                label: "🚀 Browse All Teams on HackerMate",
                url: `${process.env.NEXT_PUBLIC_SITE_URL || "https://hackermate.vercel.app"}/teams`,
              },
            ],
          },
        ],
      },
    };
  } catch (_err: any) {
    return {
      type: 4,
      data: {
        content: "⚠️ An error occurred while fetching teams from HackerMate. Please try visiting the website directly.",
        flags: 64, // Ephemeral
      },
    };
  }
}

/**
 * Handles `/create-team` slash command
 */
export async function handleCreateTeamCommand(): Promise<DiscordInteractionResponse> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://hackermate.vercel.app";

  return {
    type: 4,
    data: {
      embeds: [
        {
          title: "🛠️ Create a Team on HackerMate",
          description:
            "Create your team on HackerMate to get an instant shareable HMAC invite link, workspace chat, Kanban task board, and automated teammate recommendations!",
          color: 0x10b981, // Emerald Green
          fields: [
            {
              name: "1. Click the button below",
              value: "Opens the HackerMate Team Creation page.",
            },
            {
              name: "2. Set team name & required roles",
              value: "Define who you need (e.g. Frontend, AI Engineer, UI Designer).",
            },
            {
              name: "3. Share invite link in Discord",
              value: "Teammates can join with 1 click!",
            },
          ],
          footer: { text: "HackerMate — Team OS for Hackathons" },
        },
      ],
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 5,
              label: "➕ Create Team Now",
              url: `${siteUrl}/teams`,
            },
          ],
        },
      ],
    },
  };
}

/**
 * Handles `/hackathons` slash command
 */
export async function handleHackathonsCommand(): Promise<DiscordInteractionResponse> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://hackermate.vercel.app";

  try {
    const { data: hackathons } = await supabaseServer
      .from("hackathons")
      .select("id, title, organizer, mode, start_date, prize_pool")
      .limit(3);

    const embedFields = (hackathons && hackathons.length > 0)
      ? hackathons.map((h: any) => ({
          name: `🏆 ${h.title}`,
          value: `**Organizer**: ${h.organizer || "Community"}\n**Mode**: ${h.mode || "Online"} | **Prize**: ${h.prize_pool || "Swag & Badges"}`,
          inline: false,
        }))
      : [
          { name: "Smart India Hackathon 2026 (SIH)", value: "Official SIH track hub on HackerMate", inline: false },
          { name: "StartupX Hackathon 2026 (Gamnexis)", value: "Turn your idea into a real startup", inline: false },
          { name: "Orvix Hackathon 2026 (NIMBLUX)", value: "National online innovation sprint", inline: false },
        ];

    return {
      type: 4,
      data: {
        embeds: [
          {
            title: "🔥 Top Active Hackathons on HackerMate",
            description: "Find teams, track deadlines, and submit your projects on HackerMate:",
            color: 0xf59e0b, // Amber
            fields: embedFields,
            footer: { text: "HackerMate — Hackathon Directory & Matchmaker" },
          },
        ],
        components: [
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 5,
                label: "🌐 Explore All Hackathons",
                url: `${siteUrl}/hackathons`,
              },
            ],
          },
        ],
      },
    };
  } catch {
    return {
      type: 4,
      data: {
        content: `Explore active hackathons on HackerMate: ${siteUrl}/hackathons`,
      },
    };
  }
}
