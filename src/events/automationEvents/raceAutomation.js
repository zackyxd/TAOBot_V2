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
    // console.log("test");
    // postRace(client);
    cron.schedule('*/5 15-59 2 * * *', async function () {
      // cron.schedule('*/5 * * * * *', async function () {
      // console.log("Cron job running every minute between 2:15 AM and 2:59 AM");
      // Your code here
      postRace(client);
    }, {
      scheduled: true,
      timezone: 'America/Phoenix'
    });
  }
}



async function postRace(client) {
  client.guilds.cache.forEach(async (guild) => {
    const dbPath = API.findFileUpwards(__dirname, `guildData/${guild.id}.sqlite`);
    const db = new QuickDB({ filePath: dbPath, timeout: 5000 });
    const clans = await db.get(`clans`);
    if (!clans);

    for (const clantag in clans) {
      let checkClan = await db.get(`raceDataScore.${clantag}`);

      try {
        console.log(clantag);
        let grabRaceData = await getRace(clantag, db, checkClan?.raceData);
        if (!grabRaceData) { // If clantag returns nothing, continue
          console.log("No grab race data");
          continue;
        }
        console.log(`Checking the race for clan with tag ${clantag}: ${grabRaceData.clanName}`)

        // Add clan to database if doesnt exist
        if (!checkClan || !checkClan.warDay) {
          console.log("Neither exist, update database");
          await db.set(`raceDataScore.${clantag}`, { warDay: grabRaceData.newWarDay, raceData: grabRaceData.newRaceData })
          continue;
        }

        // console.log(`Day ${grabRaceData.oldWarDay} vs ${grabRaceData.newWarDay}`);

        // same day, no change
        if (grabRaceData.oldWarDay === grabRaceData.newWarDay) {
          console.log("Scores. Same day, no change, update data");
          checkClan = { warDay: grabRaceData.newWarDay, raceData: grabRaceData.newRaceData };
          await db.set(`raceDataScore.${clantag}`, checkClan);
          continue;
        }

        if (grabRaceData.noTrainingPost === 'training') {
          console.log("Training day, no post");
          checkClan = { warDay: grabRaceData.newWarDay, raceData: grabRaceData.newRaceData };
          await db.set(`raceDataScore.${clantag}`, checkClan);
          continue;
        }

        let channelId = await db.get(`clans.${clantag}.importantChannel`);
        const channel = guild.channels.cache.get(channelId);
        if (channel) {
          try {
            await channel.send({ embeds: [grabRaceData.embed] });
          } catch (error) {
            console.log("Error sending embed", error);
          }
        }

        checkClan = { warDay: grabRaceData.newWarDay, raceData: grabRaceData.newRaceData };
        await db.set(`raceDataScore.${clantag}`, checkClan);
        console.log("Updated Race Score Automation Data");
      }
      catch (error) {
        console.error("Error fetching race score data:", error);
      }

    }
  });
}

async function getRace(clantag, db, lastDayData) {
  let oldRaceData = lastDayData;
  let newRaceData = await API.getCurrentRiverRace(clantag);
  let clanData = await API.getClan(clantag);
  if (newRaceData.data || !clanData) return;
  if (!oldRaceData?.clan?.name) {
    console.log("Old race data didnt exist, creating new");
    return { newRaceData: newRaceData };
  }
  let clans = {};
  let warWeek = oldRaceData.sectionIndex + 1;
  let oldWarDay = -1;
  let newWarDay = -1;
  let whichDayType = oldRaceData.periodType;
  if (whichDayType === 'training') {
    oldWarDay = (oldRaceData.periodIndex % 7) + 1;
  } else {
    oldWarDay = (oldRaceData.periodIndex % 7) - 2;
  }

  if (newRaceData.periodType === 'training') {
    newWarDay = (newRaceData.periodIndex % 7) + 1;
  } else {
    newWarDay = (newRaceData.periodIndex % 7) - 2;
  }

  if (oldRaceData.periodType === 'training') {
    return { newWarDay: newWarDay, newRaceData: newRaceData }
  }

  for (let i = 0; i < oldRaceData.clans.length; i++) {
    let totalDecksUsed = 0;
    let decksRemaining = 200;
    let playersRemaining = 50;
    let availablePoints = 0;
    let totalPossiblePoints = 0;
    let average = 0.0;
    let projectedPoints = 0;
    let fameToday = 0;
    let clan = oldRaceData.clans[i]; // Current clan

    for (let j = 0; j < clan.participants.length; j++) {
      let participant = clan.participants[j];
      totalDecksUsed += participant.decksUsedToday;
      decksRemaining -= participant.decksUsedToday;
      if (participant.decksUsedToday === 1) {
        availablePoints += 700;
      }
      else if (participant.decksUsedToday === 2) {
        availablePoints += 400;
      }
      else if (participant.decksUsedToday === 3) {
        availablePoints += 200;
      }
      // Ensure attacksLeft is within the expected range
      if (participant.decksUsedToday >= 1) {
        playersRemaining -= 1;
      }
    }

    if (whichDayType === 'warDay') {
      totalPossiblePoints = oldRaceData.clans[i].periodPoints + availablePoints + (playersRemaining * 900);
      average = round(oldRaceData.clans[i].periodPoints / totalDecksUsed, 2);
      // projectedPoints = raceData.clans[i].periodPoints + Math.round((average * (decksRemaining)) / 50) * 50;
      fameToday = oldRaceData.clans[i].periodPoints;
    }
    else if (whichDayType === 'colosseum') {
      if (oldWarDay !== 1) {
        for (let i = 1; i < oldWarDay; i++) {
          totalDecksUsed += 200;
        }
      }
      totalPossiblePoints = oldRaceData.clans[i].fame + availablePoints + (playersRemaining * 900);
      average = round(oldRaceData.clans[i].fame / totalDecksUsed, 2); // assuming you want to round to 2 decimal places
      projectedPoints = oldRaceData.clans[i].fame + Math.round((average * decksRemaining) / 50) * 50;
      fameToday = oldRaceData.clans[i].fame;
    }

    if (isNaN(projectedPoints) || projectedPoints === undefined) {
      projectedPoints = 0;
    }
    if (isNaN(average) || average === undefined) {
      average = 0;
    }

    clans[oldRaceData.clans[i].tag] = {
      name: oldRaceData.clans[i].name,
      tag: oldRaceData.clans[i].tag,
      fameToday: fameToday,
      boatPoints: clan.fame,
      projectedPoints: projectedPoints,
      totalPossiblePoints: totalPossiblePoints,
      //minimumPossiblePoints: minimumPossiblePoints,
      attacksLeft: decksRemaining,
      average: average,
      badgeId: oldRaceData.clans[i].badgeId,
    }
  }

  let description = "";
  let dayType = "";
  let whichDayString = "";
  if (whichDayType === 'warDay') {
    dayType = "__River Race__";
    whichDayString = `War Week ${warWeek}`
    let clansArray = Object.keys(clans).map(function (key) {
      return clans[key];
    });
    clansArray.sort(function (a, b) {
      if (a.boatPoints > 10000 && b.boatPoints <= 10000) {
        return -1; // a comes first
      } else if (b.boatPoints > 10000 && a.boatPoints <= 10000) {
        return 1; // b comes first
      } else {
        return b.fameToday - a.fameToday; // sort by fameToday if both are over 10000 or both are under 10000
      }
    });

    let clansArrayCopy = [...clansArray];
    clansArrayCopy.sort(function (a, b) {
      return b.projectedPoints - a.projectedPoints; // sort by fameToday if both are over 10000 or both are under 10000
    });

    for (let i = 0; i < clansArray.length; i++) {
      let badgeId = clansArray[i].badgeId;
      let escapedName = escapeMarkdown(clansArray[i].name);
      if (clantag === clansArray[i].tag) {
        if (clansArray[i].boatPoints >= 10000) {
          description += `__**${i + 1}. ${escapedName} <:${clansArray[i].badgeId}:${await findEmojiId(badgeId)}>**__`;
          description += `✅\n\n`
          continue;
        }
        description += `__**${i + 1}. ${escapedName} <:${clansArray[i].badgeId}:${await findEmojiId(badgeId)}>**__`;
        description += `<:fame:1191543365867684003> ${clansArray[i].fameToday.toLocaleString()}\n`;
        // description += `<:ProjectedPoints:1187754001312272526> ${clansArray[i].projectedPoints.toLocaleString()}\n`;
        description += `<:decksLeft:1187752640508088370> ${clansArray[i].attacksLeft}\n`;
        description += `**<:average:1187754016780849253> ${clansArray[i].average}**\n\n`;
      }
      else {
        if (clansArray[i].boatPoints >= 10000) {
          description += `**${i + 1}. ${escapedName} <:${clansArray[i].badgeId}:${await findEmojiId(badgeId)}>**`;
          description += `✅\n\n`
          continue;
        }
        description += `**${i + 1}. ${escapedName} <:${clansArray[i].badgeId}:${await findEmojiId(badgeId)}>**`;
        description += `<:fame:1191543365867684003> ${clansArray[i].fameToday.toLocaleString()}\n`;
        // description += `<:ProjectedPoints:1187754001312272526> ${clansArray[i].projectedPoints.toLocaleString()}\n`;
        description += `<:decksLeft:1187752640508088370> ${clansArray[i].attacksLeft}\n`;
        description += `**<:average:1187754016780849253> ${clansArray[i].average}**\n\n`;
      }
    }
    let tag = clantag.replace(/#/g, "");
    //const fileReturn = new AttachmentBuilder(`AWSProfilePicNoBG.png`);
    const embedReturn = new EmbedBuilder()
      .setTitle(dayType)
      .setURL(`https://royaleapi.com/clan/${tag}/war/race`)
      .setDescription(description)
      .setColor('Purple')
      .setAuthor({ name: `${whichDayString} | Day ${oldWarDay}` })
      .setThumbnail(process.env.BOT_IMAGE)
      .setTimestamp();
    return { embed: embedReturn, oldWarDay: oldWarDay, newWarDay: newWarDay, newRaceData: newRaceData, noTrainingPost: oldRaceData.periodType, clanName: newRaceData.clan.name };
  }

  else if (whichDayType === 'colosseum') {
    dayType = "__Colosseum__";
    whichDayString = `Colosseum`
    let clansArray = Object.keys(clans).map(function (key) {
      return clans[key];
    });
    clansArray.sort(function (a, b) {
      if (a.boatPoints > 10000 && b.boatPoints <= 10000) {
        return -1; // a comes first
      } else if (b.boatPoints > 10000 && a.boatPoints <= 10000) {
        return 1; // b comes first
      } else {
        return b.fameToday - a.fameToday; // sort by fameToday if both are over 10000 or both are under 10000
      }
    });

    let clansArrayCopy = [...clansArray];
    clansArrayCopy.sort(function (a, b) {
      return b.projectedPoints - a.projectedPoints; // sort by fameToday if both are over 10000 or both are under 10000
    });

    for (let i = 0; i < clansArray.length; i++) {
      let badgeId = clansArray[i].badgeId;
      let escapedName = escapeMarkdown(clansArray[i].name);
      if (clantag === clansArray[i].tag) {
        description += `__**${i + 1}. ${escapedName}<:${clansArray[i].badgeId}:${await findEmojiId(badgeId)}>**__`;
        description += `<:fame:1191543365867684003> ${clansArray[i].fameToday.toLocaleString()}\n`;
        description += `<:ProjectedPoints:1187754001312272526> ${clansArray[i].projectedPoints.toLocaleString()}\n`;
        description += `<:decksLeft:1187752640508088370> ${clansArray[i].attacksLeft}\n`;
        description += `**<:average:1187754016780849253> ${clansArray[i].average}**\n\n`;
      }
      else {
        description += `**${i + 1}. ${escapedName}<:${clansArray[i].badgeId}:${await findEmojiId(badgeId)}>**`;
        description += `<:fame:1191543365867684003> ${clansArray[i].fameToday.toLocaleString()}\n`;
        description += `<:ProjectedPoints:1187754001312272526> ${clansArray[i].projectedPoints.toLocaleString()}\n`;
        description += `<:decksLeft:1187752640508088370> ${clansArray[i].attacksLeft}\n`;
        description += `**<:average:1187754016780849253> ${clansArray[i].average}**\n\n`;
      }
    }
    let tag = clantag.replace(/#/g, "");
    //const fileReturn = new AttachmentBuilder(`AWSProfilePicNoBG.png`);
    const embedReturn = new EmbedBuilder()
      .setTitle(dayType)
      .setURL(`https://royaleapi.com/clan/${tag}/war/race`)
      .setDescription(description)
      .setColor('Purple')
      .setAuthor({ name: `${whichDayString} | Day ${oldWarDay}` })
      .setThumbnail(process.env.BOT_IMAGE)
      .setTimestamp();
    return { embed: embedReturn, oldWarDay: oldWarDay, newWarDay: newWarDay, newRaceData: newRaceData, noTrainingPost: oldRaceData.periodType, clanName: newRaceData.clan.name };
  }
}


function round(value, decimals) {
  return Number(Math.round(value + 'e' + decimals) + 'e-' + decimals).toFixed(decimals);
}

function escapeMarkdown(text) {
  let markdownCharacters = ['*', '_', '`', '~'];
  let escapedText = text.split('').map(function (character) {
    if (markdownCharacters.includes(character)) {
      return '\\' + character;
    }
    return character;
  }).join('');
  return escapedText;
}

async function getLink(key) {
  // Read the JSON file
  const data = fs.readFileSync('imageLinks.json');
  const imageLinks = JSON.parse(data);

  // Check if the key exists in the JSON object
  if (imageLinks.hasOwnProperty(key)) {
    return imageLinks[key]; // Return the link associated with the key
  } else {
    return 'Key not found'; // Key does not exist in the JSON object
  }
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