const { SlashCommandBuilder } = require('@discordjs/builders');
const { PermissionsBitField, PermissionFlagsBits } = require('discord.js');
const { createSuccessEmbed, createErrorEmbed } = require('../../utilities/embedUtility');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Timeout a member for 28 days')
    .addUserOption(option =>
      option.setName('target')
        .setDescription('The member to timeout')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "timeout") return;
    await interaction.deferReply();
    const member = interaction.options.getMember('target');

    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      return interaction.editReply({ content: '❌ You need the Moderate Members permission.', ephemeral: true });
    }

    if (!member.moderatable) {
      return interaction.editReply({ embeds: [createErrorEmbed(`❌ You cannot timeout ${member.user}`)] });
    }

    const ms = 2419000000;

    try {
      await member.timeout(ms, `Timed out by ${interaction.user.tag}`);
      await interaction.editReply({ embeds: [createSuccessEmbed(`${member.user} has been timed out for 28 days.`)] });
    } catch (err) {
      console.error(err);
      await interaction.editReply({ content: '❌ Failed to timeout the user.' });
    }
  }
};
