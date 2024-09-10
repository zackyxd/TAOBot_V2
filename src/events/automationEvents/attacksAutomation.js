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
    // postAttacks(client);
    cron.schedule('15-59 2 * * *', async function () {
      // cron.schedule('*/5 * * * * *', async function () {
      // console.log("Cron job running every minute between 2:15 AM and 2:59 AM");
      // Your code here
      postAttacks(client);
    }, {
      scheduled: true,
      timezone: 'America/Phoenix'
    });

    cron.schedule('0-20 3 * * 1', async function () {
      // cron.schedule('*/5 * * * * *', async function () {
      // console.log("Cron job running every minute between 2:15 AM and 2:59 AM");
      // Your code here
      postAttacks(client);
    }, {
      scheduled: true,
      timezone: 'America/Phoenix'
    });
  }
}


async function postAttacks(client) {
  // console.log("Grabbing Attacks");
  client.guilds.cache.forEach(async (guild) => {
    const dbPath = API.findFileUpwards(__dirname, `guildData/${guild.id}.sqlite`);
    const db = new QuickDB({ filePath: dbPath, timeout: 5000 });
    const clans = await db.get(`clans`);
    if (!clans);

    for (const clantag in clans) {
      let checkClan = await db.get(`raceDataAttacks.${clantag}`);

      try {
        let grabRaceData = await getAttacks(clantag, db, checkClan?.raceData); // input clantag (to search for newRaceData), database, and the old data
        if (!grabRaceData) continue; // If clantag returns nothing, continue
        // console.log(grabRaceData)
        console.log(`Checking the attacks for clan with tag ${clantag}: ${grabRaceData.clanName}`)

        // Simulate a new day by modifying the periodIndex
        // grabRaceData.periodIndex += 1; // Increment the periodIndex for testing


        // If clan hasnt been added to database yet, add it then continue.
        if (!checkClan || !checkClan.warDay) {
          // Set it to the newest day, false posted, and raceData is the newest data
          await db.set(`raceDataAttacks.${clantag}`, { warDay: grabRaceData.newWarDay, raceData: grabRaceData.newRaceData });
          // checkClan = { warDay: grabRaceData.newWarDay, posted: false, raceData: grabRaceData.newRaceData };
          continue;
        }

        // grabRaceData.newWarDay += 1;
        console.log(`Day ${grabRaceData.oldWarDay} vs ${grabRaceData.newWarDay}`)

        // If same day, no change
        if (grabRaceData.oldWarDay === grabRaceData.newWarDay) {
          console.log("Attacks. Same day, no change, update data");
          checkClan = { warDay: grabRaceData.newWarDay, raceData: grabRaceData.newRaceData };
          await db.set(`raceDataAttacks.${clantag}`, checkClan);
          continue;
        }

        if (grabRaceData.noTrainingPost === 'training') {
          console.log("Training day, no post, update data");
          checkClan = { warDay: grabRaceData.newWarDay, raceData: grabRaceData.newRaceData };
          await db.set(`raceDataAttacks.${clantag}`, checkClan);
          continue;
        }


        // const currentTime = new Date();
        // console.log(`POSTING EMBED AT ${currentTime}`);
        // Add your code to post the embed here
        let channelId = await db.get(`clans.${clantag}.importantChannel`);
        // console.log(channel);
        const channel = guild.channels.cache.get(channelId);
        if (channel) {
          try {
            await channel.send({ embeds: [grabRaceData.embed] });
          } catch (error) {
            console.log("Error sending embed", error);
          }
        }

        // Change checkClan to new data
        checkClan = { warDay: grabRaceData.newWarDay, raceData: grabRaceData.newRaceData };
        await db.set(`raceDataAttacks.${clantag}`, checkClan);
        console.log("Updated Attacks Automation Data");


      } catch (error) {
        console.error("Error fetching race attacks data:", error);
      }
    }


  });
}


async function getAttacks(clantag, db, lastDayData) {

  let oldRaceData = lastDayData;
  let newRaceData = await API.getCurrentRiverRace(clantag);
  let clanData = await API.getClan(clantag);

  if (newRaceData.data || !clanData) return;
  if (!oldRaceData?.clan?.name) {
    console.log("Old race data didnt exist, creating new");
    return { newRaceData: newRaceData };
  }
  // console.log("CHECKING WAR FOR:", clantag);
  let pointsToday = oldRaceData.clan.fame || 0;
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


  let whichDayType = oldRaceData.periodType;
  let check3DayRace = false;
  let oldWarDay = -1;
  let newWarDay = -1;
  let warWeek = oldRaceData.sectionIndex + 1; // week
  let periodIndex = oldRaceData.periodIndex; // day

  if (whichDayType === 'warDay') {
    whichDayType = `War Week ${warWeek}`;
    oldWarDay = (periodIndex % 7) - 2;
  }
  else if (whichDayType === 'training') {
    whichDayType = `Training Week`
    oldWarDay = (periodIndex % 7) + 1;
  }
  else {
    whichDayType = `Colosseum`;
    oldWarDay = (periodIndex % 7) - 2;
  }

  if (newRaceData.periodType === 'warDay') {
    newWarDay = (newRaceData.periodIndex % 7) - 2;
  }
  else if (newRaceData.periodType === 'training') {
    newWarDay = (newRaceData.periodIndex % 7) + 1;
  }
  else {
    newWarDay = (newRaceData.periodIndex % 7) - 2;
  }

  // console.log("Checking old day", oldWarDay);
  // console.log("New day is", newWarDay)
  // warDay += 1
  // pointsToday = 10001;
  console.log(pointsToday);
  if (pointsToday < 10000 || whichDayType === `Colosseum`) {
    console.log("Came in here bc colo");
    for (const participant of oldRaceData.clan.participants) {
      const member = await db.get(`playertags.${participant.tag}`);
      member.playertag = participant.tag;

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

    for (let attacksLeft in attacksUsed) {
      attacksUsed[attacksLeft] = sortList(attacksUsed[attacksLeft]);
    }
  }

  // if points >= 10000
  else {

    for (const participant of oldRaceData.clan.participants) {
      if (participant.decksUsedToday > 0) {
        let member = { playerName: participant.name, attacksUsed: participant.decksUsedToday };
        thrownAttacks[4 - participant.decksUsedToday].push(member);
        decksRemaining -= participant.decksUsedToday;
        playersRemaining--;
      }
    }

    for (let attacksLeft in thrownAttacks) {
      thrownAttacks[attacksLeft] = sortList(thrownAttacks[attacksLeft]);
    }
  }




  // Make reply below
  let reply = '';
  let outOfClan = false;
  let partials = false;
  // If attacks = 0, means they used 0 attacks and have 4 remaining. Goes 4 -> 1 attacks remaining
  if (pointsToday < 10000 || whichDayType === `Colosseum`) {
    // console.log(pointsToday);
    for (let attacks = 0; attacks <= 4; attacks++) {
      if (attacksUsed.hasOwnProperty(attacks)) {
        let players = [];
        for (let player of attacksUsed[attacks]) {

          const playerData = await db.get(`playertags.${player.playertag}`);
          if (playerData && playerData.attacksUsed === 4) {
            // No attacks left at all
            continue;
          }

          if (player.outOfClan === true) {
            players.push(`* ${player.playerName} ❌`); // show who attacked and left clan
            outOfClan = true;
            continue;
          }

          players.push(`* ${player.playerName}`); // show who hasn't attacked yet and is in clan

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
  }

  // If points >= 10000
  else {
    reply = "**Attacked Today:**\n\n";
    for (let attacks = 0; attacks <= 4; attacks++) {
      if (thrownAttacks.hasOwnProperty(attacks)) {

        let players = [];
        for (let player of thrownAttacks[attacks]) {
          // console.log(player);
          players.push(`* ${player.playerName}`); // show who has attacked today

        }

        if (players.length > 0) {
          if (attacks === 1) {
            reply += `__**${4 - attacks} Attack**__ (${thrownAttacks[attacks].length})\n` + players.join('\n') + '\n\n';
          } else {
            reply += `__**${4 - attacks} Attacks**__ (${thrownAttacks[attacks].length})\n` + players.join('\n') + '\n\n';
          }
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
        reply += `* ${member.playerName} (-${member.attacksNotUsed}) 💀\n`;
      }
    }
    reply += "\n";
  }

  reply += `<:peopleLeft:1188128630270861492> ${playersRemaining}\n<:decksLeft:1187752640508088370> ${decksRemaining}`



  let footer = "";
  // console.log(outOfClan, partials, cantAttackAnymoreBool, cantAttackAnymoreBool);
  if (outOfClan) {
    footer += `❌ is out of clan.\n`
  }
  if (partials) {
    footer += `🛑 has partials in diff. clan.\n`
  }
  if (cantAttackAnymoreBool) {
    footer += `🤬 Used attacks elsewhere.\n`;
  }
  if (cantUseAttacksBool) {
    footer += `💀 In clan, can't use # attacks.\n`
  }


  // const embedReturn = new EmbedBuilder()
  //   .setTitle("__" + clanData.name + "__")
  //   .setAuthor({ name: `${whichDayType} | Day ${oldWarDay}` })
  //   .setURL(`https://royaleapi.com/clan/${(clanData.tag).substring(1)}/war/race`)
  //   .setDescription(reply)
  //   .setColor('Purple')
  //   .setThumbnail(process.env.BOT_IMAGE)
  //   .setTimestamp();
  // // return { embed: embedReturn, oldWarDay: oldWarDay, newWarDay: newWarDay, newRaceData: newRaceData };

  if (outOfClan || partials || cantAttackAnymoreBool || cantUseAttacksBool) {
    const embedReturn = new EmbedBuilder()
      .setTitle("__" + clanData.name + "__")
      .setURL(`https://royaleapi.com/clan/${(clanData.tag).substring(1)}/war/race`)
      .setAuthor({ name: `${whichDayType} | Day ${oldWarDay}` })
      .setDescription(reply)
      .setColor('Purple')
      .setThumbnail(process.env.BOT_IMAGE)
      .setTimestamp()
      .setFooter({ text: footer });
    return { embed: embedReturn, oldWarDay: oldWarDay, newWarDay: newWarDay, newRaceData: newRaceData, noTrainingPost: oldRaceData.periodType, clanName: newRaceData.clan.name };
  }
  else {
    const embedReturn = new EmbedBuilder()
      .setTitle("__" + clanData.name + "__")
      .setURL(`https://royaleapi.com/clan/${(clanData.tag).substring(1)}/war/race`)
      .setAuthor({ name: `${whichDayType} | Day ${oldWarDay}` })
      .setDescription(reply)
      .setColor('Purple')
      .setThumbnail(process.env.BOT_IMAGE)
      .setTimestamp();
    return { embed: embedReturn, oldWarDay: oldWarDay, newWarDay: newWarDay, newRaceData: newRaceData, noTrainingPost: oldRaceData.periodType, clanName: newRaceData.clan.name };
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