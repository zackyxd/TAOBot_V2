const API = require("../../API.js");
const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, Embed } = require("discord.js");
const path = require('path');
const Database = require('better-sqlite3');
const { QuickDB } = require("quick.db")
const fs = require('fs');
const { createSuccessEmbed, createExistEmbed, createErrorEmbed, createMaintenanceEmbed } = require('../../utilities/embedUtility.js');


module.exports = {
  data: new SlashCommandBuilder()
    .setName("set-clanlogs-channel")
    .setDescription("What is the channel you want for this clan's log?")
    .addStringOption(option =>
      option.setName("abbreviation")
        .setDescription("Abbreviation of the clan to log")
        .setRequired(true)
    )
    .addChannelOption(option =>
      option.setName("channel")
        .setDescription("Channel these logs will go to")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "set-clanlogs-channel") return;
    await interaction.deferReply();
    let abbrev = interaction.options.get("abbreviation").value.toLowerCase();
    let channel = interaction.options.getChannel("channel");
    if (channel.type !== 0) {
      await interaction.editReply({ embeds: [createErrorEmbed("Please make sure the channel is a text channel.")] });
      return;
    }

    const dbPath = API.findFileUpwards(__dirname, `guildData/${interaction.guild.id}.sqlite`);
    const db = new QuickDB({ filePath: dbPath });
    // Check if the abbreviation already exists
    const clans = await db.get(`clans`) || {};
    if (!clans) {
      await interaction.editReply({ embeds: [createErrorEmbed(`The abbreviation \`${abbrev}\` was not found linked to the server.`)] });
      return;
    }
    const clantag = Object.keys(clans).find(tag => clans[tag].abbreviation === abbrev);

    if (!clantag) {
      await interaction.editReply({ embeds: [createErrorEmbed(`The abbreviation \`${abbrev}\` is not linked to the server.`)] });
      return;
    }


    await db.set(`clans.${clantag}.clanlogsChannel`, channel.id);
    await interaction.editReply({ embeds: [createSuccessEmbed(`Clan logs will now be posted to <#${channel.id}>. They will begin when the next cycle starts.`)] })
    return;

  }
}