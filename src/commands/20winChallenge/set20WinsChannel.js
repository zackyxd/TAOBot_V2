const API = require("../../API.js");
const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, Embed } = require("discord.js");
const path = require('path');
const Database = require('better-sqlite3');
const { QuickDB } = require("quick.db")
const fs = require('fs');
const { createSuccessEmbed, createExistEmbed, createErrorEmbed, createMaintenanceEmbed } = require('../../utilities/embedUtility.js');


module.exports = {
  data: new SlashCommandBuilder()
    .setName("20wins")
    .setDescription("Use this command to make this channel for 20 win challenges posts")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "20wins") return;
    await interaction.deferReply();

    const dbPath = API.findFileUpwards(__dirname, `guildData/${interaction.guild.id}.sqlite`);
    const db = new QuickDB({ filePath: dbPath });
    await db.set(`guilds.${interaction.guild.id}.20wins`, interaction.channel.id);

    await interaction.editReply({ embeds: [createSuccessEmbed(`This channel will now post 17-20 wins. Good luck!`)] })
    return;

  }
}