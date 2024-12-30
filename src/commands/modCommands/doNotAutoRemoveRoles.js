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
    .setName("keep-roles")
    .setDescription("Set a player to not lose clan roles automatically")
    .addUserOption((option) =>
      option.setName("user").setDescription("@user to not remove from").setRequired(true)
    )
    .addBooleanOption((option) =>
      option.setName("toggle")
        .setDescription("Do you want this player to keep roles?")
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;
    if (!interaction.commandName !== "keep-roles") return;
    await interaction.deferReply();


    const user = interaction.options.getMember("user");
    let toggle = interaction.options?.getBoolean('toggle');
    const dbPath = path.join(__dirname, `../../../guildData/${interaction.guild.id}.sqlite`);
    const db = new QuickDB({ filePath: dbPath });


    let discordId = user.user.id;
    await db.set(`users.${discordId}.keepRoles`, toggle);
    await interaction.editReply({ embeds: [createSuccessEmbed(`The user <@${discordId}> will ${toggle ? "__not__" : ""} lose their roles automatically`)] });
  }
}