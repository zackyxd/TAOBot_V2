const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, Embed } = require("discord.js");
const path = require('path');
const Database = require('better-sqlite3');
const { QuickDB } = require("quick.db")
const fs = require('fs');
const API = require("../../API.js");
const { createSuccessEmbed, createExistEmbed, createErrorEmbed, createMaintenanceEmbed } = require('../../utilities/embedUtility.js');
const moment = require('moment-timezone');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ping-coleader")
    .setDescription("Set a coleader to be pinged in nudges")
    .addUserOption((option) =>
      option.setName("user").setDescription("@user to link").setRequired(true)
    )
    .addBooleanOption((option) =>
      option.setName("ping")
        .setDescription("Do you want it to ping a coleader or not?")
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "ping-coleader") return;
    await interaction.deferReply();

    const user = interaction.options.getMember("user");
    let setPing = interaction.options?.getBoolean('ping');
    const dbPath = path.join(__dirname, `../../../guildData/${interaction.guild.id}.sqlite`);
    const db = new QuickDB({ filePath: dbPath });

    let discordId = user.user.id;
    await db.set(`users.${discordId}.pingCo`, setPing);
    await interaction.editReply({ embeds: [createSuccessEmbed(`The user <@${discordId}> will now ${setPing ? "" : " __not__ "}get pings even if they are coleader or leader.`)] });
  }
}