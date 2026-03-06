import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  GuildMember,
  TextChannel,
  Collection,
  Message,
  Guild,
  Role,
  ChannelType,
} from "discord.js";

interface ClearResult {
  success: boolean;
  deletedCount: number;
  error?: string;
}

class PermissionValidator {
  private static readonly REQUIRED_ROLE_NAMES = ["Organizer", "Admin"];

  static hasPermission(member: GuildMember, guild: Guild): boolean {
    const allowedRoles = this.getAllowedRoles(guild);
    return this.memberHasAnyRole(member, allowedRoles);
  }

  static getErrorMessage(): string {
    const roleNames = this.REQUIRED_ROLE_NAMES.join(" or ");
    return `Only members with ${roleNames} role can use this command.`;
  }

  private static getAllowedRoles(guild: Guild): Role[] {
    return guild.roles.cache
      .filter(role => this.REQUIRED_ROLE_NAMES.includes(role.name))
      .map(role => role);
  }

  private static memberHasAnyRole(member: GuildMember, roles: Role[]): boolean {
    return roles.some(role => member.roles.cache.has(role.id));
  }
}

class MessageCleaner {
  private static readonly MAX_BULK_DELETE_AGE_MS =
    14 * 24 * 60 * 60 * 1000;

  static async clearMessages(
    channel: TextChannel,
    amount: number
  ): Promise<ClearResult> {
    try {
      const messages = await this.fetchMessages(channel, amount);

      if (messages.size === 0) {
        return {
          success: true,
          deletedCount: 0,
          error: "No messages found to delete.",
        };
      }

      const deletableMessages = this.filterDeletableMessages(messages);
      const deletedMessages = await channel.bulkDelete(
        deletableMessages,
        true
      );

      return {
        success: true,
        deletedCount: deletedMessages.size,
      };
    } catch (error) {
      console.error("Message deletion error:", error);
      return {
        success: false,
        deletedCount: 0,
        error: this.getErrorMessage(error),
      };
    }
  }

  private static async fetchMessages(
    channel: TextChannel,
    limit: number
  ): Promise<Collection<string, Message>> {
    return channel.messages.fetch({ limit });
  }

  private static filterDeletableMessages(
    messages: Collection<string, Message>
  ): Collection<string, Message> {
    const now = Date.now();

    return messages.filter(msg => {
      const messageAge = now - msg.createdTimestamp;
      return messageAge < this.MAX_BULK_DELETE_AGE_MS;
    });
  }

  private static getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      if (error.message.includes("Missing Permissions")) {
        return "Bot lacks permission to delete messages.";
      }
      if (error.message.includes("Unknown Channel")) {
        return "Channel no longer exists.";
      }
    }
    return "Failed to delete messages. Please try again.";
  }
}

class ClearCommandValidator {
  static validateContext(
    interaction: ChatInputCommandInteraction
  ): {
    valid: boolean;
    member?: GuildMember;
    guild?: Guild;
    channel?: TextChannel;
    error?: string;
  } {
    const guild = interaction.guild;
    const member = interaction.member as GuildMember | null;
    const channel = interaction.channel;

    if (!guild || !member) {
      return {
        valid: false,
        error: "This command must be used in a server.",
      };
    }

    if (!channel || channel.type !== ChannelType.GuildText) {
      return {
        valid: false,
        error: "This command can only be used in text channels.",
      };
    }

    return {
      valid: true,
      member,
      guild,
      channel,
    };
  }
}

class ClearCommandExecutor {
  static async execute(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const validation = ClearCommandValidator.validateContext(interaction);

    if (!validation.valid) {
      await interaction.reply({
        content: validation.error!,
        ephemeral: true,
      });
      return;
    }

    const { member, guild, channel } = validation;

    if (!PermissionValidator.hasPermission(member!, guild!)) {
      await interaction.reply({
        content: PermissionValidator.getErrorMessage(),
        ephemeral: true,
      });
      return;
    }

    const amount = interaction.options.getInteger("amount", true);

    await interaction.deferReply({ ephemeral: true });

    const result = await MessageCleaner.clearMessages(channel!, amount);

    if (result.success) {
      await interaction.editReply({
        content:
          result.deletedCount > 0
            ? `Successfully deleted ${result.deletedCount} message(s).`
            : result.error ?? "No messages deleted.",
      });
    } else {
      await interaction.editReply({
        content:
          result.error ??
          "An error occurred while deleting messages.",
      });
    }
  }
}

export const data = new SlashCommandBuilder()
  .setName("clear")
  .setDescription("Clear messages from a channel (Organizers only).")
  .addIntegerOption(option =>
    option
      .setName("amount")
      .setDescription("Number of messages to delete (1–50).")
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(50)
  );

export async function execute(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  await ClearCommandExecutor.execute(interaction);
}
