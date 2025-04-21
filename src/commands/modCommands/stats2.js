const { google } = require('googleapis');
require('dotenv/config');
const { Events, PermissionsBitField, EmbedBuilder, Embed, SlashCommandBuilder, PermissionFlagsBits, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { QuickDB } = require('quick.db');
const API = require("../../API.js");
const { createSuccessEmbed, createErrorEmbed, createExistEmbed } = require('../../utilities/embedUtility.js');
const path = require('path');
const fs = require('fs');
const { updateWarCategory } = require('../../../updateWarCategory.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("stats")
    .setDescription("Give the roles based off last weeks. Uses AFAM Stats Sheet.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "stats") return;
    await interaction.deferReply();
    await interaction.editReply({ embeds: [createExistEmbed("Currently running... please don't run again.")] });
    await updateWarCategory(interaction.guild.id); // Update war category for all clans

    let roles5k = [
      // tao
      { id: '1136109175026487357', threshold: 220 },
      { id: '1056433107596742667', threshold: 210 },
      { id: '1056433100420284437', threshold: 200 },
      { id: '1056432944408973372', threshold: 190 },

      // my server
      // { id: '1262436128074760192', threshold: 220 },
      // { id: '1262415129669144628', threshold: 210 },
      // { id: '1262415183901364225', threshold: 200 },
      // { id: '1279636890080772106', threshold: 190 },
    ];

    let roles4k = [
      // tao
      { id: '1280599632262729779', threshold: 220 },
      { id: '1056432341322584104', threshold: 210 },
      { id: '1056432268345876610', threshold: 200 },
      { id: '1056428973418098708', threshold: 190 },
      // my server
      // { id: '1279868941379833856', threshold: 210 },
      // { id: '1279868899466285166', threshold: 200 },
      // { id: '1279868840712474645', threshold: 190 },
    ];

    const colosseumRoles = [
      // { id: '1361870679364075621', threshold: 3600 }, // My server 3600
      // { id: '1361870471515082772', threshold: 3500 }, // My server 3500
      // { id: '1361870889980788756', threshold: 3400 }, // My server 3400

      { id: '1214408787306348594', threshold: 3600 }, // TAO server
      { id: '1214408358204022805', threshold: 3500 },
      { id: '1214198156460429363', threshold: 3400 },
    ];

    const db = await API.getDb(interaction.guild.id);
    await db.set(`confirmationData`, {});
    const clans = await db.get("clans");
    const playertags = await db.get("playertags");

    // Add to lookup table to make sure the clan is correct category
    let lookupTableClanTrophies = new Map();
    for (const key in clans) {
      const clan = clans[key];
      addEntry(lookupTableClanTrophies, clan.abbreviation, clan.warCategory);
    }

    // Check 4k and 5k sheets and grab data
    let rows5;
    let rows4;
    try {
      rows5 = await readSheet(5); // Grab 5k sheet
      rows4 = await readSheet(4);
    } catch (error) {
      console.error('Error reading sheet:', error);
      return;
    }

    let warWeek = "Week ?-?";
    try {
      let rrData = await API.getRiverRaceLog(`#9U82JJ0Y`);
      if (rrData) {
        let firstItem = rrData.items[0];
        warWeek = `Week ${firstItem.seasonId}-${firstItem.sectionIndex + 1}`;
      }
    } catch (error) {
      console.log("No rr data");
      await interaction.editReply({ embeds: [createErrorEmbed(`No RR data, stats didn't work, contact Zacky :(`)] });
      return;
    }

    const groups5k = buildPlayerData(rows5, "5k", lookupTableClanTrophies);
    const groups4k = buildPlayerData(rows4, "4k", lookupTableClanTrophies);

    await checkClanStats(interaction, groups5k, db, clans, playertags, roles5k, warWeek);
    await checkClanStats(interaction, groups4k, db, clans, playertags, roles4k, warWeek);

    console.log("Is it colosseum?", await isColosseum())
    if (await isColosseum()) {
      await giveColoRoles(interaction, db, groups5k, playertags, colosseumRoles, warWeek);
    }

    await interaction.editReply({ embeds: [createSuccessEmbed('Sent stats to their leadership channels!')] });



  }
}

async function giveColoRoles(interaction, db, groups5k, playertags, colosseumRoles, warWeek) {
  // Loop through all clans

  let colosseumRoleGroups = {};
  colosseumRoles.forEach(role => {
    colosseumRoleGroups[role.id] = [];
  });

  for (let [clan, players] of Object.entries(groups5k)) {
    for (const player of players) {
      const highestRole = colosseumRoles.find(role => player.lastRaceScore >= role.threshold); // Ensure role matches player's fame average
      if (!highestRole) continue;
      // Check if the user is linked
      try {
        const user = playertags[player.playertag];
        if (!user) continue;

        const discordId = user.discordId;
        if (!discordId) continue; // Ensure user has a Discord ID and wants to earn roles

        // Fetch member and check roles
        try {
          const member = await interaction.guild.members.fetch(discordId);
          if (await member.roles.cache.has(highestRole.id) || colosseumRoles.some(role => member.roles.cache.has(role.id) && role.threshold >= highestRole.threshold)) {
            // console.log(player.playerName + " already has the highest role");
            continue;
          }

          // Add the player directly to the role group
          console.log("Adding player to roleGroups with role id:", player.playerName, highestRole.id);
          colosseumRoleGroups[highestRole.id].push({ discordId, playerName: player.playerName, lastRaceScore: player.lastRaceScore });

        } catch (error) {
          console.log("Member not found in guild", discordId, error);
          continue;
        }
      } catch (error) {
        console.log("Error linking user:", error);
        continue;
      }

    }
  }

  try {
    await db.set(`roleAssignments.coloRoles`, colosseumRoleGroups);
    // console.log(colosseumRoleGroups);
  } catch (error) {
    console.log("Error updating database:", error);
  }

  let description = "";
  for (const [roleId, players] of Object.entries(colosseumRoleGroups)) {
    if (players.length > 0) {
      // Sort by fame
      players.sort((a, b) => b.lastRaceScore - a.lastRaceScore);
      description += `<@&${roleId}>\n${players.map(player => `<@${player.discordId}> (${player.playerName})`).join(`\n`)}\n\n`;
    }
  }

  // No new colo roles
  if (!description) {
    description += "No new roles earned.";
    // Send Message to leader channels
    let embed = new EmbedBuilder()
      .setTitle(`5k Colosseum Roles`)
      .setColor("Purple")
      .setDescription(description)
      .setFooter({ text: `Colosseum ${warWeek}` });

    try {
      let coleaderChannel = await db.get(`guilds.${interaction.guild.id}.coleaderChannelId`);
      const channel = await interaction.client.channels.fetch(coleaderChannel);
      await channel.send({ embeds: [embed] }); // UNCOMMENT
      // await channel.send({ embeds: [embed], components: [buttonRow] });
    } catch (error) {
      console.log("Couldn't send colosseum new roles to the coleader channel", error);
    }
    return;
  }

  let embed = new EmbedBuilder()
    .setTitle(`5k Colosseum Roles`)
    .setColor("Purple")
    .setDescription(description)
    .setFooter({ text: `Colosseum ${warWeek}` });

  let sendButton = new ButtonBuilder()
    .setCustomId(`confirmRoles_colo`)
    .setLabel("Confirm & Send")
    .setStyle(ButtonStyle.Primary)

  const buttonRow = new ActionRowBuilder().addComponents(sendButton);

  try {
    let coleaderChannel = await db.get(`guilds.${interaction.guild.id}.coleaderChannelId`);
    const channel = await interaction.client.channels.fetch(coleaderChannel);
    await channel.send({ embeds: [embed], components: [buttonRow] });
  } catch (error) {
    console.log("Couldn't send new roles to channel", error);
  }




}


async function checkClanStats(interaction, groups, db, clans, playertags, roles, warWeek) {

  // Loop through all clans
  for (let [clan, players] of Object.entries(groups)) {
    const findStatsChannel = await db.get(`stats.${clan.toLowerCase()}`); // Find where to send these stats to
    if (!findStatsChannel) continue;

    const clantag = Object.keys(clans).find(tag => clans[tag].abbreviation.toLowerCase() === clan.toLowerCase()); // Find clantag of clan
    if (!clantag) continue;
    const leaderClanChannelId = clans[clantag]?.importantChannel; // Get channel Id where to send embed to confirm
    let clanName = clans[clantag]?.clanName || "Other"; // Get clan name
    let clanAbbrev = clans[clantag]?.abbreviation || "N/A";

    let roleGroups = await checkPlayers(interaction, db, players, playertags, roles, clanAbbrev); // Role groups is how players are grouped by their roles earned

    let description = "";
    for (const [roleId, players] of Object.entries(roleGroups)) {
      if (players.length > 0) {
        // Sort by fame
        players.sort((a, b) => b.fameAverage - a.fameAverage);
        description += `<@&${roleId}>\n${players.map(player => `<@${player.discordId}> (${player.playerName})`).join(`\n`)}\n\n`;
      }
    }

    if (!description) {
      description += "No new roles earned.";
      // Send Message to leader channels
      let embed = new EmbedBuilder()
        .setTitle(`${clanName}`)
        .setColor("Purple")
        .setDescription(description)
        .setFooter({ text: warWeek })

      try {
        const channel = await interaction.client.channels.fetch(leaderClanChannelId);
        await channel.send({ embeds: [embed] }); // UNCOMMENT
        // await channel.send({ embeds: [embed], components: [buttonRow] });
      } catch (error) {
        console.log("Couldn't send new roles to channel", leaderClanChannelId, clanName);
      }
      continue;
    }

    let embed = new EmbedBuilder()
      .setTitle(`${clanName}`)
      .setColor("Purple")
      .setDescription(description)
      .setFooter({ text: warWeek })

    let sendButton = new ButtonBuilder()
      .setCustomId(`confirmRoles_${clan}`)
      .setLabel("Confirm & Send")
      .setStyle(ButtonStyle.Primary)

    const buttonRow = new ActionRowBuilder().addComponents(sendButton);

    try {
      const channel = await interaction.client.channels.fetch(leaderClanChannelId);
      await channel.send({ embeds: [embed], components: [buttonRow] });
    } catch (error) {
      console.log("Couldn't send new roles to channel",);
    }

  }
}

async function checkPlayers(interaction, db, players, playertags, roles, clanAbbrev) {

  const dontPingIds = ['927534279725047878']; // For users that don't want to earn roles
  let roleGroups = {};
  roles.forEach(role => {
    roleGroups[role.id] = [];
  });

  for (const player of players) {
    const highestRole = roles.find(role => player.fameAverage >= role.threshold); // Ensure role matches player's fame average
    if (!highestRole) continue;
    if (player.last3Wars.length < 3) continue; // Check if the player has participated in at least 3 wars
    if (player.last3Wars.reduce((sum, war) => sum + war.attacks, 0) < 32) continue; // Check if the player has made 32 attacks

    // Check if the user is linked
    try {
      const user = playertags[player.playertag];
      if (!user) continue;

      const discordId = user.discordId;
      if (!discordId || dontPingIds.includes(discordId)) continue; // Ensure user has a Discord ID and wants to earn roles

      // Fetch member and check roles
      try {
        const member = await interaction.guild.members.fetch(discordId);
        if (await member.roles.cache.has(highestRole.id) || roles.some(role => member.roles.cache.has(role.id) && role.threshold >= highestRole.threshold)) {
          console.log(player.playerName + " already has the highest role");
          continue;
        }

        // Add the player directly to the role group
        console.log("Adding player to roleGroups", player.playerName, highestRole.id);
        roleGroups[highestRole.id].push({ discordId, playerName: player.playerName, fameAverage: player.fameAverage });

      } catch (error) {
        console.log("Member not found in guild", discordId, error);
        continue;
      }
    } catch (error) {
      console.log("Error linking user:", error);
      continue;
    }
  }

  try {
    await db.set(`roleAssignments.${clanAbbrev}`, roleGroups);
  } catch (error) {
    console.log("Error updating database:", error);
  }

  return roleGroups;
}


function buildPlayerData(rows, category, lookupTableClanTrophies) {
  const groups = {};
  rows.forEach(row => {
    const playertag = "#" + row[0];
    const playerName = row[1];
    const lastClan = row[2];
    const fameAverage = parseFloat(row[3]);
    const fameData = row.slice(4);
    const lastRaceScore = row[4];
    const last3Wars = [];
    for (let i = 0; i < fameData.length; i += 2) {
      const fame = parseInt(fameData[i]);
      const attacks = parseInt(fameData[i + 1]);
      if (!isNaN(fame) && !isNaN(attacks)) {
        last3Wars.push({ fame, attacks });
        if (last3Wars.length >= 3) break;
      }
    }
    const playerData = { playertag, playerName, lastClan, fameAverage, last3Wars, lastRaceScore };
    let key;
    const lookupValue = getValue(lookupTableClanTrophies, lastClan);
    if (category === lookupValue) {
      key = lastClan ? lastClan.toLowerCase() : "unknown";
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(playerData);
    }
    else {
      groups["unknown"] = groups["unknown"] || [];
      groups["unknown"].push(playerData);
    }
  });

  // console.log(groups); // Debug final groups
  return groups;
}





async function readSheet(group) {
  const sheets = google.sheets('v4');
  let credentials;
  try {
    credentials = JSON.parse(process.env.STATSCREDENTIALS);
  } catch (error) {
    console.error('Error parsing JSON:', error);
    return;
  }

  const auth = new google.auth.GoogleAuth({
    credentials: credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  // Create client instance for auth
  const client = await auth.getClient();

  // Instance of Google Sheets API
  const googleSheets = google.sheets({ version: 'v4', auth: client });

  const spreadsheetId = '1b8BgwkPZ2cUgUvy_2r5zISCSxG207qtIf7re3sVL8x0';
  // Get data about spreadsheet
  const metaData = await googleSheets.spreadsheets.get({
    auth,
    spreadsheetId,
  });

  const response = await sheets.spreadsheets.values.get({
    auth,
    spreadsheetId,
    range: `'${group}k Averages'!A1:ZZ1000`, // Adjust the range and sheet name as needed
  });

  const rows = response.data.values;
  if (rows.length) {
    // console.log('Data:', rows);
    return rows;
  } else {
    console.log('No data found.');
    return [];
  }
}

function addEntry(lookupTable, key, value) {
  lookupTable.set(key, value);
}

function getValue(lookupTable, key) {
  return lookupTable.get(key.toLowerCase());
}

async function isColosseum(clantag = "#9U82JJ0Y") {
  let riverRaceLog = await API.getRiverRaceLog(clantag); // Check RR log for the current section index to check week
  let currentRace = await API.getCurrentRiverRace(clantag) // Check current race to see which week we currently are in
  let rrLogWeek = riverRaceLog.items[0].sectionIndex;
  let currentRaceWeek = currentRace.sectionIndex;
  if (currentRaceWeek === rrLogWeek + 1) {
    return false;
  }
  return true;
}