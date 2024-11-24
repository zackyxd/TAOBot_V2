const API = require("../../API.js");
const { Events, ActivityType, EmbedBuilder, Embed } = require("discord.js");
const path = require('path');
const Database = require('better-sqlite3');
const { QuickDB } = require("quick.db")
const fs = require('fs');
const { createSuccessEmbed, createExistEmbed, createErrorEmbed, createMaintenanceEmbed } = require('../../utilities/embedUtility.js');
const cron = require('node-cron');
const { log } = require("console");
const { all } = require("axios");
require('dotenv/config');


const checkRace = async (client) => {
  // cron.schedule('15-59 2 * * *', async function () {
  cron.schedule('*/5 * * * * *', async function () {
    // console.log("Cron job running every minute between 2:15 AM and 2:59 AM");
    // Your code here
    postRace(client);
  }, {
    scheduled: true,
    timezone: 'America/Phoenix'
  });

  cron.schedule('0-20 3 * * *', async function () {
    // cron.schedule('*/5 * * * * *', async function () {
    // console.log("Cron job running every minute between 2:15 AM and 2:59 AM");
    // Your code here
    postRace(client);
  }, {
    scheduled: true,
    timezone: 'America/Phoenix'
  });
}

// Post the race embeds
async function postRace(client) {
  client.guilds.cache.forEach(async (guild) => {
    const dbPath = API.findFileUpwards(__dirname, `guildData/${guild.id}.sqlite`);
    const db = new QuickDB({ filePath: dbPath, timeout: 5000 });
    const clans = await db.get(`clans`);
    if (!clans) return;

    for (const clantag in clans) {
      const channelId = await db.get(`clans.${clantag}.importantChannel`);
      let channel = guild.channels.cache.get(channelId);
      if (channel) {
        let updatedData = await getNewData(clantag);
        // console.log(updatedData);
        let raceData = updatedData.data;
        let newAttacks = await getAttacks(raceData);

        let embed = null;
        let embed2 = null;
        let oldRaceInfo = await db.get(`clanTest.${clantag}`);
        if (!oldRaceInfo) { // If no previous race info, add it.
          console.log("No race info, adding:", clantag);
          let grabData = await getNewData(clantag);
          await addToDatabase(clantag, grabData.data, guild.id);
          continue;
        }
        // console.log("Old vs new periodindex:", oldRaceInfo.periodIndex, newPeriodIndex);
        let raceType = checkWhichTypeRace(oldRaceInfo); // Get race type. 0, 1, 2
        if (!isNewDay(oldRaceInfo.attacks, newAttacks, oldRaceInfo.periodIndex, raceData.periodIndex, oldRaceInfo.clanName)) {
          console.log("Not new day, update database with new data");
          await addToDatabase(clantag, raceData, guild.id)
          continue;
        }
        // console.log("RaceType entered:", raceType);
        if (raceType === 1) {
          // Regular War Day
          console.log("War Day");
          let allClans = getAllClans(oldRaceInfo);
          embed = await outputWarDayInfo(allClans, clantag, oldRaceInfo.periodIndex, oldRaceInfo.sectionIndex, oldRaceInfo.clanName);
          embed2 = await remainingAttacks(oldRaceInfo);
        }
        else if (raceType === 2) {
          // Colosseum Day
          console.log("Colosseum Day");
          let allClans = getAllClans(oldRaceInfo);
          embed = await outputColoInfo(allClans, clantag, oldRaceInfo.periodIndex);
          embed2 = await remainingAttacks(oldRaceInfo);
        }
        else {
          // Training Day
          console.log("Training Day, update database and wait for non-training day");
          await addToDatabase(clantag, raceData, guild.id);
          continue;
        }
        try {
          console.log("POST FOR:", clantag);
          await channel.send({ embeds: [embed] });  // Send the message
          await channel.send({ embeds: [embed2] });  // Send the message
          await addToDatabase(clantag, raceData, guild.id);
          console.log(`Message sent to guild: ${guild.name}`);
        } catch (error) {
          console.error(`Failed to send message to guild: ${guild.name}`, error);
        }
      }
    }
  });
}

function isNewDay(oldAttacks, newAttacks, oldPeriodIndex, newPeriodIndex) {
  // If new - old is negative, means it's a new day.
  return true;
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
    console.log(clanInfo);
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
  let raceType = raceTypeMap[data.periodType];
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

  let type = checkWhichTypeRace(data);
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
    day = (data.periodIndex % 7) - 2;
    for (let i = 1; i < day; i++) {
      decksUsed += 200;
    }
    average = round(clan.fameEarned / decksUsed, 2); // Get total average for all days
    fameEarned = clan.fameEarned;
    decksUsed = decksUsed % 200;
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
      description += `<:ProjectedPoints:1187754001312272526> ${clans[i].projectedPoints.toLocaleString()}\n`;
      description += `<:decksLeft:1187752640508088370> ${clans[i].decksLeft}\n`;
      description += `**<:average:1187754016780849253> ${clans[i].average}**\n\n`;
    }
    else {
      description += `**${i + 1}. ${escapedName} <:${clans[i].badgeId}:${await findEmojiId(badgeId)}>**`;
      description += `<:fame:1191543365867684003> ${clans[i].fameEarned.toLocaleString()}\n`;
      description += `<:ProjectedPoints:1187754001312272526> ${clans[i].projectedPoints.toLocaleString()}\n`;
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
async function addToDatabase(clantag, data, guildId) {
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
  await db.set(`clanTest.${clantag}`, {
    clans: relevantData,
    attacks: await getAttacks(data), // get attacks for the clan checking,
    periodIndex: data.periodIndex, // is day of war
    sectionIndex: data.sectionIndex,
    periodType: data.periodType,
    clantag: clantag,
    playersRemaining: playersRemainingForAttacks,
    clanName: data.clan.name
  });
  // console.log(test);
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

async function remainingAttacks(data) {
  let clan;
  for (clan of data.clans) {
    if (clan.clantag !== data.clantag) {
      continue;
    }
    console.log("Found the clan:", clan.clanName)

    let participants = clan.participants;
    // console.log(participants);
    let clanData = await API.getClan(clan.clantag);
    let membersInClan = {};
    let membersNotInClan = {};
    let attacksUsed = { 0: [], 1: [], 2: [], 3: [], 4: [] };
    for (const member of clanData.memberList) {
      membersInClan[member.tag] = { name: member.name, role: member.role };
    }

    for (const participant of participants) {
      // console.log(participant);
      if (participant.decksUsedToday >= 0) {
        if (membersInClan[participant.tag]) {
          membersInClan[participant.tag].decksUsedToday = participant.decksUsedToday;
          attacksUsed[participant.decksUsedToday].push(participant.playerName);
        }
        else if (!membersInClan[participant.tag] && participant.decksUsedToday >= 1) {
          let nameWithStar = participant.playerName + ' ❌';
          membersNotInClan[participant.tag] = { name: nameWithStar, decksUsedToday: participant.decksUsedToday };
          attacksUsed[participant.decksUsedToday].push(nameWithStar);
        }
      }
    }

    for (let i = 4; i >= 0; i--) {
      attacksUsed[i].sort();
    }

    let description = "";
    // If not past the finish line
    if (clan.boatPoints < 10000) {
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

    let embed = new EmbedBuilder()
      .setTitle("__" + clanData.name + "__")
      .setURL(`https://royaleapi.com/clan/${(clanData.tag).substring(1)}/war/race`)
      .setAuthor({ name: `${getDayType(checkWhichTypeRace(data.periodType))} ${data.sectionIndex + 1} | Day ${data.periodIndex % 7 - 2}` })
      .setDescription(description)
      .setColor('Purple')
      .setThumbnail(process.env.BOT_IMAGE)
      .setTimestamp()
    // .setFooter({ text: footer });
    // console.log(embed);
    return embed;

  }

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