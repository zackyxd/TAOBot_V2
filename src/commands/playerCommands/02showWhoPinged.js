const API = require("../../API.js");
const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, Embed } = require("discord.js");
const path = require('path');
const Database = require('better-sqlite3');
const { QuickDB } = require("quick.db")
const fs = require('fs');
const { createSuccessEmbed, createExistEmbed, createErrorEmbed, createMaintenanceEmbed } = require('../../utilities/embedUtility.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("who-pinged")
    .setDescription("Show the users who pinged Replace Me or Attacking Late"),


  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "who-pinged") return;
    await interaction.deferReply();

    const dbPath = API.findFileUpwards(__dirname, `guildData/${interaction.guild.id}.sqlite`);
    const db = new QuickDB({ filePath: dbPath });

    let pingData = await db.get(`users`) || {};
    let guildData = await db.get(`guilds.${interaction.guild.id}`);

    let attackingLatePlayers = [];
    let replaceMePlayers = [];

    let addedPlayerTags = new Set();
    // Iterate through each key in the JSON object
    for (const key in pingData) {
      if (pingData.hasOwnProperty(key)) {
        const player = pingData[key];


        if (player['replace-me']) {

          // Add each playertag to the attackingLatePlayertags array
          // player.playertags.forEach(async tag => {
          if (Array.isArray(player.playertags)) {
            for (const tag of player.playertags) {
              if (addedPlayerTags.has(tag)) continue;
              let crAccount = await API.getPlayer(tag);
              let name = crAccount.name;
              let clan = crAccount?.clan?.tag || "No Clan";
              replaceMePlayers.push({ playertag: tag, name: name, clan: clan });
              addedPlayerTags.add(tag);
            }
          }
        }
        // Check if the player has the 'attacking-late' property set to true
        if (player['attacking-late']) {
          if (Array.isArray(player.playertags)) {
            // Add each playertag to the attackingLatePlayertags array
            // player.playertags.forEach(async tag => {
            for (const tag of player.playertags) {
              if (addedPlayerTags.has(tag)) continue;
              let crAccount = await API.getPlayer(tag);
              let name = crAccount.name;
              let clan = crAccount?.clan?.tag || "No Clan";
              attackingLatePlayers.push({ playertag: tag, name: name, clan: clan });
              addedPlayerTags.add(tag);
            }
          }
        }
      }
    }

    // console.log(attackingLatePlayers);
    // Fetch and sort clans by name
    const clans = await db.get(`clans`) || {};
    const sortedClans = Object.values(clans).sort((a, b) => b.clanName.localeCompare(a.clanName));

    let clanMap = new Map();

    sortedClans.forEach(clan => {
      clanMap.set(clan.clantag, { clanName: clan.clanName, attackingLatePlayers: [], replaceMePlayers: [] });
    });

    // Entry for "Other Clan"
    clanMap.set("Other", { clanName: "Other", attackingLatePlayers: [], replaceMePlayers: [] });

    const addAttackingLatePlayersToClan = (players, clanMap) => {
      players.forEach(player => {
        if (clanMap.has(player.clan)) {
          clanMap.get(player.clan).attackingLatePlayers.push(player);
        }
        else {
          clanMap.get("Other").attackingLatePlayers.push(player);
        }
      });
    };
    const addReplaceMePlayersToClan = (players, clanMap) => {
      players.forEach(player => {
        if (clanMap.has(player.clan)) {
          clanMap.get(player.clan).replaceMePlayers.push(player);
        }
        else {
          clanMap.get("Other").replaceMePlayers.push(player);
        }
      });
    };

    // Add attacking late players to the appropriate clan
    addAttackingLatePlayersToClan(attackingLatePlayers, clanMap);

    // Add replace me players to the appropriate clan
    addReplaceMePlayersToClan(replaceMePlayers, clanMap);

    // Create the message
    let message = "";

    // Add attacking late players to the message
    let attackingLateMessage = `<@&${guildData['attacking-late']}>\n`;
    let hasAttackingLatePlayers = false;
    clanMap.forEach((clan, clanTag) => {
      if (clan.attackingLatePlayers.length > 0) {
        hasAttackingLatePlayers = true;
        attackingLateMessage += `__**${clan.clanName}**__\n`;
        clan.attackingLatePlayers.forEach(player => {
          attackingLateMessage += `[${player.name}](<https://royaleapi.com/player/${(player.playertag).substring(1)}>)\n`;
        });
        attackingLateMessage += `\n`;
      }
    });

    if (hasAttackingLatePlayers) {
      message += attackingLateMessage;
    }

    // Add replace me players to the message
    let replaceMeMessage = `<@&${guildData['replace-me']}>\n`;
    let hasReplaceMePlayers = false;
    clanMap.forEach((clan, clanTag) => {
      if (clan.replaceMePlayers.length > 0) {
        hasReplaceMePlayers = true;
        replaceMeMessage += `__**${clan.clanName}**__\n`;
        clan.replaceMePlayers.forEach(player => {
          replaceMeMessage += `[${player.name}](<https://royaleapi.com/player/${(player.playertag).substring(1)}>)\n`;
        });
        replaceMeMessage += `\n`;
      }
    });

    if (hasReplaceMePlayers) {
      message += replaceMeMessage;
    }

    // Send the message
    if (message === '') {
      const embed = new EmbedBuilder()
        .setColor('Purple')
        // late
        .setDescription("No one has pinged any roles yet.")
      interaction.editReply({ embeds: [embed] });
      return;
    }
    let iconUrl = process.env.BOT_IMAGE
    const embed = new EmbedBuilder()
      .setColor('Purple')
      // late
      .setDescription(message)
      .setThumbnail(iconUrl);
    interaction.editReply({ embeds: [embed] });
    return;

  }
}

