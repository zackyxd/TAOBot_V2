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
    // console.log('Fetching members for all guilds on startup...');
    // for (const guild of client.guilds.cache.values()) {
    //   try {
    //     await fetchAllMembers(guild);
    //   }
    //   catch (error) {
    //     console.error("Error fetching members for guild ${guild.id}");
    //   }
    // }
    // console.log("All members fetched");

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


    setInterval(async () => {
      await editOldClanLinks(client);
    }, 90000);


    // Send daily chess match for Elite vs Hahn
    cron.schedule('0 12 * * *', async function () {
      dailyChess(client);
    }, {
      scheduled: true,
      timezone: 'America/Phoenix'
    });

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


async function dailyChess(client) {
  client.guilds.cache.forEach(async (guild) => {
    const dbPath = API.findFileUpwards(__dirname, `guildData/${guild.id}.sqlite`);
    const db = new QuickDB({ filePath: dbPath, timeout: 5000 });
    const users = await db.get(`users`);
    if (!users) return;

    const chessData = await db.get(`chess`);
    console.log(chessData);
    if (chessData) {
      try {
        let channelId = chessData.channelId;
        let messageId = chessData.messageId;
        let channel = await client.channels.fetch(channelId);
        let message = await channel.messages.fetch(messageId);
        message.delete();
      } catch (error) {
        console.log(error);
        await db.delete('chess');
      }
    }

    let hahnId = "488811572320403457"
    let eliteId = "139545336652890112"
    let chessChannelId = "1326037317986811915"

    // let hahnId = "272201620446511104"
    // let eliteId = "955088215281385492"
    // let chessChannelId = "1276747740562456617"
    let channelToSend = await client.channels.fetch(chessChannelId);
    if (!channelToSend) {
      console.log("Could not fetch channel to send chess message");
      return;
    }
    let hahn = await client.users.fetch(hahnId);
    let elite = await client.users.fetch(eliteId);
    if (!hahn || !elite) {
      console.log("Could not fetch hahn or elite");
      return;
    }

    let embed = new EmbedBuilder()
      .setTitle("Daily Chess")
      .setDescription(`Have you played your daily chess yet?`)
      .setThumbnail(`https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/ChessSet.jpg/250px-ChessSet.jpg`)

    let message = await channelToSend.send({ embeds: [embed], content: `<@${hahnId}> <@${eliteId}>` });
    await db.set(`chess`, {
      channelId: channelToSend.id,
      messageId: message.id
    });


  })
}


async function editOldClanLinks(client) {
  client.guilds.cache.forEach(async (guild) => {
    const db = await API.getDb(guild.id);
    const clanLinkTracker = await db.get(`clanLinkTracker`);
    if (!clanLinkTracker) return;
    const currentTime = Math.floor(Date.now() / 1000); // Current Unix time in seconds
    for (const expiry in clanLinkTracker) {
      if (currentTime < expiry) continue;
      let messages = clanLinkTracker[expiry];
      for (const messageKey in messages) {
        console.log(messageKey);
        const messageData = messages[messageKey]; // Access individual message data
        const { messageId, channelId } = messageData;

        let channel, message;
        try {
          channel = await client.channels.fetch(channelId);
          message = await channel.messages.fetch(messageId);
          // messageMini = await channel.messages.fetch(messageIdMini);
        } catch (error) {
          console.log("Couldn't fetch clan links message, delete from db.");
          delete messages[messageKey];
          // Update the database
          await db.set(`clanLinkTracker.${expiry}`, messages);

          // Optionally break if all messages for the expiry are deleted
          if (Object.keys(messages).length === 0) {
            console.log(`No more messages left under expiry ${expiry}. Deleting expiry.`);
            await db.delete(`clanLinkTracker.${expiry}`);
          }
          continue;
        }

        // If messages exist, edit with expired
        let embed = new EmbedBuilder()
          .setDescription(`## ${messageData.clanName} link has expired`)
          .setColor('#FE9900')

        let editedMessage = `**This link for ${messageData.clanName} has expired.**`;

        message.edit({ embeds: [embed], content: editedMessage });


        // Delete from db
        delete messages[messageKey];
        // Update the database
        await db.set(`clanLinkTracker.${expiry}`, messages);

        if (Object.keys(messages).length === 0) {
          console.log(`No more messages left under expiry ${expiry}. Deleting expiry.`);
          await db.delete(`clanLinkTracker.${expiry}`);
        }
      }

    }
  });
}