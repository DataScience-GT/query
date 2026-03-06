import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  ChannelType,
  TextChannel,
} from "discord.js";

class EventScheduler {
  private static readonly TIME_REGEX = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
  private static readonly EST_TIMEZONE = "America/New_York";

  static parseTime(timeStr: string): { hours: number; minutes: number } | null {
    if (!this.TIME_REGEX.test(timeStr)) return null;
    const [hours, minutes] = timeStr.split(":").map(Number);
    return { hours, minutes };
  }

  static calculateDelay(hours: number, minutes: number): number {
    const now = new Date();
    const nowEST = new Date(
      now.toLocaleString("en-US", { timeZone: this.EST_TIMEZONE })
    );

    const target = new Date(nowEST);
    target.setHours(hours, minutes, 0, 0);

    if (target < nowEST) {
      target.setDate(target.getDate() + 1);
    }

    return target.getTime() - nowEST.getTime();
  }

  static getUnixTimestamp(delayMs: number): number {
    return Math.floor((Date.now() + delayMs) / 1000);
  }
}

export const data = new SlashCommandBuilder()
  .setName("start")
  .setDescription("Announce or schedule an event")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addChannelOption(option =>
    option
      .setName("channel")
      .setDescription("Channel where the announcement will be sent")
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setRequired(false)
  )
  .addRoleOption(option =>
    option
      .setName("role")
      .setDescription("Role to notify when the event is announced")
      .setRequired(false)
  )
  .addStringOption(option =>
    option
      .setName("message")
      .setDescription("The announcement message")
      .setRequired(false) // Validation logic handles requirement to allow optional Role before required Message
  )
  .addStringOption(option =>
    option
      .setName("start_time")
      .setDescription("Scheduled start time in EST (HH:mm, 24-hour format)")
      .setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const targetChannel =
    (interaction.options.getChannel("channel") as TextChannel) ||
    (interaction.channel as TextChannel);
  const role = interaction.options.getRole("role");
  const messageContent = interaction.options.getString("message");
  const startTime = interaction.options.getString("start_time");

  if (!messageContent) {
    return interaction.reply({
      content: "You initiate a start command but didn't provide a message what is wrong with you?",
      ephemeral: true,
    });
  }

  const message = role ? `<@&${role.id}> ${messageContent}` : messageContent;

  const sendAnnouncement = async () => {
    try {
      await targetChannel.send(message);
      console.log(`Event announced in #${targetChannel.name}.`);
    } catch (err) {
      console.error("Failed to send announcement:", err);
    }
  };

  if (startTime) {
    const parsedTime = EventScheduler.parseTime(startTime);
    if (!parsedTime) {
      return interaction.reply({
        content: "Invalid time format. Please use 24-hour format (HH:mm).",
        ephemeral: true,
      });
    }

    const delay = EventScheduler.calculateDelay(
      parsedTime.hours,
      parsedTime.minutes
    );
    setTimeout(sendAnnouncement, delay);

    const fireUnix = EventScheduler.getUnixTimestamp(delay);

    return interaction.reply({
      content: `The event announcement has been scheduled for <t:${fireUnix}:t> EST (<t:${fireUnix}:R>).`,
      ephemeral: true,
    });
  }

  try {
    if (targetChannel.id !== interaction.channelId) {
      await sendAnnouncement();
      return interaction.reply({
        content: `The announcement has been sent to ${targetChannel}.`,
        ephemeral: true,
      });
    }

    await targetChannel.send(message);
    return interaction.reply({
      content: "Announcement sent!",
      ephemeral: true,
    });
  } catch (err) {
    return interaction.reply({
      content: "Unable to send the announcement. Please check my permissions.",
      ephemeral: true,
    });
  }
}
