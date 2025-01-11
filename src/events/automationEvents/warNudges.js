const API = require("../../API.js");
const { Events, ActivityType, EmbedBuilder, PermissionsBitField } = require("discord.js");
const path = require('path');
const { QuickDB } = require("quick.db")
const fs = require('fs');
const { createSuccessEmbed, createExistEmbed, createErrorEmbed, createMaintenanceEmbed } = require('../../utilities/embedUtility.js');
const cron = require('node-cron');
const moment = require('moment-timezone');

async function grabClanMembers(clantag) {
  let clanData = await API.getClan(clantag);
  return clanData?.memberList;
}

async function grabRace(clantag) {
  let raceData = await API.getCurrentRiverRace(clantag);
  return raceData;
}

const postNudges = async (client) => {

  // Monday at 1am
  cron.schedule('0 1 * * 1', () => {
    postAutoNudge(client, "normal");
  }, {
    scheduled: true,
    timezone: "America/Phoenix"
  });


  cron.schedule('0 19,21,23,1 * * 5,6,7', () => {
    postAutoNudge(client, "normal"); // normal
    console.log("Sending Normal Nudge!");
  }, {
    scheduled: true,
    timezone: "America/Phoenix"
  });


  // Thursday at 5-11pm
  cron.schedule('0 19,21,23 * * 4', () => {
    console.log("Sending Normal Nudge on Thursday!");
    postAutoNudge(client, "normal"); // normal
  }, {
    scheduled: true,
    timezone: "America/Phoenix"
  });



  // L2W NUDGES

  // Monday at 1am
  cron.schedule('0 0 * * 1', () => {
    postAutoNudge(client, "l2w");
  }, {
    scheduled: true,
    timezone: "America/Phoenix"
  });

  cron.schedule('0 12,18,0 * * 5,6,7', () => {
    postAutoNudge(client, "l2w"); // l2w
    console.log("Sending L2W Nudge!");
  }, {
    scheduled: true,
    timezone: "America/Phoenix"
  });


  // Thursday at 5-11pm
  cron.schedule('0 12,18 * * 4', () => {
    console.log("Sending L2W Nudge on Thursday!");
    postAutoNudge(client, "l2w"); // l2w
  }, {
    scheduled: true,
    timezone: "America/Phoenix"
  });


  // Testing TODO
  // cron.schedule('*/5 * * * * *', () => {
  //   postAutoNudge(client, "normal"); // normal
  // }, {
  //   scheduled: true,
  //   timezone: "America/Phoenix"
  // });

  // Reset special data
  cron.schedule(`15 3 * * *`, () => {
    // cron.schedule('*/5 * * * * *', () => {
    resetSpecialData(client);
  }, {
    scheduled: true,
    timezone: "America/Phoenix"
  });
}

async function resetSpecialData(client) {
  const guilds = Array.from(client.guilds.cache.values());
  await Promise.all(guilds.map(async (guild) => {
    const dbPath = API.findFileUpwards(__dirname, `guildData/${guild.id}.sqlite`);
    const db = new QuickDB({ filePath: dbPath, timeout: 5000 });
    const clans = await db.get(`clans`);
    if (!clans) return;
    await Promise.all(Object.keys(clans).map(async (clantag) => {
      let clan = await db.get(`clans.${clantag}`);
      if (clan?.nudgeSettings?.noAttacksRemaining === true) {
        clan.nudgeSettings.noAttacksRemaining = false;
      }
      await db.set(`clans.${clantag}`, clan);
    }));
  }));
  console.log("All clan nudge data reset, ready for next day");
}

async function postAutoNudge(client, nudgeType) {
  const botId = client.user.id;
  const guilds = Array.from(client.guilds.cache.values());

  await Promise.all(guilds.map(async (guild) => {
    const dbPath = API.findFileUpwards(__dirname, `guildData/${guild.id}.sqlite`);
    const db = new QuickDB({ filePath: dbPath, timeout: 5000 });
    const clans = await db.get(`clans`);
    if (!clans) {
      return;
    }

    await Promise.all(Object.keys(clans).map(async (clantag) => {
      // console.log(clantag);
      // let checkClan = await API.getCurrentRiverRace(clantag);
      // if (checkClan.data) {
      //   console.log("Error doing autonudge on", clantag);
      //   continue;
      // }
      let clan = await db.get(`clans.${clantag}`);
      let currentTime = moment().tz("America/Phoenix");
      let channelId = clan?.nudgeSettings?.nudgeChannel;
      // console.log(clantag, channelId);
      if (!channelId) {
        console.log("No channel ID to post to:", clantag);
        return;
      }
      await sleep(500);
      let clanMembers = await grabClanMembers(clantag);
      let raceData = await grabRace(clantag);

      if (!clanMembers) { console.error(`There was no clan member data for: ${clantag} `); return; }
      if (!raceData) { console.error(`There was no clan data for: ${clantag} `); return; }
      if (getRaceType(raceData) === 0) {
        console.log("Today is training day, no nudges!");
        return;
      }
      if (getRaceType(raceData) === 1 && raceData.clan.fame >= 10000) {
        console.log("Clan fame is over 10k on war day, skip nudge");
        return;
      }
      if (clan?.nudgeSettings?.lastNudged) {
        let lastNudged = moment(clan.nudgeSettings.lastNudged);
        let timeDifference = currentTime.diff(lastNudged, 'minutes');
        if (timeDifference < 60) {
          console.log("No autonudge, time from last nudge within 1 hour", timeDifference);
          return;
        }
      }
      if (clan?.nudgeSettings?.enabled === false) {
        return;
      }

      let sendMessage;
      if (nudgeType === "l2w" && clan?.l2w === true) {
        sendMessage = await checkAttacks(db, clanMembers, raceData, client, guild.id, channelId, true, botId);
        if (!sendMessage) {
          console.log("SendMessage didn't exist to send L2W autonudge for clantag", clantag);
          return;
        }
      }
      else if (nudgeType === "normal" && clan?.l2w !== true) {
        sendMessage = await checkAttacks(db, clanMembers, raceData, client, guild.id, channelId, false, botId);
        if (!sendMessage) {
          console.log("SendMessage didn't exist to send NORMAL autonudge for clantag", clantag);
          return;
        }
      }
      else {
        console.log("Not sending nudge at this time for:", clantag);
        return;
      }

      // If it gets down here, it means nudge setting exists.
      let channel = client.channels.cache.get(channelId);
      if (channel) {
        try {
          if (sendMessage.embed) { // send special message
            if (sendMessage.noAttacksRemaining && clan?.nudgeSettings?.noAttacksRemaining !== true) {
              console.log("All attacks finished nudge");
              await channel.send({ embeds: [sendMessage.embed] }) // sends if all attacks done
              clan.nudgeSettings.noAttacksRemaining = true;
            }
            else if (sendMessage.areAttacksRemaining) {
              console.log("No available attackers to finish attacks nudge");
              await channel.send({ embeds: [sendMessage.embed] }) // sends if all attacks done
            }
          }
          else {
            console.log("Normal nudge");
            await channel.send(sendMessage); // Send as normal nudge
          }
        } catch (error) {
          console.log("Invalid reply to autonudge", error);
          return;
        }

        if (!clan.nudgeSettings) {
          clan.nudgeSettings = { lastNudged: currentTime };
        } else {
          clan.nudgeSettings = { ...clan.nudgeSettings, lastNudged: currentTime };
        }
        await db.set(`clans.${clantag}`, clan);
      }
    }));
  }));
  console.log("Finished clan attack nudges");
}

/* Return which type of race it is.
0 = Training
1 = River race
2 = Colosseum
 */
// Data given is full race object
function getRaceType(data) {
  let type = data.periodType;
  const raceTypeMap = {
    "training": 0,
    "warDay": 1,
    "colosseum": 2
  }
  // Log the exact check being made 
  let raceType = raceTypeMap[type];
  return raceType !== undefined ? raceType : 1;
}

/* Return which type of race it is.
0 = Training
1 = River race
2 = Colosseum
 */
function getDayType(num) {
  const raceTypeMap = {
    0: "Training",
    1: "War Week",
    2: "Colosseum"
  }
  return raceTypeMap[num] || 1;
}

// Check attacks for each person
async function checkAttacks(db, members, raceData, client, guildId, channelId, l2w, botId) {
  let decksRemaining = 200; // total decks a clan can use
  let playersRemaining = 50; // total players that can attack
  let membersIn = {};
  let membersHaveAttacks = { 0: [], 1: [], 2: [], 3: [], 4: [] }; // Normal Attacks
  let memberNotAllAvailableIC = {}; // special case
  let membersDontHaveAttacks = {}; // special case
  let memberPartialsOOC = {}; // out of clan, special case
  let memberNotAllAvailableOOC = {}; // special case
  for (const member of members) {
    membersIn[member.tag] = { name: member.name, role: member.role };
  }

  // special cases for attacks
  let attackedInDifferentClan = false;
  let outOfClanWithAttacks = false;
  let completedAndLeft = false;
  let replaceMe = false;

  let periodIndex = raceData.periodIndex;
  let warDay = (periodIndex % 7) - 2;
  // warDay = 2; // TODO
  for (const participant of raceData.clan.participants) {
    let member = await db.get(`playertags.${participant.tag}`);
    if (!member) {
      member = {
        playerName: participant.name,
        playertag: participant.tag,
        day1DecksUsed: 0,
        day2DecksUsed: 0,
        day3DecksUsed: 0,
        day4DecksUsed: 0,
        currentDay: warDay
      }

      // API attacks when member doesnt exist, else it uses database to get their attacks
      switch (warDay) {
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
      }
    }
    else {
      member.playertag = participant.tag;
    }
    // member.currentDay = 2; // TODO
    // This shows the attacks used by the member
    // If they attacked elsewhere, it will be a different number than the API
    let attacksUsedToday = -999; // member.day#DecksUsed (for today)
    switch (warDay) {
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

    if (!membersIn[participant.tag]) { // member is not in clan
      let updatedMember = memberAttacks(member, participant.decksUsedToday, attacksUsedToday);
      if (updatedMember.hasPartials) {
        updatedMember.notInClan = true;
        outOfClanWithAttacks = true;
        // memberPartialsOOC[participant.tag] = updatedMember; // Member partials
        membersHaveAttacks[attacksUsedToday].push(updatedMember);
        // console.log(updatedMember); // TODO
      }
      if (updatedMember.notAllAttacks) {
        updatedMember.notInClan = true;
        attackedInDifferentClan = true;
        updatedMember.attacksInClan = participant.decksUsedToday;
        memberNotAllAvailableOOC[participant.tag] = updatedMember;
      }

    }
    else { // member is in clan
      let updatedMember = memberAttacks(member, participant.decksUsedToday, attacksUsedToday, true)
      updatedMember.role = membersIn[participant.tag].role;
      // If member has attacks left to use in the clan
      if (updatedMember.hasPartials >= 0) {
        membersHaveAttacks[attacksUsedToday].push(updatedMember);
      }
      // Member in clan, but used attacks in a different clan
      if (updatedMember.notAllAttacks) {
        attackedInDifferentClan = true;
        memberNotAllAvailableIC[participant.tag] = updatedMember;
      }
      // Member in clan, but used 4 in another clan
      if (updatedMember.completedInDiffClan) {
        membersDontHaveAttacks[participant.tag] = updatedMember;
        completedAndLeft = true;
      }
    }

    if (participant.decksUsedToday > 0) {
      decksRemaining -= participant.decksUsedToday;
      playersRemaining--;
    }

  } // for participant loop

  // SPECIAL MESSAGES
  // decksRemaining = 0; // TODO
  if (decksRemaining === 0) {
    console.log("No decks remaining for attacks. Sending special message, no more nudges");
    let embed = new EmbedBuilder()
      // .setTitle(raceData.clan.name)
      .setDescription("✅ There are no more attacks remaining. Fantastic!")
      .setColor("Green")
      .setAuthor({ name: `${raceData.clan.name} scheduled autonudge`, iconURL: process.env.BOT_IMAGE })
    return { embed: embed, noAttacksRemaining: true }; // no attacks left, no more nudges for rest of night
  }

  // Checks if all are 0
  function areAllArraysEmpty(obj) {
    return Object.values(obj).every(arr => arr.length === 0);
  }

  // Decks remaining but no one in clan to complete. If players in clan with not all attacks, inform

  if (decksRemaining !== 0 && areAllArraysEmpty(membersHaveAttacks)) {
    let playersNotAllAttacks = "";
    // Check if someone in the clan but doesn't have all attacks available

    if (Object.keys(memberNotAllAvailableIC).length !== 0) {
      let sortedMemberNotAllAvailableIC = sortObjectByAttribute(memberNotAllAvailableIC, 'playerName');
      playersNotAllAttacks += `\n\n**Be aware, these player(s) do not have complete attacks available:**\n`;
      for (const tag in sortedMemberNotAllAvailableIC) {
        if (sortedMemberNotAllAvailableIC.hasOwnProperty(tag)) {
          const member = sortedMemberNotAllAvailableIC[tag];
          playersNotAllAttacks += `* ${member.playerName} (-${4 - member.availableAttacks})\n`; // red face means can't use all 4 attacks, in clan
        }
      }
    }

    let description = "⚠️ There are no more players in this clan that can use all their attacks.";
    description += `\n<:peopleLeft:1188128630270861492> **${playersRemaining}**\n<:decksLeft:1187752640508088370> **${decksRemaining}**\n`
    if (playersNotAllAttacks.trim() !== "") {
      description += playersNotAllAttacks;
    }

    let embed = new EmbedBuilder()
      // .setTitle(raceData.clan.name)
      .setDescription(description)
      .setColor("Orange")
      .setAuthor({ name: `${raceData.clan.name} scheduled autonudge`, iconURL: process.env.BOT_IMAGE });

    return { embed: embed, areAttacksRemaining: true }; // attacks leftover but none in clan that can attack, keep nudging
  }


  for (let attacksLeft in membersHaveAttacks) {
    membersHaveAttacks[attacksLeft] = sortNames(membersHaveAttacks[attacksLeft]);
  }

  const now = moment().tz('America/Phoenix');
  const hour = now.hour();


  let reply = "";
  if (l2w) {
    reply += `You are in a L2W clan, ${raceData.clan.name}, please throw your battles. By: <@${botId}>\n\n`
  }
  else {
    reply += `AUTONUDGE. You have attacks left in ${raceData.clan.name}. By <@${botId}>\n\n`
  }
  for (let attacks = 0; attacks < 4; attacks++) {
    let players = [];
    for (let player of membersHaveAttacks[attacks]) { // go through each array for attacks
      let discordData = await db.get(`users.${player.discordId}`).catch(() => null);
      let role = player.role;
      let attackString = "";
      if (hour >= 21 || hour <= 2) {
        attackString += await checkIfPing(role, player, discordData, true);
      }
      else {
        attackString += await checkIfPing(role, player, discordData, false);
      }

      if (discordData) {
        if (await checkIfCanViewChannel(client, player.discordId, guildId, channelId) === false) {
          attackString = attackString += ' 🙈';
        }
        if (discordData['replace-me'] === true && (player.role === 'member' || player.role === 'elder')) {
          replaceMe = true;
        }
      }
      players.push(attackString);

    }

    if (players.length > 0) {
      if (attacks === 3) {
        reply += `__**${4 - attacks} Attack**__ (${membersHaveAttacks[attacks].length})\n` + players.join('\n') + '\n\n';
      } else {
        reply += `__**${4 - attacks} Attacks**__ (${membersHaveAttacks[attacks].length})\n` + players.join('\n') + '\n\n';
      }
    }
  }



  if (Object.keys(memberNotAllAvailableIC).length !== 0 || Object.keys(memberNotAllAvailableOOC).length !== 0 || Object.keys(membersDontHaveAttacks).length !== 0) {
    reply += `**Attention:**\n`;
    for (const tag in memberNotAllAvailableIC) {
      if (memberNotAllAvailableIC.hasOwnProperty(tag)) {
        const member = memberNotAllAvailableIC[tag];
        reply += `* ${member.playerName} (-${4 - member.availableAttacks}) 🛑\n`; // red face means cant use all 4 attacks, in clan // TODO?
      }
    }
    for (const tag in memberNotAllAvailableOOC) {
      if (memberNotAllAvailableOOC.hasOwnProperty(tag)) {
        const member = memberNotAllAvailableOOC[tag];
        if (member.discordId) {
          reply += `* ${member.playerName} (-${4 - member.attacksInClan - member.availableAttacks}) 🛑\n`; // means attacked in clan, then used elsewhere in diff clan family
        }
        else {
          reply += `* ${member.playerName} (-${4 - member.attacksInClan - member.availableAttacks}) 🛑\n`; // means attacked in clan, then used elsewhere in diff clan family
        }
      }
    }
    for (const tag in membersDontHaveAttacks) {
      if (membersDontHaveAttacks.hasOwnProperty(tag)) {
        const member = membersDontHaveAttacks[tag];
        reply += `* ${member.playerName} 🤝\n`; // handshake means they did all attacks somewhere else
      }
    }
    reply += '\n'
  }

  reply += `<:peopleLeft:1188128630270861492> ${playersRemaining}\n<:decksLeft:1187752640508088370> ${decksRemaining}\n`

  // special cases for attacks
  if (completedAndLeft) {
    reply += `🤝 In clan, used all 4 attacks in different clan.\n`
  }
  if (replaceMe) {
    reply += `⚠️ Needs to be replaced.\n`
  }
  if (outOfClanWithAttacks) {
    reply += `❌ is out of clan.\n`
  }
  if (attackedInDifferentClan) {
    reply += `🛑 has partials in different clan. Can't use all # attacks\n`
  }
  return reply;
}

async function checkIfCanViewChannel(client, discordId, guildId, channelId) {
  const guild = client.guilds.cache.get(guildId);
  const channel = await client.channels.fetch(channelId);
  const member = await guild.members.fetch(discordId);
  if (channel && member && channel.permissionsFor(member).has(PermissionsBitField.Flags.ViewChannel)) {
    return true;
  }
  return false;
}

/* 
playerData: {
  discordId: '272201620446511104',
  playerName: 'Zacky2',
  playertag: '#J20Y2QG0Y',
  currentDay: 2,
  day2DecksUsed: 0
} 
  DiscordData: { 'attacking-late': true, playertags: [ '#P9J292JCL', '#J20Y2QG0Y' ] }
*/
async function checkIfPing(role, playerData, discordData, all) {
  let emojis = [];

  if (all) { // all ping for attacking lates
    if (playerData && playerData.notInClan) {
      emojis.push('❌');
      return pingPlayer(playerData, !!discordData, true, emojis);
    }

    if (discordData) {
      if (discordData['replace-me'] === true && (playerData.role !== 'coLeader' || playerData.role !== 'leader')) {
        emojis.push('⚠️');
        return pingPlayer(playerData, true, false, emojis);
      }

      // if  pingCo is true, ping them
      if (discordData?.pingCo === true) {
        return pingPlayer(playerData, true, true, emojis);
      }
      else if (discordData?.pingCo === false || ((playerData.role === 'coLeader' || playerData.role === 'leader'))) {
        if (discordData?.pingCo === false) {
          emojis.push('👴')
        }
        return pingPlayer(playerData, true, false, emojis);
      }
      else {
        return pingPlayer(playerData, true, true, emojis);
      }
    }
  }

  if (!discordData && playerData.notInClan) {
    emojis.push('❌');
    return pingPlayer(playerData, false, false, emojis);
  }

  if (discordData && playerData.notInClan) {
    emojis.push('❌');
    return pingPlayer(playerData, true, true, emojis);
  }

  if (!discordData) { // no discord account linked
    if (role === 'coLeader' || role === 'leader') {
      return `* **${playerData.playerName}**`; // don't ping co-leaders/leaders
    }
    return pingPlayer(playerData, false, false, emojis);
  }

  // if (discordData && (role === 'coLeader' || role === 'leader')) {
  if (discordData) {
    if (discordData?.pingCo === true) { // Don't ping if false
      return pingPlayer(playerData, true, true, emojis);
    }
    else if (discordData?.pingCo === false || ((playerData.role === 'coLeader' || playerData.role === 'leader'))) {
      if (discordData?.pingCo === false) {
        emojis.push('👴')
      }
      return pingPlayer(playerData, true, false, emojis);
    }
    else {
      return pingPlayer(playerData, true, true, emojis)
    }
    return `* **${playerData.playerName}** ❓`; // don't ping co-leaders/leaders
  }

  if (discordData['replace-me'] === true) {
    emojis.push('⚠️');
    return pingPlayer(playerData, true, false, emojis);
  }

  if (discordData && playerData.notInClan) {
    emojis.push('❌');
    return pingPlayer(playerData, true, true, emojis);
  }

  if (discordData['attacking-late'] === true) {
    emojis.push('✅');
  }

  return pingPlayer(playerData, true, true, emojis);
}

function pingPlayer(playerData, linked, ping, emojis = []) {
  const emojiString = emojis.join(' ');
  if (!linked) {
    return `* ${playerData.playerName} (__not linked__) ${emojiString}`;
  }

  if (linked && !ping) {
    return `* **${playerData.playerName}** ${emojiString}`; // don't ping co-leaders/leaders
  }

  return `* <@${playerData.discordId}> (${playerData.playerName}) ${emojiString}`;
}





// Check if the member out of clan has partial attacks to use
function memberAttacks(memberData, clanAttacks, overallAttacks, inClan) {
  /* 
    This is for members not in the clan
    1. availableClanAttacks - availablePlayerAttacks = 0, 2 - 2, has partials and should ping
    2. availableClanAttacks - availablePlayerAttacks = positive, 4 - 3, cannot use all battles, show and send message to leaders
    3. availableClanAttacks - availablePlayerAttacks = negative, 3 - 4, shouldnt be possible, data error
    4. If availableClanAttacks - availablePlayerAttacks = 0, players--, dont show, means all attacks done
  */
  let availableClanAttacks = 4 - clanAttacks; // TOTAL ATTACKS THE PLAYER CAN USE IN CLAN
  let availablePlayerAttacks = 4 - overallAttacks; // TOTAL ATTACKS THE PLAYER HAS REMAINING
  let attacks = availableClanAttacks - availablePlayerAttacks; // Attacks a person can do in clan
  memberData.availableAttacks = 4 - overallAttacks;

  // console.log(memberData, availableClanAttacks, availablePlayerAttacks, attacks);
  if (availablePlayerAttacks === 0 && availableClanAttacks === 4) { // did all 4 attacks in different clan(s)
    memberData.completedInDiffClan = true;
    return memberData;
  }
  else if (attacks === 4) { // 4. Completed all battles in clan, no ping
    return memberData;
  }
  // FIX FOR LATER
  // If attacks > 0 && attacks available by player does not equal amount available in clan?
  else if (attacks > 0 && inClan) { // 2. Doesnt have all attacks available while they are in the clan
    memberData.notAllAttacks = true;
    return memberData;
  }
  else if ((attacks === 0 && availableClanAttacks !== 4 && availablePlayerAttacks !== 0) || inClan) { // 1. Player has partials, needs to join back
    memberData.hasPartials = true;
    return memberData;
  }
  else if (attacks < 0) { // Data error if player has more attacks available than can be used in clan
    console.error("DATA ERROR, member not in clan has more attacks to use than available.")
    memberData.dataError = true;
    return memberData;
  }
  else {
    return memberData; // Member left without using any attacks, ignore.
  }

}

// main();

function sortNames(list) {
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

function sortObjectByAttribute(obj, attribute) {
  // Convert the object to an array of entries
  let entries = Object.entries(obj);

  // Sort the array by the specified attribute using localeCompare for string comparison
  entries.sort((a, b) => a[1][attribute].localeCompare(b[1][attribute]));

  // Convert the sorted array back into an object
  return Object.fromEntries(entries);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}



module.exports = { postNudges };