const API = require("../../API.js");
const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, Embed } = require("discord.js");
const path = require('path');
const Database = require('better-sqlite3');
const { QuickDB } = require("quick.db")
const fs = require('fs');
const { createSuccessEmbed, createExistEmbed, createErrorEmbed, createMaintenanceEmbed } = require('../../utilities/embedUtility.js');



module.exports = {
  data: new SlashCommandBuilder()
    .setName("delete-clan")
    .setDescription("Delete a clan from your server.")
    .addStringOption(option =>
      option.setName("abbreviation")
        .setDescription("What is the abbreviation you want to delete?")
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "delete-clan") return;
    await interaction.deferReply();

    const abbrev = interaction.options.get("abbreviation").value.toLowerCase();

    const dbPath = API.findFileUpwards(__dirname, `guildData/${interaction.guild.id}.sqlite`);
    const db = new QuickDB({ filePath: dbPath });

    const clans = await db.get('clans');
    for (const clantag in clans) {
      if (clans[clantag].abbreviation === abbrev) {
        await interaction.editReply({ embeds: [createSuccessEmbed(`Successfully deleted the clan ${await db.get(`clans.${clantag}.clanName`)} from the server.`)] })
        try {
          await db.delete(`clans.${clantag}`);
          await db.delete(`clanData.${clantag}`);
          await db.delete(`raceDataAttacks.${clantag}`);
          await db.delete(`raceDataScore.${clantag}`);
          console.log("Deleted all clan data");
        } catch (error) {
          console.log("Error deleting clan from server", error);
        }
        return;
      }
    }
    await interaction.editReply({ embeds: [createErrorEmbed(`There was no clan with the abbreviation \`${abbrev}\` in the server.`)] })
  }
}

