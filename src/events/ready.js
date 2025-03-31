const { Events, ActivityType, EmbedBuilder } = require('discord.js');
const path = require('path');
const cron = require('node-cron');
const moment = require('moment-timezone');
const API = require("../API.js");
const { QuickDB } = require("quick.db")
const fs = require('fs');
const { checkClanChanges } = require('./automationEvents/clanlogsAutomation');
// const { checkAttacks } = require('./automationEvents/attacksAutomation');
// const { checkRace } = require('./automationEvents/scoresAutomation');
const { updateClanInvites } = require('./automationEvents/postClanLinksAutomation.js');
// const { postNudges } = require('./automationEvents/nudgesAutomation');
const { postNudges } = require('./automationEvents/warNudges');
const { findPlayerAttacks } = require('./dataUpdates/findPlayerAttacksInClans.js');
const { checkRace } = require('./automationEvents/endOfWarDayStats.js');
const { updateMemberClanRoles } = require('../utilities/checkIfHaveRole.js');
const { removeMemberClanRoles } = require('../utilities/roleRemoval.js');
const { verifyClanlogs } = require('./automationEvents/verifyClanlogs.js');
// const { post20WinsEmbeds } = require('./20winchallenge/UpdateMatches');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    console.log(`Ready! Logged in as ${client.user.tag}`);
    client.user.setActivity({
      name: "Over AAFAM",
      type: ActivityType.Watching
    });

    // Cache all members
    console.log('Fetching members for all guilds on startup...');
    for (const guild of client.guilds.cache.values()) {
      try {
        await fetchAllMembers(guild);
      }
      catch (error) {
        console.error("Error fetching members for guild ${guild.id}");
      }
    }
    console.log("All members fetched");

    // every thursday at 3am
    // resetPlayerData(client);
    cron.schedule('0 2 * * 4', async function () {
      // cron.schedule('*/5 * * * * *', async function () {
      resetPlayerData(client);
    }, {
      scheduled: true,
      timezone: 'America/Phoenix'
    });

    cron.schedule('35 2 * * *', async function () {
      // cron.schedule('*/5 * * * * *', async function () {
      resetPings(client);
    }, {
      scheduled: true,
      timezone: 'America/Phoenix'
    });

    // post20WinsEmbeds(client);

    // Auto remove roles
    // cron.schedule('0 5 * * 1', async () => {
    //   await removeMemberClanRoles(client);
    // }, {
    //   scheduled: true,
    //   timezone: 'America/Phoenix'
    // });





    checkRace(client);
    postNudges(client);
    setInterval(async () => {
      await updateClanInvites(client);
    }, 15000);

    setInterval(async () => {
      await checkClanChanges(client);
      // }, 10000);
    }, 180000);

    // findPlayerAttacks(client); // Changed this because didnt need it running 24/7

    setInterval(async () => {
      await verifyClanlogs(client);
    }, 600000);

    // await updateMemberClanRoles(client);
    // setInterval(async () => {
    //   // console.log("Updating roles");
    //   await updateMemberClanRoles(client);
    // }, 2100000)


  }
}

async function fetchAllMembers(guild) {
  try {
    // Fetch all members in the guild
    const members = await guild.members.fetch();
    // console.log(`Fetched ${members.size} members for guild: ${guild.id}`);
  } catch (error) {
    console.error(`Error fetching members for guild ${guild.id}:`, error);
  }
  sleep(100);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}



async function resetPlayerData(client) {
  client.guilds.cache.forEach(async (guild) => {
    const dbPath = API.findFileUpwards(__dirname, `guildData/${guild.id}.sqlite`);
    const db = new QuickDB({ filePath: dbPath, timeout: 5000 });
    const playertags = await db.get(`playertags`);
    if (!playertags) return;
    for (const tag in playertags) {
      if (playertags.hasOwnProperty(tag)) {
        playertags[tag].day1DecksUsed = 0;
        playertags[tag].day2DecksUsed = 0;
        playertags[tag].day3DecksUsed = 0;
        playertags[tag].day4DecksUsed = 0;
      }
    }
    // Save the updated playertags back to the database
    await db.set(`playertags`, playertags);
  });
  console.log("Player Data reset to 0 attacks");
}

async function resetPings(client) {
  client.guilds.cache.forEach(async (guild) => {
    const dbPath = API.findFileUpwards(__dirname, `guildData/${guild.id}.sqlite`);
    const db = new QuickDB({ filePath: dbPath, timeout: 5000 });
    const users = await db.get(`users`);
    if (!users) return;
    for (const id in users) {
      if (users.hasOwnProperty(id)) {
        users[id]["replace-me"] = false;
        users[id]["attacking-late"] = false;
      }
    }
    // Save the updated playertags back to the database
    await db.set(`users`, users);
  });
  console.log("Player pings set to false");
}