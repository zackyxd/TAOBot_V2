const { Events, ActivityType, EmbedBuilder } = require('discord.js');
const cron = require('node-cron');
const moment = require('moment-timezone');
const API = require("../../API.js");
const path = require('path');
const Database = require('better-sqlite3');
const { QuickDB } = require("quick.db")
const fs = require('fs');
const { createSuccessEmbed, createExistEmbed, createErrorEmbed, createMaintenanceEmbed } = require('../../utilities/embedUtility.js');


// module.exports = {
//   name: Events.ClientReady,
//   once: true,
//   execute(client) {
//     setInterval(() => updateClanInvites(client), 15000);
//   }
// }




const updateClanInvites = async (client) => {
  // console.log("Updating Clan Invites");
  client.guilds.cache.forEach(async (guild) => {
    const dbPath = API.findFileUpwards(__dirname, `guildData/${guild.id}.sqlite`);
    const db = new QuickDB({ filePath: dbPath, timeout: 5000 });
    const clans = await db.get(`clans`);
    if (!clans) return;
    const nonExpiredClans = [];
    const expiredClans = [];
    const currentTime = Math.floor(Date.now() / 1000); // unix in seconds
    const channel = guild.channels.cache.get(await db.get(`guilds.${guild.id}.clanInvitesChannel`));

    for (const clantag in clans) {
      const clanData = await db.get(`clanData.${clantag}`); // ingame data 
      const clanInfo = await db.get(`clans.${clantag}`); // db data
      // console.log(clanData);
      if (clanInfo.expiryTime && clanInfo.expiryTime <= currentTime) {
        expiredClans.push({ clantag, ...clanData, ...clanInfo });
        if (channel && clanInfo.alreadyExpired === 0) {
          console.log(`Expiring link for clan: ${clantag}, roleId: ${clanInfo.roleId}, clanName: ${clanInfo.clanName}`);
          const sentMessage = await channel.send({ content: `<@&${clanInfo.roleId}>, your link has expired.` });
          sentMessage.delete();
          await db.set(`clans.${clantag}`, { ...clanInfo, alreadyExpired: 1 })
        }
      }
      else {
        nonExpiredClans.push({ clantag, ...clanData, ...clanInfo });
      }
    }

    // console.log("After sorting nonExpiredClans:", nonExpiredClans.map(clan => clan.clanWarTrophies));
    nonExpiredClans.sort((a, b) => {
      if (a.clanWarTrophies === undefined) return 1;
      if (b.clanWarTrophies === undefined) return -1;
      return b.clanWarTrophies - a.clanWarTrophies;
    });

    // console.log("After sorting nonExpiredClans:", nonExpiredClans.map(clan => clan.clanWarTrophies));

    // console.log("After sorting expiredClans:", expiredClans.map(clan => clan.clanWarTrophies));
    expiredClans.sort((a, b) => {
      if (a.clanWarTrophies === undefined) return 1;
      if (b.clanWarTrophies === undefined) return -1;
      return b.clanWarTrophies - a.clanWarTrophies;
    });
    // console.log("After sorting expiredClans:", expiredClans.map(clan => clan.clanWarTrophies));


    let nonExpiredMessageContent = "# Active Links\n";
    if (nonExpiredClans.length === 0) {
      nonExpiredMessageContent += "No active links.";
    }
    else {
      nonExpiredClans.forEach(clan => {
        if (clan.clanLink) {
          nonExpiredMessageContent += `## [${clan.clanName}](<${clan.clanLink}>): <t:${clan.expiryTime}:R>\n`;
        }
      })
    }

    let expiredMessageContent = "\n\n# Expired Links\n";
    if (expiredClans.length === 0) {
      expiredMessageContent += "No expired links.";
    }
    else {
      expiredClans.forEach(clan => {
        if (clan.roleId && clan.roleId !== "") {
          expiredMessageContent += `<@&${clan.roleId}>, your link has expired.\n`;
        }
        else {
          expiredMessageContent += `${clan.clanName}, your link has expired.\n`;
        }
      });
    }

    if (channel) {
      let nonExpiredMessageId = await db.get(`guilds.${guild.id}.nonExpiredMessageId`);
      let expiredMessageId = await db.get(`guilds.${guild.id}.expiredMessageId`);

      // Declare variables outside of try blocks
      let nonExpiredMessage = null;
      let expiredMessage = null;

      // Fetch non-expired message
      try {
        if (nonExpiredMessageId) {
          nonExpiredMessage = await channel.messages.fetch(nonExpiredMessageId);
          // console.log(`Fetched nonExpiredMessage: ${nonExpiredMessage.id}`);
        }
      } catch (error) {
        console.log(`Failed to fetch nonExpiredMessage: ${error}`);
      }

      // Fetch expired message
      try {
        if (expiredMessageId) {
          expiredMessage = await channel.messages.fetch(expiredMessageId);
          // console.log(`Fetched expiredMessage: ${expiredMessage.id}`);
        }
      } catch (error) {
        console.log(`Failed to fetch expiredMessage: ${error}`);
      }

      // If non-expired message is missing, delete expired message and repost both
      if (!nonExpiredMessage) {
        try {
          if (expiredMessage) {
            await expiredMessage.delete();
          }
        } catch (error) {
          // console.log(`Failed to delete expiredMessage: ${error}`);
        }
        const sentNonExpiredMessage = await channel.send(nonExpiredMessageContent);
        await db.set(`guilds.${guild.id}.nonExpiredMessageId`, sentNonExpiredMessage.id);
        // console.log(`Sent new nonExpiredMessage: ${sentNonExpiredMessage.id}`);

        const sentExpiredMessage = await channel.send(expiredMessageContent);
        await db.set(`guilds.${guild.id}.expiredMessageId`, sentExpiredMessage.id);
        // console.log(`Sent new expiredMessage: ${sentExpiredMessage.id}`);
      } else {
        if (nonExpiredMessage.content !== nonExpiredMessageContent) {
          try {
            await nonExpiredMessage.edit(nonExpiredMessageContent);
            // console.log(`Edited nonExpiredMessage: ${nonExpiredMessage.id}`);
          } catch (error) {
            // console.log(`Failed to edit nonExpiredMessage: ${error}`);
          }
        }

        if (!expiredMessage) {
          const sentExpiredMessage = await channel.send(expiredMessageContent);
          await db.set(`guilds.${guild.id}.expiredMessageId`, sentExpiredMessage.id);
          // console.log(`Sent new expiredMessage: ${sentExpiredMessage.id}`);
        } else {
          if (expiredMessage.content !== expiredMessageContent) {
            try {
              await expiredMessage.edit(expiredMessageContent);
              // console.log(`Edited expiredMessage: ${expiredMessage.id}`);
            } catch (error) {
              // console.log(`Failed to edit expiredMessage: ${error}`);
            }
          }
        }
      }
    }
  });
}


module.exports = { updateClanInvites };