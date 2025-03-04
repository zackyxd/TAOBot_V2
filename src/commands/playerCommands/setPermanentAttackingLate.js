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
    .setName("set-permanent-attacking-late")
    .setDescription("Change yourself to be permanently attacking late to not get earlier nudges.")
    .addBooleanOption(option =>
      option.setName("set")
        .setDescription("Set to true if permanent attacking late, false to remove")
        .setRequired(true)
    )
    .addUserOption((option) =>
      option.setName("user").setDescription("Coleaders only. @user to set/unset permanent attacking late.").setRequired(false)
    ),
  // .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers),

  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "set-permanent-attacking-late") return;
    await interaction.deferReply();

    const set = interaction.options.getBoolean('set');
    const member = interaction.options?.getMember("user");

    // Must have mute members permission to set others
    console.log(member?.user.id);
    console.log(interaction.user.id);
    if (member && !interaction.memberPermissions.has(PermissionsBitField.Flags.MuteMembers)) {
      if (interaction.user.id !== member?.user.id) {
        await interaction.editReply({ embeds: [createErrorEmbed('You must be a coleader to change permanent attacking late of other users')] });
        return;
      }
    }

    const db = await API.getDb(interaction.guild.id);

    let discordId = member?.user.id || interaction.user.id;
    await db.set(`users.${discordId}.permanent-attacking-late`, set);
    await interaction.editReply({ embeds: [createSuccessEmbed(`The user <@${discordId}> now has permanent attacking late set to ${set}.`)] });
  }
}