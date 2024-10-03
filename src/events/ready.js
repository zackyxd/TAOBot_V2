const { Events, ActivityType, EmbedBuilder } = require('discord.js');
const path = require('path');
const cron = require('node-cron');
const moment = require('moment-timezone');
const API = require("../API.js");
const Database = require('better-sqlite3');
const { QuickDB } = require("quick.db")
const fs = require('fs');
const { checkClanChanges } = require('./automationEvents/clanlogsAutomation');
const { checkAttacks } = require('./automationEvents/attacksAutomation');
const { checkRace } = require('./automationEvents/scoresAutomation');
const { updateClanInvites } = require('./automationEvents/createInviteLinkAutomation');
const { postNudges } = require('./automationEvents/nudgesAutomation');


module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    console.log(`Ready! Logged in as ${client.user.tag}`);
    client.user.setActivity({
      name: "Over AFAM",
      type: ActivityType.Watching
    });

    // every thursday at 3am
    cron.schedule('0 3 * * 4', async function () {
      // cron.schedule('*/5 * * * * *', async function () {
      // console.log("Cron job running every minute between 2:15 AM and 2:59 AM");
      // Your code here
      resetPlayerData(client);
    }, {
      scheduled: true,
      timezone: 'America/Phoenix'
    });

    cron.schedule('0 3 * * *', async function () {
      // cron.schedule('*/5 * * * * *', async function () {
      // console.log("Cron job running every minute between 2:15 AM and 2:59 AM");
      // Your code here
      resetPings(client);
    }, {
      scheduled: true,
      timezone: 'America/Phoenix'
    });

    checkAttacks(client);
    checkRace(client);
    postNudges(client);
    setInterval(async () => {
      await updateClanInvites(client);
    }, 15000);

    setInterval(async () => {
      await checkClanChanges(client);
    }, 180000);



  }
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