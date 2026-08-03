import {
  Client,
  GatewayIntentBits,
  CommandInteraction,
  StringSelectMenuInteraction,
  GuildMember,
  Interaction,
  REST,
  Routes,
  InteractionReplyOptions,
} from "discord.js";
import { env } from "./env.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface BotCommand {
  data: { name: string; toJSON: () => unknown };
  execute(interaction: CommandInteraction): Promise<void>;
  handleSelectMenu?(interaction: StringSelectMenuInteraction): Promise<void>;
  handleButton?(interaction: Interaction): Promise<void>;
}

class Bot {
  private readonly client: Client;
  private readonly commands: BotCommand[] = [];

  constructor() {
    this.client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
    });

    this.client.once("ready", () => {});

    this.client.on("interactionCreate", (i) => this.handleInteraction(i));
  }

  async start(): Promise<void> {
    await this.loadCommands();
    await this.registerCommands();
    await this.client.login(env.DISCORD_BOT_TOKEN);
  }

  private async loadCommands(): Promise<void> {
    const commandsDir = path.join(__dirname, "commands");
    if (!fs.existsSync(commandsDir)) return;

    const files = fs
      .readdirSync(commandsDir)
      .filter((f) => f.endsWith(".ts") || f.endsWith(".js"));

    for (const file of files) {
      const filePath = path.join(commandsDir, file);
      const { pathToFileURL } = await import("node:url");
      const fileUrl = pathToFileURL(filePath).href;

      try {
        const mod = await import(fileUrl);
        // Commands use named exports: data, execute, etc.
        const command = mod as BotCommand;

        if (command?.data && typeof command.execute === "function") {
          this.commands.push(command);
        } else {
          console.warn(
            `  [WARNING] Skipping ${file}: Missing 'data' or 'execute' exports`,
          );
        }
      } catch (err) {
        console.error(`  [ERROR] Failed to load ${file}:`, err);
      }
    }
  }

  private async registerCommands(): Promise<void> {
    if (this.commands.length === 0) return;

    const rest = new REST({ version: "10" }).setToken(env.DISCORD_BOT_TOKEN);
    const body = this.commands.map((c) => c.data.toJSON());

    try {
      await rest.put(
        Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.GUILD_ID),
        { body },
      );
    } catch (err) {
      console.error("[ERROR] Failed to register commands:", err);
    }
  }

  private async handleInteraction(interaction: Interaction): Promise<void> {
    try {
      if (interaction.isChatInputCommand()) {
        return await this.handleSlashCommand(interaction);
      }
      if (interaction.isStringSelectMenu()) {
        return await this.handleSelectMenu(interaction);
      }
      if (interaction.isButton()) {
        return await this.handleButtonPress(interaction);
      }
    } catch (err) {
      console.error("Unhandled interaction error:", err);
    }
  }

  private async handleSlashCommand(
    interaction: CommandInteraction,
  ): Promise<void> {
    const command = this.commands.find(
      (c) => c.data.name === interaction.commandName,
    );
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (err) {
      console.error(`Error in /${interaction.commandName}:`, err);
      const payload: InteractionReplyOptions = {
        content: "[WARNING] Something went wrong executing that command.",
        ephemeral: true,
      };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload);
      } else {
        await interaction.reply(payload);
      }
    }
  }

  private async handleSelectMenu(
    interaction: StringSelectMenuInteraction,
  ): Promise<void> {
    const commandName = interaction.customId.split("_")[0];
    const command = this.commands.find((c) => c.data.name === commandName);

    if (!command?.handleSelectMenu) return;

    try {
      await command.handleSelectMenu(interaction);
    } catch (err) {
      console.error("Select menu error:", err);
      if (!interaction.replied) {
        await interaction.reply({
          content: "[WARNING] Menu interaction failed.",
          ephemeral: true,
        });
      }
    }
  }

  private async handleButtonPress(interaction: Interaction): Promise<void> {
    if (!interaction.isButton()) return;

    // First check for role buttons (handled inline)
    if (interaction.customId.startsWith("role_")) {
      const roleId = interaction.customId.replace("role_", "");
      const member = interaction.member;

      if (!(member instanceof GuildMember)) return;

      const role = interaction.guild?.roles.cache.get(roleId);
      if (!role) {
        await interaction.reply({
          content: "Role not found.",
          ephemeral: true,
        });
        return;
      }

      try {
        if (member.roles.cache.has(roleId)) {
          await member.roles.remove(roleId);
          await interaction.reply({
            content: `Removed **${role.name}**.`,
            ephemeral: true,
          });
        } else {
          await member.roles.add(roleId);
          await interaction.reply({
            content: `Added **${role.name}**.`,
            ephemeral: true,
          });
        }
      } catch {
        await interaction.reply({
          content: "Missing permissions to manage that role.",
          ephemeral: true,
        });
      }
      return;
    }

    // Then delegate to command handlers
    const commandWithButton = this.commands.find(
      (c) => typeof c.handleButton === "function",
    );
    if (commandWithButton?.handleButton) {
      try {
        await commandWithButton.handleButton(interaction);
      } catch (err) {
        console.error("Button error:", err);
        if (!interaction.replied) {
          await interaction.reply({
            content: "[WARNING] Button interaction failed.",
            ephemeral: true,
          });
        }
      }
    }
  }
}

// Graceful shutdown
const bot = new Bot();

process.on("SIGINT", () => {
  process.exit(0);
});

process.on("SIGTERM", () => {
  process.exit(0);
});

bot
  .start()
  .then(() => {
    // Start dummy HTTP server for Cloud Run health checks
    const port = process.env.PORT || 8080;
    const server = http.createServer((req, res) => {
      res.writeHead(200);
      res.end("Discord Bot is running");
    });
    server.listen(port, () => {});
  })
  .catch((err) => {
    console.error("Fatal startup error:", err);
    process.exit(1);
  });
