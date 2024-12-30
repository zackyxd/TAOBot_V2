const API = require("../../API.js");
const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder, EmbedBuilder, ActionRowBuilder, Embed, ButtonBuilder, ButtonStyle } = require("discord.js");
const path = require('path');
const Database = require('better-sqlite3');
const { QuickDB } = require("quick.db")
const fs = require('fs');
const { createSuccessEmbed, createExistEmbed, createErrorEmbed, createMaintenanceEmbed } = require('../../utilities/embedUtility.js');
const { paginate } = require('../../../pagination.js');


module.exports = {
  data: new SlashCommandBuilder()
    .setName("check-merged-accounts")
    .setDescription("Show merged accounts and who they are linked to")
    .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers),

  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "check-merged-accounts") return;
    await interaction.deferReply();

    const dbPath = path.join(__dirname, `../../../guildData/${interaction.guild.id}.sqlite`);
    const db = new QuickDB({ filePath: dbPath });

    let mergedAccounts = await db.get('mergedPlayers');
    if (!mergedAccounts) {
      await interaction.editReply({ embeds: [createErrorEmbed("No merged accounts have been created yet")] });
      return;
    }

    let memberPromises = [];
    for (const account of mergedAccounts) {
      memberPromises.push(processMember(account, db));
    }
    const memberResults = await Promise.all(memberPromises);
    await showList(interaction, memberResults);
    return;
  }
}

const processMember = async (account, db) => {
  try {
    // let member = await db.get(`mergedPlayers.${discordId}`);
    let player = await API.getPlayer(account.playertag);
    return { playerName: player.name, "discordId": account.discordId, "playertag": account.playertag }
  }
  catch (error) {
    console.error("Error processing member:", error);
    return null;
  }
}

async function showList(interaction, members) {
  const sortedMembers = members.filter(member => member).sort((a, b) => a.playerName.localeCompare(b.playerName));
  // Define column widths for padding 
  const playerNameWidth = Math.max(...sortedMembers.map(member => member.playerName.length)) + 2; // Extra space for padding 
  const playertagWidth = Math.max(...sortedMembers.map(member => member.playertag.length)) + 2;
  // Prepare data with padding for writing to file 
  const data = sortedMembers.map(member => `${member.playerName.padEnd(playerNameWidth, ' ')} : ${member.playertag.padEnd(playertagWidth, ' ')} : ${member.discordId}`).join('\n');
  const memberCount = sortedMembers.length;

  fs.writeFile("checkMergedPlayers.txt", data, (err) => {
    if (err) throw err;
  })
  const attachment = new AttachmentBuilder(API.findFileUpwards(__dirname, "checkMergedPlayers.txt"));
  await interaction.editReply({ embeds: [createSuccessEmbed(`There are \`${memberCount}\` members merged!`)], files: [attachment] });
}
