const { google } = require('googleapis');
require('dotenv/config');
const { Events, PermissionsBitField, EmbedBuilder, Embed, SlashCommandBuilder, PermissionFlagsBits, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { QuickDB } = require('quick.db');
const API = require("../../API.js");
const { createSuccessEmbed, createErrorEmbed, createExistEmbed } = require('../../utilities/embedUtility.js');
const path = require('path');
const fs = require('fs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("stats")
    .setDescription("Give the roles based off the AFAM Stats Sheet")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),


  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "stats") return;
    await interaction.deferReply();

    const dbPath = API.findFileUpwards(__dirname, `guildData/${interaction.guild.id}.sqlite`);
    const db = new QuickDB({ filePath: dbPath });

    await db.set(`confirmationData`, {});
    // 5k roles
    let rolesSheet5 = [
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

    let rolesSheet4 = [
      // tao
      { id: '1056432341322584104', threshold: 210 },
      { id: '1056432268345876610', threshold: 200 },
      { id: '1056428973418098708', threshold: 190 },
      // my server
      // { id: '1279868941379833856', threshold: 210 },
      // { id: '1279868899466285166', threshold: 200 },
      // { id: '1279868840712474645', threshold: 190 },
    ];

    let rows;
    try {
      rows5 = await readSheet(5);
      rows4 = await readSheet(4)
    } catch (error) {
      await interaction.editReply({ embeds: [createErrorEmbed(`Error with command, ping Zacky`)] });
      return;
    }
    const combinedRows = [...rows5.slice(1), ...rows4.slice(1)];
    // const players = rows.slice(1);
    const playerGroups = {};
    let count = 0;
    combinedRows.forEach(row => {
      const playertag = row[0];
      const playerName = row[1];
      const lastClan = row[2];
      const fameAverage = parseFloat(row[3]);
      const fameData = row.slice(4);
      const last3Wars = [];
      console.log(lastClan);

      for (let i = 0; i < fameData.length; i += 2) {
        const fame = parseInt(fameData[i]);
        const attacks = parseInt(fameData[i + 1]);
        if (!isNaN(fame) && !isNaN(attacks)) {
          last3Wars.push({ fame, attacks });
          if (last3Wars.length >= 3) break;
        }
      }

      const playerData = { playertag, playerName, lastClan, fameAverage, last3Wars };


      if (!lastClan) {
        if (!playerGroups[`Unknown`]) playerGroups[`Unknown`] = [];
        playerGroups[`Unknown`].push(playerData);
      }
      else {
        if (!playerGroups[lastClan]) playerGroups[lastClan] = [];
        playerGroups[lastClan].push(playerData);
      }
    });

    const clans = await db.get(`clans`) || {};
    let noClanFoundEntries = []; // Step 1: Create a list to store "No Clan Found" entries
    let defaultChannel = '1279888447808737340'; // default coleader channel
    let warWeek = "Week ?-?";
    try {
      let rrData = await API.getRiverRaceLog(`#9U82JJ0Y`);
      if (rrData) {
        let firstItem = rrData.items[0];
        warWeek = `Week ${firstItem.seasonId}-${firstItem.sectionIndex + 1}`;
      }
    } catch (error) {
      console.log("No rr data");
    }
    // Track processed clans
    const processedClans = new Set();

    const processSheet = async (roles, playerGroups, warCategory) => {

      for (let [clan, players] of Object.entries(playerGroups)) {
        if (processedClans.has(clan)) continue; // Skip if the clan has already been processed

        let roleGroups = {};
        roles.forEach(role => {
          roleGroups[role.id] = [];
        });

        clan = clan.toLowerCase(); // abbrev
        let findStatsChannel = await db.get(`stats.${clan}`);
        // console.log(findStatsChannel, clan);
        if (!findStatsChannel) continue;
        const clantag = Object.keys(clans).find(tag => clans[tag].abbreviation === clan);
        const channel = await db.get(`clans.${clantag}`);

        let channelId = channel?.importantChannel || defaultChannel; // hard coded default channel
        // if (!channelId) continue;
        // let description = `Players who reached an average score of ${minAverageScore} or more:\n`;
        // const clantag = Object.keys(clans).find(tag => clans[tag].abbreviation === clan);
        let clanDb = await db.get(`clans.${clantag}.clanName`);
        let clanName = clanDb || "Other";
        console.log(clanName);
        let playerHighestRoles = {};

        const clanWarCategory = clans[clantag]?.warCategory;
        console.log(`Processing clan: ${clan}, Clantag: ${clantag}, War Category: ${clanWarCategory}`); // Debugging statement
        if (clanWarCategory !== warCategory) continue; // Skip if the war category doesn't match

        for (const player of players) {

          const highestRole = roles.find(role => player.fameAverage >= role.threshold);
          if (!highestRole) continue;

          // Check if the player has 36 or more attacks
          const totalAttacks = player.last3Wars.reduce((sum, war) => sum + war.attacks, 0);
          if (totalAttacks < 28) continue;
          // console.log(player.playerName, totalAttacks);

          try {
            let user = await db.get(`playertags.#${player.playertag}`);
            if (!user) continue;
            let discordId = user.discordId;
            if (!discordId) continue;
            let member = await interaction.guild.members.fetch(discordId);

            // User has the highest role available already, skip
            if (await member.roles.cache.has(highestRole) || roles.some(role => member.roles.cache.has(role.id) && role.threshold >= highestRole.threshold)) {
              // console.log(player.playerName + " already has the highest role");
              continue;
            }

            // Step 2: Populate the dictionary with players
            if (!playerHighestRoles[discordId] || playerHighestRoles[discordId].threshold < highestRole.threshold) {
              playerHighestRoles[discordId] = { role: highestRole, playerName: player.playerName, fameAverage: player.fameAverage };
            }
            // await db.set(`roleAssignments.${clan}`, roleGroups)


          } catch (error) {
            // console.log(error);
          }
        }

        for (const [discordId, { role, playerName, fameAverage }] of Object.entries(playerHighestRoles)) {
          roleGroups[role.id].push({ discordId, playerName, fameAverage });
        }

        try {
          await db.set(`roleAssignments.${clan}`, roleGroups);
        } catch (error) {
          console.log("Error updating database:", error);
        }


        let description = "";
        for (const [roleId, players] of Object.entries(roleGroups)) {
          if (players.length > 0) {
            // sort by fame
            players.sort((a, b) => b.fameAverage - a.fameAverage);
            description += `<@&${roleId}>\n${players.map(player => `<@${player.discordId}> (${player.playerName})`).join(`\n`)}\n\n`;
          }
        }


        if (clanName === "Other") {
          console("Other");
          for (const [roleId, players] of Object.entries(roleGroups)) {
            if (players.length > 0) {
              if (!noClanFoundEntries[roleId]) {
                noClanFoundEntries[roleId] = [];
              }
              noClanFoundEntries[roleId].push(...players);
            }
          }
        } else {
          if (!description) {
            description += "No new roles earned.";
            // Send Message to leader channels
            let embed = new EmbedBuilder()
              .setTitle(`${clanName}`)
              .setColor("Purple")
              .setDescription(description)
              .setFooter({ text: warWeek })

            // let refreshButton = new ButtonBuilder()
            //   .setCustomId(`refreshStats_${clan}`)
            //   .setEmoji("🔃")
            //   .setStyle(ButtonStyle.Secondary);

            // const buttonRow = new ActionRowBuilder().addComponents(refreshButton);
            try {
              const channel = await interaction.client.channels.fetch(channelId);
              await channel.send({ embeds: [embed] });
              // await channel.send({ embeds: [embed], components: [buttonRow] });
            } catch (error) {
              console.log("Couldn't send new roles to channel");
            }
            processedClans.add(clan); // Mark the clan as processed
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

          // let refreshButton = new ButtonBuilder()
          //   .setCustomId(`refreshStats_${clan}`)
          //   .setEmoji("🔃")
          //   .setStyle(ButtonStyle.Secondary);

          const buttonRow = new ActionRowBuilder().addComponents(sendButton);
          // const buttonRow = new ActionRowBuilder().addComponents(sendButton, refreshButton);

          // Send Message to leader channels
          try {
            const channel = await interaction.client.channels.fetch(channelId);
            await channel.send({ embeds: [embed], components: [buttonRow] });
          } catch (error) {
            console.log("Couldn't send new roles to channel");
          }
          processedClans.add(clan); // Mark the clan as processed
        }

      }
    };

    // Separate player groups based on war category
    const playerGroups5k = {};
    const playerGroups4k = {};
    for (let [clan, players] of Object.entries(playerGroups)) {
      clan = clan.toLowerCase();
      const clantag = Object.keys(clans).find(tag => clans[tag].abbreviation === clan);
      if (!clantag) continue;
      const clanWarCategory = clans[clantag]?.warCategory;
      if (clanWarCategory === '5k') {
        playerGroups5k[clan] = players;
      } else if (clanWarCategory === '4k') {
        playerGroups4k[clan] = players;
      }
    }

    // Process both sheets with their respective roles and player groups
    await processSheet(rolesSheet5, playerGroups5k, '5k');
    await processSheet(rolesSheet4, playerGroups4k, '4k');

    // // Step 3: Send the "No Clan Found" entries as a single embed
    // if (Object.keys(noClanFoundEntries).length > 0) {
    //   let noClanDescription = "";
    //   for (const [roleId, players] of Object.entries(noClanFoundEntries)) {
    //     players.sort((a, b) => b.fameAverage - a.fameAverage);
    //     noClanDescription += `<@&${roleId}>\n${players.map(player => `<@${player.discordId}> (${player.playerName})`).join(`\n`)}\n\n`;
    //   }
    //   let noClanEmbed = new EmbedBuilder()
    //     .setTitle("Other")
    //     .setColor("Purple")
    //     .setDescription(noClanDescription + `Cannot find a stats channel for these players, please check manually.`)
    //     .setFooter({ text: warWeek })


    //   try {
    //     const channel = await interaction.client.channels.fetch(defaultChannel);
    //     await channel.send({ embeds: [noClanEmbed] });
    //   } catch (error) {
    //     console.log("Couldn't send new roles to channel");
    //   }
    // }

    await interaction.editReply({ embeds: [createSuccessEmbed('Sent stats to their leadership channels')] });
  }
}



async function readSheet(group) {
  const sheets = google.sheets('v4');
  const auth = new google.auth.GoogleAuth({
    keyFile: JSON.parse(process.env.STATSCREDENTIALS),
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
