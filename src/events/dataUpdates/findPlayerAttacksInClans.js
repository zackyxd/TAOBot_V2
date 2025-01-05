const API = require("../../API.js");
const { Events, ActivityType, EmbedBuilder } = require("discord.js");
const path = require('path');
const Database = require('better-sqlite3');
const { Worker } = require('worker_threads');
const { QuickDB } = require("quick.db")
const fs = require('fs');
const { createSuccessEmbed, createExistEmbed, createErrorEmbed, createMaintenanceEmbed } = require('../../utilities/embedUtility.js');
const cron = require('node-cron');


// module.exports = {
//   name: Events.ClientReady,
//   once: true,
//   execute(client) {
//     // findAttacks(client);
//     cron.schedule('0 */5 * * * 4,5,6,7', async function () {
//       findAttacks(client);
//     }, {
//       scheduled: true,
//       timezone: 'America/Phoenix'
//     });

//     cron.schedule('0 */5 0-2 * * 1', async function () {
//       findAttacks(client);
//     }, {
//       scheduled: true,
//       timezone: 'America/Phoenix'
//     });
//   }
// }

const findPlayerAttacks = async (client) => {
  await findAttacks(client);
  cron.schedule('0 */4 * * * 4,5,6,7', async function () {
    findAttacks(client);
  }, {
    scheduled: true,
    timezone: 'America/Phoenix'
  });

  cron.schedule('0 */4 0-2 * * 1', async function () {
    await findAttacks(client);
  }, {
    scheduled: true,
    timezone: 'America/Phoenix'
  });
}

async function findAttacks(client) {
  console.log("Checking all clan attacks...");
  for (const guild of client.guilds.cache.values()) {
    const dbPath = API.findFileUpwards(__dirname, `guildData/${guild.id}.sqlite`);
    const db = new QuickDB({ filePath: dbPath, timeout: 5000 });
    const clans = await db.get(`clans`);
    if (!clans) continue;


    const playerAttacksMap = new Map();
    for (const clantag in clans) {
      if (!clans[clantag]['family-clan']) continue;
      // console.log(`Processing clantag ${clantag}`);
      const startClantagTime = Date.now();
      let raceData = await API.getCurrentRiverRace(clantag);
      if (!raceData || raceData.data) continue;

      let currentWarDay = (raceData.periodIndex % 7) - 2 || 1;
      // currentWarDay = 2; // TODO
      for (const participant of raceData.clan.participants) {
        await processParticipant(db, participant, playerAttacksMap, currentWarDay);
        sleep(50);
        // await new Promise(resolve => setImmediate(resolve)); // Yield to the event loop
      }
      console.log(`Finished processing clantag: ${clantag} in ${Date.now() - startClantagTime}ms`);
    }
    await savePlayerAttacks(db, playerAttacksMap);
    console.log(`Finished setting everyones attacks for all clans in guild ${guild.id}`);
    // await cleanUpDatabase(db);
  }
}

async function processParticipant(db, participant, playerAttacksMap, currentWarDay) {
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
  } else {
    playerData = {
      ...playerData,
      playerName: participant.name || playerData.playerName,
      playertag: participant.tag || playerData.playertag,
      currentDay: currentWarDay
    };
  }

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
    }
  } else {
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
    }
  }
  playerAttacksMap.set(participant.tag, playerData);
  await new Promise(resolve => setImmediate(resolve));  // Yield control
}



async function savePlayerAttacks(db, playerAttacksMap) {
  for (const [tag, playerData] of playerAttacksMap) {
    if (!playerData.discordId) {
      await db.delete(`playertags.${tag}`);
    }
    await db.set(`playertags.${tag}`, playerData);
    // Yield to the event loop
    await new Promise(resolve => setImmediate(resolve));
  }
}

async function cleanUpDatabase(db) {
  const playertags = await db.get(`playertags`);

  for (const playertag in playertags) {
    if (!playertags[playertag].discordId) {
      // console.log(playertags[playertag]);
      await db.delete(`playertags.${playertag}`);
    }
  }
  console.log("All specified entries should be deleted");
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}



module.exports = { findPlayerAttacks };