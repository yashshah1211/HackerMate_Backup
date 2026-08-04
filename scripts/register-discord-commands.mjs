/**
 * HackerMate Discord Slash Command Registration Script
 * 
 * Usage:
 *   DISCORD_APPLICATION_ID="your_app_id" DISCORD_BOT_TOKEN="your_bot_token" node scripts/register-discord-commands.mjs
 */

const APP_ID = process.env.DISCORD_APPLICATION_ID;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

const COMMANDS = [
  {
    name: "find-team",
    description: "Search open hackathon teams on HackerMate by role or required skill",
    options: [
      {
        name: "role",
        description: "Filter by role needed (e.g. frontend, backend, designer, ai)",
        type: 3, // STRING
        required: false,
      },
      {
        name: "skill",
        description: "Filter by technology skill (e.g. react, python, supabase)",
        type: 3, // STRING
        required: false,
      },
    ],
  },
  {
    name: "create-team",
    description: "Create a new team on HackerMate and get an instant invite link",
  },
  {
    name: "hackathons",
    description: "Browse featured upcoming hackathons and team-building tracks on HackerMate",
  },
];

async function registerCommands() {
  if (!APP_ID || !BOT_TOKEN) {
    console.log("ℹ️  [HackerMate Discord Bot Command Spec]");
    console.log("-----------------------------------------");
    console.log(JSON.stringify(COMMANDS, null, 2));
    console.log("-----------------------------------------");
    console.log("💡 To register live with Discord API, set env vars:");
    console.log("   DISCORD_APPLICATION_ID=your_id DISCORD_BOT_TOKEN=your_token node scripts/register-discord-commands.mjs\n");
    return;
  }

  const url = `https://discord.com/api/v10/applications/${APP_ID}/commands`;

  console.log(`🚀 Registering ${COMMANDS.length} global slash commands for App ID: ${APP_ID}...`);

  try {
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bot ${BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(COMMANDS),
    });

    if (response.ok) {
      const data = await response.json();
      console.log("✅ Successfully registered commands:");
      data.forEach((cmd) => console.log(`   - /${cmd.name}: ${cmd.description}`));
    } else {
      const errorText = await response.text();
      console.error("❌ Failed to register commands:", response.status, errorText);
    }
  } catch (err) {
    console.error("❌ Error connecting to Discord API:", err);
  }
}

registerCommands();
