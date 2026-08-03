import {
  SlashCommandBuilder,
  CommandInteraction,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  StringSelectMenuInteraction,
  EmbedBuilder,
} from "discord.js";
import { getFullGuide, GuideSections } from "../notion.js";

class Guide {
  private static CACHE_TTL = 1000 * 60 * 10;
  private static cache: GuideSections | null = null;
  private static timestamp = 0;

  static async getSections(): Promise<GuideSections> {
    const now = Date.now();
    if (!this.cache || now - this.timestamp > this.CACHE_TTL) {
      this.cache = await getFullGuide();
      this.timestamp = now;
    }
    return this.cache;
  }

  static getSelectMenuOptions(sections: GuideSections) {
    return Object.keys(sections)
      .slice(0, 25)
      .map((label) => ({
        label: label.substring(0, 100),
        value: label.substring(0, 100),
      }));
  }

  static formatContent(lines?: string[]): string {
    if (!lines || lines.length === 0) return "";
    let text = lines.join("\n\n");
    if (text.length > 4090) text = text.substring(0, 4090);
    return text;
  }
}

export const data = new SlashCommandBuilder()
  .setName("guide")
  .setDescription("full hacklytics guide");

export async function execute(interaction: CommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const sections = await Guide.getSections();
  const options = Guide.getSelectMenuOptions(sections);

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("guide_select")
      .setPlaceholder("Select a topic")
      .addOptions(options),
  );

  await interaction.editReply({
    content: "Select a topic.",
    components: [row],
  });
}

export async function handleSelectMenu(
  interaction: StringSelectMenuInteraction,
) {
  await interaction.deferUpdate();

  const selection = interaction.values[0];
  const sections = await Guide.getSections();
  const content = Guide.formatContent(sections[selection]);

  const embed = new EmbedBuilder()
    .setTitle(selection)
    .setDescription(content)
    .setColor(0x0099ff)
    .setFooter({ text: "Hacklytics Documentation" });

  await interaction.editReply({
    embeds: [embed],
    components: interaction.message.components,
  });
}
