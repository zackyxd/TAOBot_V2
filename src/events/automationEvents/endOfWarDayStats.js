const API = require("../../API.js");
const { Events, ActivityType, EmbedBuilder, Embed } = require("discord.js");
const path = require('path');
const { QuickDB } = require("quick.db")
const fs = require('fs');
const { createSuccessEmbed, createExistEmbed, createErrorEmbed, createMaintenanceEmbed } = require('../../utilities/embedUtility.js');
const cron = require('node-cron');
const { channel } = require("diagnostics_channel");
const { findAttacks } = require('../dataUpdates/findPlayerAttacksInClans.js');
require('dotenv/config');


const checkRace = async (client) => {
  // cron.schedule('15-59 2 * * *', async function () {
  cron.schedule('15-59/2 2 * * 4,5,6,7,1', async function () {
    // cron.schedule('*/10 * * * * *', async function () {
    // console.log("Cron job running every minute between 2:15 AM and 2:59 AM");
    // Your code here
    postRace(client);
  }, {
    scheduled: true,
    timezone: 'America/Phoenix'
  });

  cron.schedule('0-59/2 3 * * 4,5,6,7,1', async function () {
    // cron.schedule('*/20 * * * * *', async function () {
    // console.log("Cron job running every minute between 2:15 AM and 2:59 AM");
    // Your code here
    postRace(client);
  }, {
    scheduled: true,
    timezone: 'America/Phoenix'
  });

  cron.schedule('0 5 * * *', async function () {
    client.guilds.cache.forEach(async (guild) => {
      const db = await API.getDb(guild.id);
      const clans = await db.get('warResetRaceData');
      if (!clans) return;

      for (const clantag in clans) {
        let clanInfo = clans[clantag];
        if (clanInfo['postedRace'] === true) {
          clanInfo['postedRace'] = false;
          clans[clantag] = clanInfo;
        }
      }
      await db.set('warResetRaceData', clans)
    })
    console.log("Finished resetting all posted races to false posted");
  }, {
    scheduled: true,
    timezone: 'America/Phoenix'
  })

  cron.schedule('0 2 * * 4', async function () {
    client.guilds.cache.forEach(async (guild) => {
      const db = await API.getDb(guild.id);
      const clans = await db.get('warResetRaceData');
      if (!clans) return;

      await db.set('warResetRaceData', {})
    })
    console.log("Deleted race data");
  }, {
    scheduled: true,
    timezone: 'America/Phoenix'
  })
}



// Post the race embeds
async function postRace(client) {
  client.guilds.cache.forEach(async (guild) => {

    const dbPath = API.findFileUpwards(__dirname, `guildData/${guild.id}.sqlite`);
    const db = new QuickDB({ filePath: dbPath, timeout: 5000 });
    const clans = await db.get(`clans`);
    if (!clans) return;
    // await findAttacks(client); // Update all player attacks in database

    for (const clantag in clans) {
      const channelId = await db.get(`clans.${clantag}.importantChannel`);
      let channel = guild.channels.cache.get(channelId);
      if (channel) {
        let updatedData = await getNewData(clantag);
        // console.log(updatedData);
        let raceData = updatedData.data;
        let newAttacks = await getAttacks(raceData);

        let warScoresEmbed = null;
        let attacksLeftEmbed = null;
        let oldRaceInfo = await db.get(`warResetRaceData.${clantag}`);
        if (!oldRaceInfo) { // If no previous race info, add it.
          console.log("No race info, adding:", clantag);
          let grabData = await getNewData(clantag);
          await addToDatabase(clantag, grabData.data, guild.id, false);
          continue;
        }

        if (oldRaceInfo?.postedRace === true) {
          console.log("Race has already been posted for:", oldRaceInfo.clanName, ". Do not post again yet.");
          continue;
        }
        // console.log("Old vs new periodindex:", oldRaceInfo.periodIndex, newPeriodIndex);
        let raceType = checkWhichTypeRace(oldRaceInfo.periodType); // Get race type. 0, 1, 2
        if (!isNewDay(oldRaceInfo.attacks, newAttacks, oldRaceInfo.periodIndex, raceData.periodIndex, oldRaceInfo.clanName)) {
          console.log("Not new day, update database with new data");
          await addToDatabase(clantag, raceData, guild.id, false)
          continue;
        }
        // console.log("RaceType entered:", raceType);
        if (raceType === 1) {
          // Regular War Day
          console.log("War Day");
          let allClans = getAllClans(oldRaceInfo);
          warScoresEmbed = await outputWarDayInfo(allClans, clantag, oldRaceInfo.periodIndex, oldRaceInfo.sectionIndex, oldRaceInfo.clanName);
          attacksLeftEmbed = await remainingAttacks(oldRaceInfo, db);
        }
        else if (raceType === 2) {
          // Colosseum Day
          console.log("Colosseum Day");
          let allClans = getAllClans(oldRaceInfo);
          warScoresEmbed = await outputColoInfo(allClans, clantag, oldRaceInfo.periodIndex, oldRaceInfo.clanName);
          attacksLeftEmbed = await remainingAttacks(oldRaceInfo, db);
        }
        else {
          // Training Day
          console.log("Training Day, update database and wait for non-training day");
          await addToDatabase(clantag, raceData, guild.id, false);
          continue;
        }

        try {
          console.log("POST FOR:", clantag);
          let warScoreMessage = await channel.send({ embeds: [warScoresEmbed] });
          let attacksLeftMessage = await channel.send({ embeds: [attacksLeftEmbed] });
          await addToDatabase(clantag, raceData, guild.id, true);

          // oldRaceInfo is the API race data
          await pinRace(db, guild.id, oldRaceInfo, warScoreMessage, attacksLeftMessage); // Call pin race to pin the current race

          console.log(`Message sent to guild: ${guild.name}`);
        } catch (error) {
          console.error(`Failed to send message to guild: ${guild.name}`, error);
        }
      }
    }
    console.log("Finished end of day stats for all clans");
  });
}

function isNewDay(oldAttacks, newAttacks, oldPeriodIndex, newPeriodIndex) {
  // If new - old is negative, means it's a new day.
  // return true;
  if (newAttacks - oldAttacks < 0) {
    console.log("New day by attacks");
    return true;
  }
  else if (newAttacks - oldAttacks === 0) {
    if (oldPeriodIndex !== newPeriodIndex) {
      console.log("New day by period index");
      return true;
    }
  }
  return false;
}


function getAllClans(data) {
  let allClans = [];
  for (let i = 0; i < data.clans.length; i++) {
    let clanInfo = getImportantRaceInfo(data, i);
    // console.log(clanInfo);
    allClans.push(clanInfo);
  }
  return allClans;
}


async function getNewData(clantag) {
  if (clantag.charAt(0) !== "#") clantag = "#" + clantag;
  const data = await API.getCurrentRiverRace(clantag);
  // console.log("Returning data with tag:", clantag);
  return { clantag, data, data };

  // const mockDataPath = path.resolve(__dirname, 'mockData.json');
  // const data = JSON.parse(fs.readFileSync(mockDataPath, 'utf8'));
  return { data, clantag };
}

/* Return which type of race it is.
0 = Training
1 = River race
2 = Colosseum
 */
function checkWhichTypeRace(data) {
  const raceTypeMap = {
    "training": 0,
    "warDay": 1,
    "colosseum": 2
  }
  // Log the exact check being made 
  let raceType = raceTypeMap[data];
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



// Get the important stuff, go through participants.
/* Example data:
{
  badgeId: 16000139,
  clanName: 'TheAddictedOnes',
  clantag: '#9U82JJ0Y',
  decksUsed: 2,
  fame: 0,
  participants: [Array]
}
  */
function getImportantRaceInfo(data, i) {
  // console.log("Getting important race info for:", data.clans[i].clanName)
  // console.log("Reading this data:", data);
  let day = -1;
  let projectedPoints = 0.0;
  let fameEarned = 0;
  let decksUsed = 0;
  let playersLeft = 50;
  let average = 0.0;
  let boatPoints = 0;

  let clan = data.clans[i];
  // console.log("SEPERATE CLAN HERE", clan);
  for (let j = 0; j < clan.participants.length; j++) {
    let participant = clan.participants[j];
    decksUsed += participant.decksUsedToday;
    if (participant.decksUsedToday >= 1) {
      playersLeft--;
    }
  }

  if (decksUsed === 0) {
    decksUsed = clan.decksUsed;
  }

  let type = checkWhichTypeRace(data.periodType);
  if (type === 1) {
    warDayRace();
  }
  else if (type === 2) {
    coloRace();
  }
  else {
    // training
  }

  function warDayRace() {
    day = (data.periodIndex % 7) - 2;
    average = round(clan.fameEarned / clan.decksUsed, 2); // Get total average for all days
    fameEarned = clan.fameEarned;
    decksUsed = clan.decksUsed % 200;
    projectedPoints = clan.fameEarned + Math.round((average * (200 - clan.decksUsed)) / 50) * 50;
    boatPoints = clan.boatPoints
  }


  // Colo race inside of getImportantRaceInfo
  function coloRace() {
    // console.log("Checking Colo race info");
    day = (data.periodIndex % 7) - 2;
    // console.log("Day #: ", day);
    // console.log("Decks used: ", decksUsed);
    for (let i = 1; i < day; i++) {
      decksUsed += 200;
    }
    // console.log("Decks used after adding days: ", decksUsed);

    average = round(clan.fameEarned / decksUsed, 2); // Get total average for all days
    fameEarned = clan.fameEarned;
    decksUsed = decksUsed % 200;
    // console.log("Decks used after % 200: ", decksUsed);
    projectedPoints = fameEarned + Math.round((average * (200 - decksUsed)) / 50) * 50;
  }


  if (isNaN(projectedPoints) || projectedPoints === undefined) {
    projectedPoints = 0;
  }
  if (isNaN(average) || average === undefined) {
    average = 0;
  }

  // console.log("decks left", 200 - clan.decksUsed);
  // console.log("FAME EARNED HERE", fameEarned);
  return {
    clanName: clan.clanName,
    clantag: clan.clantag,
    badgeId: clan.badgeId,
    fameEarned: fameEarned,
    decksLeft: 200 - clan.decksUsed,
    average: average,
    projectedPoints: projectedPoints,
    boatPoints: boatPoints,
    playersLeft: playersLeft
  }
}



// Check if a new day by comparing the attacks
async function getAttacks(data) {
  let totalAttacks = 0;
  // console.log(relevantData);
  // Iterate through the specified clan's participants and count attacks
  // let data = await API.getCurrentRiverRace(clantag);
  for (const participant of data.clan.participants) {
    totalAttacks += participant.decksUsedToday;
  }
  return totalAttacks;
}


function round(value, decimals) {
  return Number(Math.round(value + 'e' + decimals) + 'e-' + decimals).toFixed(decimals);
}


async function outputWarDayInfo(clans, ogClantag, periodIndex, sectionIndex, mainClanName) {
  // console.log("Clans output:", clans);

  let day = (periodIndex % 7) - 2;
  let week = sectionIndex + 1;
  let dayType = getDayType(1);
  clans.sort(function (a, b) {
    if (a.boatPoints > 10000 && b.boatPoints <= 10000) {
      return -1; // a comes first
    } else if (b.boatPoints > 10000 && a.boatPoints <= 10000) {
      return 1; // b comes first
    } else {
      return b.fameEarned - a.fameEarned; // sort by fameToday if both are over 10000 or both are under 10000
    }
  })

  let description = "";
  for (let i = 0; i < clans.length; i++) {
    let badgeId = clans[i].badgeId;
    let escapedName = escapeMarkdown(clans[i].clanName);
    if (ogClantag === clans[i].clantag) {
      if (clans[i].boatPoints >= 10000) {
        description += `__**${i + 1}. ${escapedName} <:${clans[i].badgeId}:${await findEmojiId(badgeId)}>**__`;
        description += `✅\n\n`
        continue;
      }
      description += `__**${i + 1}. ${escapedName} <:${clans[i].badgeId}:${await findEmojiId(badgeId)}>**__`;
      description += `<:fame:1191543365867684003> ${clans[i].fameEarned.toLocaleString()}\n`;
      // description += `<:ProjectedPoints:1187754001312272526> ${clans[i].projectedPoints.toLocaleString()}\n`;
      description += `<:decksLeft:1187752640508088370> ${clans[i].decksLeft}\n`;
      description += `**<:average:1187754016780849253> ${clans[i].average}**\n\n`;
    }
    else {
      if (clans[i].boatPoints >= 10000) {
        description += `**${i + 1}. ${escapedName} <:${clans[i].badgeId}:${await findEmojiId(badgeId)}>**`;
        description += `✅\n\n`
        continue;
      }
      description += `**${i + 1}. ${escapedName} <:${clans[i].badgeId}:${await findEmojiId(badgeId)}>**`;
      description += `<:fame:1191543365867684003> ${clans[i].fameEarned.toLocaleString()}\n`;
      // description += `<:ProjectedPoints:1187754001312272526> ${clans[i].projectedPoints.toLocaleString()}\n`;
      description += `<:decksLeft:1187752640508088370> ${clans[i].decksLeft}\n`;
      description += `**<:average:1187754016780849253> ${clans[i].average}**\n\n`;
    }
  }

  let tag = ogClantag.replace(/#/g, "");
  const embedReturn = new EmbedBuilder()
    .setTitle(`__${mainClanName}__`)
    .setURL(`https://royaleapi.com/clan/${tag}/war/race`)
    .setDescription(description)
    .setColor('Purple')
    .setAuthor({ name: `War Week ${week} | Day ${day}` })
    .setThumbnail(process.env.BOT_IMAGE)
    .setTimestamp();
  return embedReturn;
}

async function outputColoInfo(clans, ogClantag, periodIndex, mainClanName) {
  // console.log("clans:", clans)
  let day = (periodIndex % 7) - 2;
  let dayType = getDayType(2);
  clans.sort(function (a, b) {
    if (a.fameEarned !== b.fameEarned) {
      return b.fameEarned - a.fameEarned;
    }
    else {
      return b.projectedPoints - a.projectedPoints;
    }
  })
  let description = "";
  for (let i = 0; i < clans.length; i++) {
    let badgeId = clans[i].badgeId;
    let escapedName = escapeMarkdown(clans[i].clanName);
    if (ogClantag === clans[i].clantag) {
      description += `__**${i + 1}. ${escapedName} <:${clans[i].badgeId}:${await findEmojiId(badgeId)}>**__`;
      description += `<:fame:1191543365867684003> ${clans[i].fameEarned.toLocaleString()}\n`;
      // description += `<:ProjectedPoints:1187754001312272526> ${clans[i].projectedPoints.toLocaleString()}\n`;
      description += `<:decksLeft:1187752640508088370> ${clans[i].decksLeft}\n`;
      description += `**<:average:1187754016780849253> ${clans[i].average}**\n\n`;
    }
    else {
      description += `**${i + 1}. ${escapedName} <:${clans[i].badgeId}:${await findEmojiId(badgeId)}>**`;
      description += `<:fame:1191543365867684003> ${clans[i].fameEarned.toLocaleString()}\n`;
      // description += `<:ProjectedPoints:1187754001312272526> ${clans[i].projectedPoints.toLocaleString()}\n`;
      description += `<:decksLeft:1187752640508088370> ${clans[i].decksLeft}\n`;
      description += `**<:average:1187754016780849253> ${clans[i].average}**\n\n`;
    }
  }
  let tag = ogClantag.replace(/#/g, "");
  const embedReturn = new EmbedBuilder()
    .setTitle(`__${mainClanName}__`)
    .setURL(`https://royaleapi.com/clan/${tag}/war/race`)
    .setDescription(description)
    .setColor('Purple')
    .setAuthor({ name: `Colosseum | Day ${day}` })
    .setThumbnail(process.env.BOT_IMAGE)
    .setTimestamp();
  return embedReturn;
}

// Data given is full API data
// posted is whether or not it has posted yet
async function addToDatabase(clantag, data, guildId, posted) {
  // console.log(`Updating ${clantag} to database`)
  // console.log(data);
  // console.log(`Storing this data:`, data);
  // Extract all clans and specifically handle participants for the entered clantag
  const dbPath = API.findFileUpwards(__dirname, `guildData/${guildId}.sqlite`);
  const db = new QuickDB({ filePath: dbPath, timeout: 5000 });

  let playersRemainingForAttacks = 50;
  let relevantData = data.clans.map(clan => {
    let playersRemaining = 50;
    let participants = [];
    let decksUsed = 0;
    let periodPoints = -1;
    if (clan.tag === data.clan.tag) {
      participants = clan.participants.map(participant => {
        if (participant.decksUsedToday >= 1) {
          playersRemaining--;
          playersRemainingForAttacks--;
        }
        decksUsed += participant.decksUsedToday;  // Add to decksUsed
        return {
          playerName: participant.name,
          tag: participant.tag,
          decksUsedToday: participant.decksUsedToday,
        };
      });
      periodPoints = clan.periodPoints;
    } else {
      // decksUsed = clan.participants.reduce((total, participant) => total + participant.decksUsedToday, 0);
      // periodPoints = clan.periodPoints;
      clan.participants.forEach(participant => {
        if (participant.decksUsedToday >= 1) {
          playersRemaining--;
        }
        decksUsed += participant.decksUsedToday;
      });
      periodPoints = clan.periodPoints;
    }

    return {
      clanName: clan.name,
      clantag: clan.tag,
      fameEarned: data.periodType === 'warDay' ? clan.periodPoints : clan.fame,
      participants: participants,
      decksUsed: decksUsed,
      badgeId: clan.badgeId,
      boatPoints: clan.fame,
      playersRemaining: playersRemaining
    };
  });

  // console.log("Data given", data);
  await db.set(`warResetRaceData.${clantag}`, {
    clans: relevantData,
    attacks: await getAttacks(data), // get attacks for the clan checking,
    periodIndex: data.periodIndex, // is day of war
    sectionIndex: data.sectionIndex,
    periodType: data.periodType,
    clantag: clantag,
    playersRemaining: playersRemainingForAttacks,
    clanName: data.clan.name,
    postedRace: posted
  });
  // console.log(test);
}

async function pinRace(db, guildId, raceData, warScoreMessage, attacksLeftMessage) {
  // console.log(warScoreMessage, attacksLeftMessage);
  let clan = raceData.clans.find(clan => clan.clantag === raceData.clantag);
  // console.log(clan);
  let day = (raceData.periodIndex % 7) - 2;
  let week = raceData.sectionIndex + 1;

  let clanInfo = { day: day, week: week };

  // Need to make the days into key and value so i can iterate through them to create the message

  let pinData = await db.get(`pinnedRaceMessage.${raceData.clantag}`); // Info of the message and days

  let days;
  if (pinData && pinData.day <= day) {
    days = pinData?.days || {};
  }
  else if (pinData && pinData.day > day) {
    // Reset both, make sure days is set
    pinData.days = {};
    days = pinData.days;
  }
  else {
    days = {}; // Create object
  }

  function createHyperlink(text, guildId, channelId, messageId) {
    return `[${text}](<https://discord.com/channels/${guildId}/${channelId}/${messageId}>)`;
  }

  days[day] = `### Day ${day}\n**${createHyperlink(`Scores`, guildId, warScoreMessage.channel.id, warScoreMessage.id)} | ${createHyperlink(`Attacks`, guildId, attacksLeftMessage.channel.id, attacksLeftMessage.id)}**`;
  if (pinData) {
    pinData.days = days;
  }
  else {
    clanInfo.days = days;
  }

  function createPinnedMessage(clan, days, dayType) {
    let description = "";
    for (const day in days) {
      description += `${days[day]}\n`;
    }
    return new EmbedBuilder()
      .setTitle(`__${clan.clanName}__`)
      .setURL(`https://royaleapi.com/clan/${(clan.clantag).substring(1)}/war/race`)
      .setDescription(description)
      .setColor('Purple')
      .setAuthor({ name: `${dayType}` })
      .setThumbnail(process.env.BOT_IMAGE)
  }

  let pinnedMessage;
  let dayType = raceData.periodType === "warDay" ? `War Week ${week}` : `Colosseum`;
  if (pinData && day >= pinData.day) { // Edit if race data day is higher.
    let channelToSendTo = await client.channels.fetch(warScoreMessage.channel.id);

    try {
      pinnedMessage = await channelToSendTo.messages.fetch(pinData.messageId);
    }
    catch (error) { // If message doesn't exist, create new one and send it. 
      let channelToSendTo = await client.channels.fetch(warScoreMessage.channel.id);
      pinnedMessage = await channelToSendTo.send({ embeds: [createPinnedMessage(clan, days, dayType)] });
      pinnedMessage.pin();
      clanInfo.messageId = pinnedMessage.id;
    }

    await pinnedMessage.edit({ embeds: [createPinnedMessage(clan, days, dayType)] });
    if (pinnedMessage.pinned === false) {
      pinnedMessage.pin();
    }
  }
  // If day is lower, reset the pinned message as new week.
  else if (pinData && day < pinData.day) {
    let channelToSendTo = await client.channels.fetch(warScoreMessage.channel.id);
    try {
      pinnedMessage = await channelToSendTo.messages.fetch(pinData.messageId);
      pinnedMessage.unpin();

      pinnedMessage = await channelToSendTo.send({ embeds: [createPinnedMessage(clan, days, dayType)] });
      pinnedMessage.pin();
      clanInfo.messageId = pinnedMessage.id;
    }
    catch (error) { // If pinned message is deleted, just create new one.
      let channelToSendTo = await client.channels.fetch(warScoreMessage.channel.id);
      pinnedMessage = await channelToSendTo.send({ embeds: [createPinnedMessage(clan, days, dayType)] });
      pinnedMessage.pin();
      clanInfo.messageId = pinnedMessage.id;
    }

  }
  else { // Post for first time.
    let channelToSendTo = await client.channels.fetch(warScoreMessage.channel.id);
    pinnedMessage = await channelToSendTo.send({ embeds: [createPinnedMessage(clan, days, dayType)] });
    pinnedMessage.pin();
    clanInfo.messageId = pinnedMessage.id;
  }


  if (pinData) {
    pinData.messageId = pinnedMessage.id; // Update the messageId in pinData if it exists
    pinData.day = day;
    pinData.week = week;
  } else {
    clanInfo.messageId = pinnedMessage.id; // For new data, store it in clanInfo
  }

  await db.set(`pinnedRaceMessage.${raceData.clantag}`, pinData || clanInfo);
}

async function main() {

  const dbPath = API.findFileUpwards(__dirname, `guildData/1182482429299138671.sqlite`);
  const db = new QuickDB({ filePath: dbPath, timeout: 5000 });
  const clans = await db.get(`clans`);
  if (!clans);

  for (const clantag in clans) {
    console.log(clantag);

    let oldRaceInfo = await db.get(`clanTest.${clantag}`);
    // console.log("Oldraceinfo", oldRaceInfo);
    if (!oldRaceInfo) {
      console.log("No race info, adding:", clantag);
      let grabData = await getNewData(clantag);
      await addToDatabase(clantag, grabData.data);
      return;
    }
    console.log("Checking new data");
    let newData = await getNewData(clantag);
    let newAttacks = await getAttacks(newData.data);
    await remainingAttacks(oldRaceInfo);
  }


  return;
}

// main();

// Data is the oldRaceInfo (Current river race), db is the database
async function remainingAttacks(data, db) {
  // console.log(data);
  let clan = data.clans.find(clan => clan.clantag === data.clantag);
  let day = (data.periodIndex % 7) - 2; // Get day for the playertag day
  console.log("Found the clan:", clan.clanName)

  let playertags = await db.get(`playertags`);
  // console.log("playertags:", playertags);

  let participants = clan.participants;
  // console.log(participants);
  let clanData = await API.getClan(clan.clantag);
  let membersInClan = {};
  let membersNotInClan = {};
  let attacksUsed = { 0: [], 1: [], 2: [], 3: [], 4: [] }; // Decks used today. 
  for (const member of clanData.memberList) {
    membersInClan[member.tag] = { name: member.name, role: member.role }; // Decks used today
  }

  let memberUsedInDifferentClan = {};
  let didntUseAllAttacks = {};
  let stopsignInfo = false;
  let handshakeInfo = false;

  for (const participant of participants) {
    // console.log(participant);
    if (participant.decksUsedToday >= 0) {
      if (membersInClan[participant.tag]) {
        // console.log(playertags[participant.tag][`day${day}DecksUsed`]);
        // membersInClan[participant.tag].decksUsedToday = participant.decksUsedToday;
        let decksUsedToday = playertags?.[participant.tag]?.[`day${day}DecksUsed`];
        if (!decksUsedToday) {
          decksUsedToday = participant.decksUsedToday;
        }
        if (decksUsedToday === participant.decksUsedToday) { // If api decks matches database, add as normal.
          attacksUsed[decksUsedToday].push(participant.playerName);
        }
        else if (decksUsedToday === 4 && participant.decksUsedToday === 0) { // Else if 0 attacks in api, but 4 on database, 4 in different clan
          memberUsedInDifferentClan[participant.tag] = { name: participant.playerName, decksUsedToday: playertags[participant.tag][`day${day}DecksUsed`] };
          handshakeInfo = true;
        }
        else if (decksUsedToday < 4) { // Didnt have all attacks
          attacksUsed[4 - decksUsedToday].push(participant.playerName);
        }
      }


      else if (!membersInClan[participant.tag] && participant.decksUsedToday >= 1) {
        let nameWithStar = participant.playerName + ' ❌';
        let decksUsedToday = playertags?.[participant.tag]?.[`day${day}DecksUsed`];
        if (!decksUsedToday) {
          decksUsedToday = participant.decksUsedToday;
        }
        membersNotInClan[participant.tag] = { name: nameWithStar, decksUsedToday: decksUsedToday };
        attacksUsed[participant.decksUsedToday].push(nameWithStar);
      }
    }
  }

  for (let i = 4; i >= 0; i--) {
    attacksUsed[i].sort();
  }

  let extraInfoText = "";
  if (Object.keys(memberUsedInDifferentClan).length !== 0 || Object.keys(didntUseAllAttacks).length !== 0) {
    extraInfoText += `\n**Attention:**\n`;
    for (const tag in memberUsedInDifferentClan) {
      extraInfoText += `* ${memberUsedInDifferentClan[tag].name} 🤝\n`; // API showed 4 attacks available, but used in different family clan
    }

    // for (const tag in didntUseAllAttacks) {
    //   extraInfoText += `* ${didntUseAllAttacks[tag].name} (-${didntUseAllAttacks[tag].decksLost}) 🛑\n`; // Didnt have all attacks
    // }
  }

  let description = "";
  // If not past the finish line
  if (clan.boatPoints < 10000 || data.periodType === "colosseum") {
    for (let i = 0; i <= 3; i++) {
      if (attacksUsed[i].length > 0) {
        if (i !== 0) {
          description += '\n';
        }
        if (i === 3) {
          description += `__**${4 - i} Attack**__ (${attacksUsed[i].length})\n`;
        }
        else {
          description += `__**${4 - i} Attacks**__ (${attacksUsed[i].length})\n`;
        }
      }
      attacksUsed[i].forEach(name => {
        description += "* " + name + "\n";
      })
    }
    description += extraInfoText;
    if (handshakeInfo) description += "\n 🤝 Used 4 attacks in diff. family clan"
    // if (stopsignInfo) description += "\n 🛑 Didn't have all attacks available"
    if (handshakeInfo || stopsignInfo) description += "\n";
    description += `\n<:peopleLeft:1188128630270861492> ${data.playersRemaining}\n<:decksLeft:1187752640508088370> ${200 - data.attacks}`
  }
  else {
    description += "**Remove these attacks.**\n"
    for (let i = 4; i >= 1; i--) {
      if (attacksUsed[i].length > 0) {
        if (i !== 0) {
          description += '\n';
        }
        if (i === 1) {
          description += `__**${i} Attack Used**__ (${attacksUsed[i].length})\n`;
        }
        else {
          description += `__**${i} Attacks Used**__ (${attacksUsed[i].length})\n`;
        }
      }
      attacksUsed[i].forEach(name => {
        description += "* " + name + "\n";
      })
    }
    description += `\n<:peopleLeft:1188128630270861492> ${50 - data.playersRemaining}\n<:decksLeft:1187752640508088370> ${data.attacks}`
  }





  // description += `\n<:peopleLeft:1188128630270861492> ${data.playersRemaining}\n<:decksLeft:1187752640508088370> ${200 - data.attacks}`
  // console.log(description);
  let author = '';
  if (data.periodType === 'colosseum') {
    author = `${getDayType(checkWhichTypeRace(data.periodType))} | Day ${data.periodIndex % 7 - 2}`
  }
  else {
    author = `${getDayType(checkWhichTypeRace(data.periodType))} ${data.sectionIndex + 1} | Day ${data.periodIndex % 7 - 2}`
  }

  let embed = new EmbedBuilder()
    .setTitle("__" + clanData.name + "__")
    .setURL(`https://royaleapi.com/clan/${(clanData.tag).substring(1)}/war/race`)
    .setAuthor({ name: author })
    .setDescription(description)
    .setColor('Purple')
    .setThumbnail(process.env.BOT_IMAGE)
    .setTimestamp()
  // .setFooter({ text: footer });
  // console.log(embed);
  return embed;

}



// Escape markdown issues
function escapeMarkdown(text) {
  let markdownCharacters = ['*', '_', '`', '~', '#'];
  let escapedText = text.split('').map(function (character) {
    if (markdownCharacters.includes(character)) {
      return '\\' + character;
    }
    return character;
  }).join('');
  return escapedText;
}

async function findEmojiId(nameLookingFor) {

  const emojiPath = path.join(__dirname, '..', '..', '..', `emojis.json`);
  let emojis = {}
  try {
    const data = fs.readFileSync(emojiPath, 'utf8');
    emojis = JSON.parse(data); // Parse the JSON string into an array
  } catch (err) {
    console.error('Error loading emojis:', err);
    return []; // Return an empty array in case of an error
  }

  let emojiId = emojis.find(emoji => {
    // Ensure both values are strings and trim any whitespace
    const emojiName = String(emoji.name).trim();
    const trimmedName = String(nameLookingFor).trim();

    return emojiName === trimmedName;
  })?.id;

  if (emojiId) {
    //console.log(`Found emoji ID: ${emojiId}`);
    return emojiId;
  } else {
    console.error(`Emoji not found for: ${nameLookingFor}`);
    return null;
  }
}

module.exports = { checkRace };