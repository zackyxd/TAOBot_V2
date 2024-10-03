const API = require("../../API.js");
const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, Embed } = require("discord.js");
const path = require('path');
const Database = require('better-sqlite3');
const { QuickDB } = require("quick.db")
const fs = require('fs');
const { createSuccessEmbed, createExistEmbed, createErrorEmbed, createMaintenanceEmbed } = require('../../utilities/embedUtility.js');
const { paginate } = require('../../../pagination.js');
const moment = require('moment-timezone');


module.exports = {
  data: new SlashCommandBuilder()
    .setName("force-attacking-late")
    .setDescription("Set someone to as if they pinged attacking late")
    .addUserOption((option) =>
      option.setName("user").setDescription("@user to link").setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers),

  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "force-attacking-late") return;
    await interaction.deferReply();

    const user = interaction.options.getMember("user");
    const dbPath = path.join(__dirname, `../../../guildData/${interaction.guild.id}.sqlite`);
    const db = new QuickDB({ filePath: dbPath });

    let discordId = user.user.id;
    await db.set(`users.${discordId}.attacking-late`, true);
    await interaction.editReply({ embeds: [createSuccessEmbed(`Successfully made the user <@${discordId}> attacking late.`)] });
  }
}