const API = require("../../API.js")
const { createSuccessEmbed, createErrorEmbed, createExistEmbed } = require('../../utilities/embedUtility.js');
const path = require('path');
const fs = require('fs');
const { QuickDB } = require("quick.db")
const { Events, PermissionsBitField, EmbedBuilder, Embed, SlashCommandBuilder, PermissionFlagsBits, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');


module.exports = {
  // data: new SlashCommandBuilder()
  //   .setName("find-time-in-clan")
  //   .setDescription("Find how long someone has been in a certain clan consecutively")
  //   .addStringOption(option =>
  //     option.setName("abbreviation")
  //       .setDescription("What is the abbreviation for the clan you want to check?")
  //       .setRequired(true))
  //   .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers),

  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "find-time-in-clan") return;
    await interaction.deferReply();

    const abbrev = interaction.options.get("abbreviation").value.toLowerCase();

    const dbPath = API.findFileUpwards(__dirname, `guildData/${interaction.guild.id}.sqlite`);
    const db = new QuickDB({ filePath: dbPath });
    const clans = await db.get(`clans`) || {};
    if (!clans) {
      await interaction.editReply({ embeds: [createErrorEmbed(`Error grabbing clan data.`)] });
      return;
    }
    const clantag = Object.keys(clans).find(tag => clans[tag].abbreviation === abbrev);
    let clan = await db.get(`clans.${clantag}`);
    if (!clantag) {
      await interaction.editReply({ embeds: [createErrorEmbed(`The abbreviation \`${abbrev}\` is not linked to the server.`)] });
      return;
    }

    let players = await checkLengthInClan(clantag);

    const embed = new EmbedBuilder()
      .setTitle(`${clan.clanName}`)
      .setAuthor({ name: `Longest time in:` })
      .setThumbnail(process.env.BOT_IMAGE)
      .setURL(`https://royaleapi.com/clan/${clantag.substring(1)}`)
      .setColor("Purple")

    let description = ``;
    players.forEach((data, name) => {
      console.log(data.playertag);
      if (data.consecutiveCount > 1) {
        description += `[${name}](<https://royaleapi.com/player/${(data.playertag).substring(1)}>) • ${data.consecutiveCount} Weeks\n`
      }
      else {
        description += `[${name}](<https://royaleapi.com/player/${(data.playertag).substring(1)}>) • ${data.consecutiveCount} Week\n`
      }
    })

    embed.setDescription(description);

    await interaction.editReply({ embeds: [embed] });
  }
}


async function checkLengthInClan(clantag) {
  let rrData = await API.getRiverRaceLog(clantag);
  if (rrData.data) {
    console.log("is not valid");
  }
  else {
    console.log("is valid");
  }

  let playerMap = new Map();
  let playerRoles = new Map(); // Map to store player roles
  let checkClan = new Map();
  let apiCalls = []; // Array to store API call promises

  for (const item of rrData.items) {
    for (let i = 0; i < item.standings.length; i++) {
      let standing = item.standings[i];
      if (standing.clan.tag === clantag) {
        let participants = standing.clan.participants;
        for (const participant of participants) {
          if (!playerRoles.has(participant.tag)) {
            // Add the API call promise to the array with a delay
            apiCalls.push(
              delay(1000).then(() =>
                API.getPlayer(participant.tag)
                  .then(player => {
                    playerRoles.set(participant.tag, player.role);
                    // console.log(`Fetched role for ${participant.name}: ${player.role}`);
                  })
                  .catch(error => {
                    // console.error(`Failed to fetch role for ${participant.name}:`, error);
                  })
              )
            );

          }
        }
      }
    }
  }

  // Wait for all API calls to complete
  await Promise.all(apiCalls);


  for (const item of rrData.items) {
    for (let i = 0; i < item.standings.length; i++) {
      let standing = item.standings[i];
      if (standing.clan.tag === clantag) {
        let participants = standing.clan.participants;
        for (participant of participants) {
          let role = playerRoles.get(participant.tag);

          let playerClan = "";
          if (!checkClan.has(participant.tag)) {
            let player = await API.getPlayer(participant.tag)
            playerClan = player?.clan?.tag;
            checkClan.set(participant.tag, playerClan);
            // delay(75);
          }
          else {
            playerClan = checkClan.get(participant.tag);
          }

          console.log(playerClan);
          if (playerClan !== clantag) continue;

          // Ignore players with "coLeader" or "leader" role
          if (role === "coLeader" || role === "leader") continue;

          if (participant.fame <= 0) {
            if (playerMap.has(participant.name)) {
              let playerData = playerMap.get(participant.name);
              playerData.missed = true;
              playerData.playertag = participant.tag
              playerMap.set(participant.name, playerData);
            } else {
              playerMap.set(participant.name, { consecutiveCount: 0, missed: true, playertag: participant.tag, role: role });
            }
            continue;
          }

          if (playerMap.has(participant.name)) {
            let playerData = playerMap.get(participant.name);
            if (playerData.missed) continue;
            playerMap.set(participant.name, {
              ...playerData,
              consecutiveCount: playerData.consecutiveCount + 1,
            });
          }
          else {
            // console.log("set", participant.name);
            playerMap.set(participant.name, { consecutiveCount: 1, playertag: participant.tag, role: role });
          }
        }
      }
    }
  }
  const sortedPlayerMap = new Map(
    [...playerMap.entries()]
      .sort((a, b) => b[1].consecutiveCount - a[1].consecutiveCount)
      .slice(0, 15));
  console.log(sortedPlayerMap);
  return sortedPlayerMap;
}


function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}