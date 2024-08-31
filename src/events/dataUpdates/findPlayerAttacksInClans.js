const API = require("../../API.js");
const { Events, ActivityType, EmbedBuilder } = require("discord.js");
const path = require('path');
const Database = require('better-sqlite3');
const { QuickDB } = require("quick.db")
const fs = require('fs');
const { createSuccessEmbed, createExistEmbed, createErrorEmbed, createMaintenanceEmbed } = require('../../utilities/embedUtility.js');
const cron = require('node-cron');


module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    // findAttacks(client);
    cron.schedule('0 */2 * * * 4,5,6,7,1', async function () {
      // console.log("Cron job running every minute between 2:15 AM and 2:59 AM");
      // Your code here
      findAttacks(client);
    }, {
      scheduled: true,
      timezone: 'America/Phoenix'
    });
  }
}


async function findAttacks(client) {
  client.guilds.cache.forEach(async (guild) => {
    const dbPath = API.findFileUpwards(__dirname, `guildData/${guild.id}.sqlite`);
    const db = new QuickDB({ filePath: dbPath, timeout: 5000 });
    const clans = await db.get(`clans`);
    if (!clans) return;

    const playerAttacksMap = new Map();

    for (const clantag in clans) {

      let raceData = await API.getCurrentRiverRace(clantag);
      // let raceData = await db.get(`raceDataAttacks.${clantag}`);
      let clanData = await API.getClan(clantag);
      if ((raceData && raceData.data) || !clanData) continue;

      let currentWarDay = (raceData.periodIndex % 7) - 2;
      // let currentWarDay = (raceData.periodIndex % 7) + 1; // only for training day

      // Simulate a new day by modifying the periodIndex
      // currentWarDay += 1;

      for (const participant of raceData.clan.participants) {
        let playerData = await db.get(`playertags.${participant.tag}`);
        if (!playerData) {
          playerData = {
            playerName: participant.name,
            playertag: participant.tag,
            day1DecksUsed: 0,
            day2DecksUsed: 0,
            day3DecksUsed: 0,
            day4DecksUsed: 0,
            currentDay: currentWarDay
          };
        }
        else {
          // Ensure all properties exist
          playerData = {
            ...playerData,
            playerName: playerData.playerName || participant.name,
            playertag: playerData.playertag || participant.tag,
            day1DecksUsed: playerData.day1DecksUsed || 0,
            day2DecksUsed: playerData.day2DecksUsed || 0,
            day3DecksUsed: playerData.day3DecksUsed || 0,
            day4DecksUsed: playerData.day4DecksUsed || 0,
            currentDay: currentWarDay
          };

        }


        // Accumulate decks used for the specific day across multiple clans
        if (playerAttacksMap.has(participant.tag)) {
          const existingData = playerAttacksMap.get(participant.tag);

          switch (currentWarDay) {
            case 1:
              playerData.day1DecksUsed = Math.min(existingData.day1DecksUsed + participant.decksUsedToday, 4);
              break;
            case 2:
              playerData.day2DecksUsed = Math.min(existingData.day2DecksUsed + participant.decksUsedToday, 4);
              break;
            case 3:
              playerData.day3DecksUsed = Math.min(existingData.day3DecksUsed + participant.decksUsedToday, 4);
              break;
            case 4:
              playerData.day4DecksUsed = Math.min(existingData.day4DecksUsed + participant.decksUsedToday, 4);
              break;
            default:
            // console.error("Invalid war day");
          }
        }
        else {
          switch (currentWarDay) {
            case 1:
              playerData.day1DecksUsed = Math.min(participant.decksUsedToday, 4);
              break;
            case 2:
              playerData.day2DecksUsed = Math.min(participant.decksUsedToday, 4);
              break;
            case 3:
              playerData.day3DecksUsed = Math.min(participant.decksUsedToday, 4);
              break;
            case 4:
              playerData.day4DecksUsed = Math.min(participant.decksUsedToday, 4);
              break;
            default:
            // console.error("Invalid war day");
          }
        }
        playerAttacksMap.set(participant.tag, playerData);
      }
    }
    // Save the accumulated attacksUsed back to the database
    for (const [tag, playerData] of playerAttacksMap) {
      await db.set(`playertags.${tag}`, playerData);
    }

    console.log(`Finished setting everyone for all clans in guild ${guild.id}`);
  });
}