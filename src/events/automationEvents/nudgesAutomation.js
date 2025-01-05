const API = require("../../API.js");
const { Events, ActivityType, EmbedBuilder, PermissionsBitField } = require("discord.js");
const path = require('path');
const Database = require('better-sqlite3');
const { QuickDB } = require("quick.db")
const fs = require('fs');
const { createSuccessEmbed, createExistEmbed, createErrorEmbed, createMaintenanceEmbed } = require('../../utilities/embedUtility.js');
const cron = require('node-cron');
const moment = require('moment-timezone');

const postNudges = async (client) => {
  // weekend at 7pm -> 1am
  cron.schedule('0 19,21,23,1 * * 5,6,7', () => {
    // cron.schedule('0 19,21,23,1 * * 5,6,7', () => {
    postAutoNudge(client);
  }, {
    scheduled: true,
    timezone: "America/Phoenix"
  });

  // Thursday at 5-11pm
  cron.schedule('0 19,21,23 * * 4', () => {
    postAutoNudge(client);
  }, {
    scheduled: true,
    timezone: "America/Phoenix"
  });

  // Monday at 1am
  cron.schedule('0 1 * * 1', () => {
    postAutoNudge(client);
  }, {
    scheduled: true,
    timezone: "America/Phoenix"
  });

}


async function postAutoNudge(client) {
  const botId = client.user.id;
  for (const guild of client.guilds.cache.values()) {
    const dbPath = API.findFileUpwards(__dirname, `guildData/${guild.id}.sqlite`);
    const db = new QuickDB({ filePath: dbPath, timeout: 5000 });
    const clans = await db.get(`clans`);
    if (!clans) {
      continue;
    }

    for (const clantag in clans) {
      // console.log(clantag);
      let checkClan = await API.getCurrentRiverRace(clantag);
      if (checkClan.data) {
        console.log("Error doing autonudge on", clantag);
        continue;
      }
      let clan = await db.get(`clans.${clantag}`);
      let currentTime = moment().tz("America/Phoenix");
      let channelId = clan?.nudgeSettings?.nudgeChannel;
      // console.log(clantag, channelId);
      if (!channelId) {
        console.log("No channel ID to post to:", clantag);
        continue;
      }
      if (clan && clan.nudgeSettings && clan.nudgeSettings.lastNudged) {
        let lastNudged = moment(clan.nudgeSettings.lastNudged);
        let timeDifference = currentTime.diff(lastNudged, 'minutes');
        if (timeDifference < 60) {
          console.log("No autonudge, time from last nudge within 1 hour", timeDifference);
          continue;
        }
      }
      if (clan && clan.nudgeSettings && clan.nudgeSettings.enabled === false) {
        continue;
      }
      let sendMessage = await grabAutoNudge(clantag, db, botId, channelId, client, guild.id);
      if (!sendMessage) {
        console.log("Couldn't send message for autonudge for clantag", clantag);
        continue;
      }


      let channel = client.channels.cache.get(channelId);
      if (channel) {
        try {
          await channel.send(sendMessage);
        } catch (error) {
          console.log("Invalid reply to autonudge", error);
          continue;
        }
        if (!clan.nudgeSettings) {
          clan.nudgeSettings = { lastNudged: currentTime };
        } else {
          clan.nudgeSettings = { ...clan.nudgeSettings, lastNudged: currentTime };
        }
        await db.set(`clans.${clantag}`, clan);
      }
    }
  }
}


async function grabAutoNudge(clantag, db, botId, channelId, client, guildId) {
  console.log(guildId);
  try {
    let attackData = await API.getCurrentRiverRace(clantag);
    let clanData = await API.getClan(clantag);
    if (attackData.data || !clanData) return;
    let pointsToday = attackData.clan.fame || 0;
    // console.log(pointsToday);
    let membersInClan = {};
    let membersNotInClan = {};
    for (const member of clanData.memberList) {
      membersInClan[member.tag] = { name: member.name, role: member.role };
    }
    // Arrays to hold sorted players
    let attacksUsed = { 0: [], 1: [], 2: [], 3: [], 4: [] };
    let thrownAttacks = { 0: [], 1: [], 2: [], 3: [], 4: [] };
    let cantAttackAnymore = {};
    let cantAttackAnymoreBool = false;
    let decksRemaining = 200;
    let playersRemaining = 50;
    let cantUseAttacks = {};
    let cantUseAttacksBool = false;
    let whichDayType = attackData.periodType;

    let warWeek = attackData.sectionIndex + 1; // week
    let periodIndex = attackData.periodIndex; // day 

    if (whichDayType === 'warDay') {
      whichDayType = `War Week ${warWeek}`;
      oldWarDay = (periodIndex % 7) - 2;
      if (pointsToday >= 10000) {
        console.log("Past finish line, no nudge");
        return;
      }
    }
    else if (whichDayType === 'training') {
      whichDayType = `Training Week`
      oldWarDay = (periodIndex % 7) + 1;
    }
    else {
      whichDayType = `Colosseum`;
      oldWarDay = (periodIndex % 7) - 2;
    }
    for (const participant of attackData.clan.participants) {
      let member = await db.get(`playertags.${participant.tag}`);
      if (!member) {
        member = {
          playerName: participant.name,
          playertag: participant.tag,
          day1DecksUsed: 0,
          day2DecksUsed: 0,
          day3DecksUsed: 0,
          day4DecksUsed: 0,
          currentDay: oldWarDay
        };
        switch (oldWarDay) {
          case 1:
            member.day1DecksUsed = participant.decksUsedToday;
            break;
          case 2:
            member.day2DecksUsed = participant.decksUsedToday;
            break;
          case 3:
            member.day3DecksUsed = participant.decksUsedToday;
            break;
          case 4:
            member.day4DecksUsed = participant.decksUsedToday;
            break;
          default:
          // console.error("Invalid war day");
        }
      }
      else {
        member.playertag = participant.tag;
      }

      let attacksUsedToday = -999; // member.attacksUsed (for today)
      switch (oldWarDay) {
        case 1:
          attacksUsedToday = member.day1DecksUsed;
          break;
        case 2:
          attacksUsedToday = member.day2DecksUsed;
          break;
        case 3:
          attacksUsedToday = member.day3DecksUsed;
          break;
        case 4:
          attacksUsedToday = member.day4DecksUsed;
          break;
      }


      // console.log(member);
      if (!membersInClan[participant.tag]) {

        // Negative Attacks and not in clan, means no attacks and left partials
        if (participant.decksUsedToday - attacksUsedToday < 0 && participant.decksUsedToday !== 0) {
          // console.log("This bitch left partials and cant complete them.");
          let attacksLeftOver = 4 - participant.decksUsedToday;
          member.attacksNotUsed = attacksLeftOver;
          cantAttackAnymore[participant.tag] = member;
          cantAttackAnymoreBool = true;
          playersRemaining--;
          decksRemaining -= participant.decksUsedToday;
          continue;
        }
        else if (participant.decksUsedToday > 0 && participant.decksUsedToday < 4) {
          decksRemaining -= participant.decksUsedToday;
          playersRemaining--;
          member.outOfClan = true;
          attacksUsed[attacksUsedToday].push(member);
        }
        else if (participant.decksUsedToday === 4) {
          decksRemaining -= participant.decksUsedToday;
          playersRemaining--;
        }

        membersNotInClan[participant.tag] = member;
      }
      else {
        // console.log(member);
        member.role = membersInClan[participant.tag].role;

        // Currently in clan, but can't use all battles
        if (participant.decksUsedToday - attacksUsedToday < 0) {
          // console.log(participant.name);
          // console.log(attacksUsedToday - participant.decksUsedToday);
          let attacksLeftOver = attacksUsedToday - participant.decksUsedToday;
          member.attacksNotUsed = attacksLeftOver;
          cantUseAttacks[participant.tag] = member;
          cantUseAttacksBool = true;
          if (participant.decksUsedToday > 0) {
            decksRemaining -= participant.decksUsedToday;
            playersRemaining--;
          }
          continue;
          console.log(`Player ${member.playerName} attacked elsewhere, only has ${actualAttacksLeft} attacks available.`)
        }
        if (attacksUsedToday >= 0 && attacksUsedToday < 4) {
          attacksUsed[attacksUsedToday].push(member);
        }
        if (participant.decksUsedToday > 0) {
          decksRemaining -= participant.decksUsedToday;
          playersRemaining--;
        }
      }
    }

    if (decksRemaining === 0) {
      console.log("No attacks left, no nudge");
      return;
    }

    for (let attacksLeft in attacksUsed) {
      attacksUsed[attacksLeft] = sortList(attacksUsed[attacksLeft]);
    }

    // Make reply below
    let reply = `AUTONUDGE. You have attacks left in ${clanData.name} by <@${botId}>\n\n`;
    // let checkNudgeMessage = await db.get(`clans.${clantag}`);
    let outOfClan = false;
    let partials = false;
    let replaceMe = false;

    let startTime = moment().tz("America/Phoenix").hour(21).minute(1).second(0); // Set start time to 9:01 PM
    let endTime = moment().tz("America/Phoenix").hour(3).minute(0).second(0).add(1, 'day'); // Set end time to 3:00 AM next day
    let currentTime = moment().tz("America/Phoenix");

    for (let attacks = 0; attacks <= 4; attacks++) {
      if (attacksUsed.hasOwnProperty(attacks)) {
        let players = [];
        for (let player of attacksUsed[attacks]) {

          const playerData = await db.get(`playertags.${player.playertag}`);
          const discordAccount = await db.get(`users.${player.discordId}`);
          // console.log(discordAccount);
          if (playerData && playerData.attacksUsed === 4) {
            // No attacks left at all
            continue;
          }

          if ((player.role === 'coLeader' || player.role === 'leader') && discordAccount && discordAccount.pingCo !== true) {
            players.push(`* **${player.playerName}**`);
            continue;
          }

          if (discordAccount && discordAccount['replace-me'] === true) {
            const guild = client.guilds.cache.get(guildId);
            const channel = await client.channels.fetch(channelId);
            const member = await guild.members.fetch(playerData.discordId);
            if (channel && member && channel.permissionsFor(member).has(PermissionsBitField.Flags.ViewChannel)) {
              players.push(`* ${player.playerName} ⚠️`);
            } else {
              players.push(`* ${player.playerName} ⚠️🙈`);
            }
            replaceMe = true;
            continue;
          }
          else if (discordAccount && discordAccount['attacking-late'] === true) {
            const guild = client.guilds.cache.get(guildId);
            const channel = await client.channels.fetch(channelId);
            const member = await guild.members.fetch(playerData.discordId);

            if (currentTime.isBetween(startTime, endTime)) { // time between it should nudge people
              if (channel && member && channel.permissionsFor(member).has(PermissionsBitField.Flags.ViewChannel)) {
                players.push(`* <@${playerData.discordId}> (${player.playerName})`); // ping players who haven't pinged
              } else {
                players.push(`* <@${playerData.discordId}> (${player.playerName}) 🙈`); // ping players who haven't pinged
              }
            } else {
              if (channel && member && channel.permissionsFor(member).has(PermissionsBitField.Flags.ViewChannel)) {
                players.push(`* ${player.playerName} ✅`); // show who attacking late
              } else {
                players.push(`* ${player.playerName} ✅🙈`); // show who attacking late
              }
            }
            continue;
          }
          else if (discordAccount) {

            try {
              const guild = client.guilds.cache.get(guildId);
              const channel = await client.channels.fetch(channelId);
              const member = await guild.members.fetch(playerData.discordId);
              if (channel && member && channel.permissionsFor(member).has(PermissionsBitField.Flags.ViewChannel)) {
                players.push(`* <@${playerData.discordId}> (${player.playerName})`); // ping players who havent pinged
              } else {
                players.push(`* <@${playerData.discordId}> (${player.playerName}) 🙈`); // ping players who haven't pinged
              }
              continue;

            } catch (error) {
              players.push(`* ${player.playerName} ❓`); // ping players who havent pinged
              continue;
            }
          }


          if (player.outOfClan === true && !discordAccount) {
            players.push(`* ${player.playerName} (not linked) ❌`); // show who attacked and left clan
            outOfClan = true;
            continue;
          }
          else if (player.outOfClan === true && discordAccount) {
            const guild = client.guilds.cache.get(guildId);
            const channel = await client.channels.fetch(channelId);
            const member = await guild.members.fetch(playerData.discordId);
            if (channel && member && channel.permissionsFor(member).has(PermissionsBitField.Flags.ViewChannel)) {
              players.push(`* <@${playerData.discordId}> (${player.playerName}) ❌`); // show who attacked and left clan
            } else {
              players.push(`* <@${playerData.discordId}> (${player.playerName}) ❌🙈`); // ping players who haven't pinged
            }
            outOfClan = true;
            continue;
          }

          players.push(`* ${player.playerName} (not linked)`); // show who hasn't attacked yet and is in clan


        }

        if (players.length > 0) {
          if (attacks === 3) {
            reply += `__**${4 - attacks} Attack**__ (${attacksUsed[attacks].length})\n` + players.join('\n') + '\n\n';
          } else {
            reply += `__**${4 - attacks} Attacks**__ (${attacksUsed[attacks].length})\n` + players.join('\n') + '\n\n';
          }
        }
      }
    }

    if (Object.keys(cantAttackAnymore).length !== 0 || Object.keys(cantUseAttacks).length !== 0) {
      reply += `**Attention:**\n`;
      for (const tag in cantAttackAnymore) {
        if (cantAttackAnymore.hasOwnProperty(tag)) {
          const member = cantAttackAnymore[tag];
          reply += `* ${member.playerName} (-${member.attacksNotUsed}) 🤬\n`;
        }
      }
      for (const tag in cantUseAttacks) {
        if (cantUseAttacks.hasOwnProperty(tag)) {
          const member = cantUseAttacks[tag];
          reply += `* ${member.playerName} (-${member.attacksNotUsed}) 🤝\n`;
        }
      }
      reply += "\n";
    }

    reply += `<:peopleLeft:1188128630270861492> ${playersRemaining}\n<:decksLeft:1187752640508088370> ${decksRemaining}\n`

    if (outOfClan) {
      reply += `❌ is out of clan.\n`
    }
    if (partials) {
      reply += `🛑 has partials in diff. clan.\n`
    }
    if (cantAttackAnymoreBool) {
      reply += `🤬 Used attacks elsewhere.\n`;
    }
    if (cantUseAttacksBool) {
      reply += `🤝 In clan, can't use # attacks.\n`
    }
    if (replaceMe) {
      reply += `⚠️ Needs to be replaced.\n`
    }
    // console.log(reply);
    return reply;
  }
  catch (error) {
    console.log(error);
  }
}

function sortList(list) {
  return sortedList = list.sort((a, b) => {
    // Remove special characters and convert to lowercase
    var nameA = a.playerName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    var nameB = b.playerName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

    // Compare the "cleaned" names
    if (nameA < nameB) return -1;
    if (nameA > nameB) return 1;
    return 0;
  });
}

module.exports = { postNudges };