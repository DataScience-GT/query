import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  Role,
  Interaction,
  GuildMember,
  GuildMemberRoleManager,
  MessageFlags,
} from "discord.js";

const BLOCKED_ROLES = ["Organizer", "Admin", "Judge", "Staff", "Sponsors"];

const roleEmojis: Record<string, string> = {
  Announcements: "[A]",
  Workshops: "[W]",
  Food: "[F]",
  Mentor: "[M]",
  Volunteer: "[V]",
  Hacker: "[H]",
};

export const data = new SlashCommandBuilder()
  .setName("roles")
  .setDescription("Set assignable roles")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles);

export async function execute(interaction: CommandInteraction) {
  const member = interaction.member as GuildMember;

  if (!member) {
    return interaction.reply({
      content: "Cannot verify your permissions.",
      flags: MessageFlags.Ephemeral,
    });
  }

  // Check if user is admin
  if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({
      content: "Only administrators can run this command.",
      flags: MessageFlags.Ephemeral,
    });
  }

  const guild = interaction.guild;
  if (!guild) {
    return interaction.reply({
      content: "This command must be used in a server.",
      flags: MessageFlags.Ephemeral,
    });
  }

  const botMember = guild.members.me!;
  const assignableRoles: Role[] = guild.roles.cache
    .filter(
      (r) =>
        r.editable &&
        !r.managed &&
        r.id !== guild.id &&
        r.position < botMember.roles.highest.position &&
        !BLOCKED_ROLES.includes(r.name),
    )
    .sort((a, b) => b.position - a.position)
    .first(25);

  if (!assignableRoles.length) {
    return interaction.reply({
      content: "No assignable roles found.",
      flags: MessageFlags.Ephemeral,
    });
  }

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

  assignableRoles.forEach((role) => {
    const prefix = roleEmojis[role.name] || "[*]";
    const button = new ButtonBuilder()
      .setCustomId(`role_${role.id}`)
      .setLabel(`${prefix} ${role.name}`)
      .setStyle(ButtonStyle.Primary);
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(button));
  });

  await interaction.reply({
    content: "Click a button to toggle its role:",
    components: rows,
    flags: MessageFlags.Ephemeral,
  });
}

export async function handleButton(interaction: Interaction) {
  if (!interaction.isButton() || !interaction.guild || !interaction.member)
    return;

  const memberRoles = (interaction.member as GuildMember)
    .roles as GuildMemberRoleManager;
  const roleId = interaction.customId.replace("role_", "");
  const role = interaction.guild.roles.cache.get(roleId);

  if (!role) {
    return interaction.reply({
      content: "Role not found.",
      flags: MessageFlags.Ephemeral,
    });
  }

  try {
    if (memberRoles.cache.has(role.id)) {
      await memberRoles.remove(role);
      await interaction.reply({
        content: `Removed ${role.name}`,
        flags: MessageFlags.Ephemeral,
      });
    } else {
      await memberRoles.add(role);
      await interaction.reply({
        content: `Added ${role.name}`,
        flags: MessageFlags.Ephemeral,
      });
    }
  } catch {
    await interaction.reply({
      content: "Failed to update role.",
      flags: MessageFlags.Ephemeral,
    });
  }
}
