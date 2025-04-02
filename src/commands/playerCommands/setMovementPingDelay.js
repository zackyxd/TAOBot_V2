const API = require("../../API.js");
const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, Embed, PermissionsBitField } = require("discord.js");
const path = require('path');
const Database = require('better-sqlite3');
const { QuickDB } = require("quick.db")
const fs = require('fs');
const { createSuccessEmbed, createExistEmbed, createErrorEmbed, createMaintenanceEmbed } = require('../../utilities/embedUtility.js');
const { paginate } = require('../../../pagination.js');
const moment = require('moment-timezone');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("movement-pings-delay")
    .setDescription("Don't get pinged for movements until 12 afters before war starts.")
    .addBooleanOption(option =>
      option.setName("set")
        .setDescription("Set to true to delay movement pings, false to remove")
        .setRequired(true)
    )
    .addUserOption((option) =>
      option.setName("user").setDescription("Coleaders only. @user to set/unset permanent attacking late.").setRequired(false)
    ),
  // .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers),

  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "movement-pings-delay") return;
    await interaction.deferReply();

    const set = interaction.options.getBoolean('set');
    const member = interaction.options?.getMember("user");

    // Must have mute members permission to set others
    if (member && !interaction.memberPermissions.has(PermissionsBitField.Flags.MuteMembers)) {
      if (interaction.user.id !== member?.user.id) {
        await interaction.editReply({ embeds: [createErrorEmbed('You must be a coleader to change permanent attacking late of other users.')] });
        return;
      }
    }

    const db = await API.getDb(interaction.guild.id);

    let discordId = member?.user.id || interaction.user.id;
    await db.set(`users.${discordId}.movementPingsDelay`, set);
    await interaction.editReply({ embeds: [createSuccessEmbed(`The user <@${discordId}> now has movement pings delay set to ${set}.`)] });
  }
}
