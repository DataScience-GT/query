import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("meow")
  .setDescription("meow");

const cooldownUsers = new Set<string>();
const COOLDOWN_MS = 5000;

export async function execute(interaction: ChatInputCommandInteraction) {
  const userId = interaction.user.id;

  if (cooldownUsers.has(userId)) {
    await interaction.reply({
      content: "chill",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  cooldownUsers.add(userId);
  setTimeout(() => cooldownUsers.delete(userId), COOLDOWN_MS);

  const emoji = interaction.guild?.emojis.cache.find(e => e.name === "image");
  await interaction.reply({
    content: `no more MEOWS ${emoji ?? ""}`,
  });
}
