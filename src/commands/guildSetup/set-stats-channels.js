const API = require("../../API.js");
const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, Embed } = require("discord.js");
const path = require('path');
const Database = require('better-sqlite3');
const { QuickDB } = require("quick.db")
const fs = require('fs');
const { createSuccessEmbed, createExistEmbed, createErrorEmbed, createMaintenanceEmbed } = require('../../utilities/embedUtility.js');


module.exports = {
  data: new SlashCommandBuilder()
    .setName("set-stats-channel")
    .setDescription("Set a channel to send these stats to? ")
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('Which channel should these stats be sent to?')
        .setRequired(true))
    .addStringOption(option =>
      option.setName("abbreviation")
        .setDescription("What is the abbreviation for this clan? If not selected will be for default.")
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "set-stats-channel") return;
    await interaction.deferReply();

    const abbrev = interaction.options.get("abbreviation")?.value?.toLowerCase();
    let channel = interaction.options.getChannel("channel");
    if (channel.type !== 0) {
      await interaction.editReply({ embeds: [createErrorEmbed("Please make sure the channel is a text channel.")] });
      return;
    }

    const dbPath = API.findFileUpwards(__dirname, `guildData/${interaction.guild.id}.sqlite`);
    const db = new QuickDB({ filePath: dbPath });

    // Check if the abbreviation already exists
    const clans = await db.get(`clans`) || {};
    const existingAbbrev = Object.values(clans).find(clan => clan.abbreviation === abbrev);
    const checkOldClantag = Object.keys(clans).find(tag => clans[tag].abbreviation === abbrev);

    console.log(existingAbbrev);
    console.log(checkOldClantag);
    if (!checkOldClantag) {
      await interaction.editReply({ embeds: [createErrorEmbed(`There is no linked clan with abbreviation \`${abbrev}\``)] });
      return;
    }

    await db.set(`stats.${existingAbbrev.abbreviation}`, {
      statsChannel: channel.id
    })
    await interaction.editReply({ embeds: [createSuccessEmbed(`The channel for \`${existingAbbrev.abbreviation}\` player stats will be sent to <#${channel.id}>`)] });
    return
  }

}