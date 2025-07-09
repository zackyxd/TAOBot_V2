const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder, EmbedBuilder, ActionRowBuilder, Embed, ButtonBuilder, ButtonStyle } = require("discord.js");
const path = require('path');
const Database = require('better-sqlite3');
const { QuickDB } = require("quick.db")
const fs = require('fs');
const API = require("../../API.js");
const { createSuccessEmbed, createExistEmbed, createErrorEmbed, createMaintenanceEmbed } = require('../../utilities/embedUtility.js');




module.exports = {
  data: new SlashCommandBuilder()
    .setName("csv-players")
    .setDescription("Show who is linked to a specific playertag if available")
    .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers),

  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "csv-players") return;
    await interaction.deferReply();

    let db = await API.getDb(interaction.guild.id);
    const users = await db.get("users");
    if (!users) return;

    let csvFile = csvMaker(users);

    fs.writeFile("players.csv", csvFile, (err) => {
      if (err) throw err;
    })
    const attachment = new AttachmentBuilder(API.findFileUpwards(__dirname, "players.csv"));
    await interaction.editReply({ files: [attachment] })

  }
}

function csvMaker(data) {
  let csvRows = ["Tag,Discord ID"]; // Start with the header row

  for (let [discordId, value] of Object.entries(data)) {
    if (value?.playertags && value.playertags.length > 0) { // Ensure playertags exist and are valid
      for (let tag of value.playertags) {
        csvRows.push(`${tag},${discordId}`); // Use the key (discordId) directly
      }
    }
  }

  const csvContent = csvRows.join("\n");
  return csvContent;
}

