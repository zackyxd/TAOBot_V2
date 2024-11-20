const API = require("../../API.js");
const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, Embed } = require("discord.js");
const path = require('path');
const Database = require('better-sqlite3');
const { QuickDB } = require("quick.db")
const fs = require('fs');
const { createSuccessEmbed, createExistEmbed, createErrorEmbed, createMaintenanceEmbed } = require('../../utilities/embedUtility.js');


module.exports = {
  data: new SlashCommandBuilder()
    .setName('make-family-clan')
    .setDescription("Set family clan for attackers")
    .addStringOption(option =>
      option.setName("abbreviations")
        .setDescription("Abbreviation(s) of clans")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "make-family-clan") return;
    await interaction.deferReply();
    let clanAbbrevs = interaction.options.getString("abbreviations");
    let clanList = clanAbbrevs.split(' ').map(clan => clan.trim().toLowerCase());
    console.log(clanList);

    const dbPath = API.findFileUpwards(__dirname, `guildData/${interaction.guild.id}.sqlite`);
    const db = new QuickDB({ filePath: dbPath });
    // Check if the abbreviation already exists
    const clans = await db.get(`clans`) || {};
    if (!clans) {
      await interaction.editReply({ embeds: [createErrorEmbed(`The abbreviation \`${abbrev}\` was not found linked to the server.`)] });
      return;
    }
    // const clantag = Object.keys(clans).find(tag => clans[tag].abbreviation === abbrev);

    let createdList = [];
    for (const [clantag, clanInfo] of Object.entries(clans)) {
      if (!clanList.includes(clanInfo.abbreviation)) continue;
      // console.log(clantag);
      await db.set(`clans.${clantag}.family-clan`, true);
      createdList.push(clanInfo.abbreviation);
    }

    await interaction.editReply({ embeds: [createSuccessEmbed(`Made ${createdList.join(',')} into family clans`)] });



  }


}