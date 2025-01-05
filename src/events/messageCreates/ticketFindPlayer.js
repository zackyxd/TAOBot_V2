const { Events, PermissionsBitField, EmbedBuilder } = require('discord.js');
const { QuickDB } = require('quick.db');
const API = require("../../API.js");
const { createSuccessEmbed, createErrorEmbed, createExistEmbed } = require('../../utilities/embedUtility.js');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    if (message.author.bot) return;


    const guildId = message.guild.id;
    const userId = message.author.id;
    // console.log(message);

    const channel = await message.client.channels.fetch(message.channelId);
    if (!(channel.name).includes('ticket')) {
      // console.log("Channel did not include 'ticket' in the name, don't continue.");
      return;
    }

    let parsedMessage = (message.content).split(/\s+/);
    let validTags = new Set();
    let promises = parsedMessage.map(async (msg) => {


      if (msg.length > 13) {
        let regex = /https:\/\/royaleapi\.com\/player\/(\w+)/;
        let match = msg.match(regex);
        if (match === null || match[1] === undefined) {
          return;
        }
        let tag = match[1];
        if (tag.charAt(0) !== '#') {
          tag = '#' + tag;
        }
        let account = await API.getPlayer(match[1]);
        if (!account.data) {
          validTags.add(tag);
        }
        else {
          if (account.data.description.includes("Maintenance")) {
            await message.channel.send({ embeds: [account] });
          }
        }

      } else if (msg.length >= 3 && msg.length <= 12) {
        msg = msg.toUpperCase();
        msg = msg.replace(/[^\w]/g, '').replace(/o/gi, '0') // Replace 'O' and 'o' with '0'. And only a-Z, 0-9
        let tag = msg;
        if (tag.charAt(0) !== '#') {
          tag = '#' + tag;
        }
        let account = await API.getPlayer(tag);
        if (!account.data) {
          validTags.add(tag);
        }
        else {
          if (account.data.description.includes("Maintenance")) {
            await message.channel.send({ embeds: [account] });
          }
        }
      }
      return false;
    });

    await Promise.all(promises);

    if (validTags.size === 0) {
      console.log("No valid accounts found.");
      return;
    }

    if (message.member.permissions.has([PermissionsBitField.Flags.MuteMembers])) {
      for (tag of validTags) {
        let crAccount = await API.getPlayer(tag);
        if (crAccount.data) return;
        let player = await playerStats(crAccount);
        await message.channel.send({ embeds: [player.embedReturn] });
        // console.log("Member has mute members permission, don't continue.");
      }
      return;
    }

    // Convert the Set to an array
    validTags = Array.from(validTags);

    const dbPath = API.findFileUpwards(__dirname, `guildData/${guildId}.sqlite`);
    const db = new QuickDB({ filePath: dbPath });

    let existingTags = await db.get(`tickets_${guildId}_${message.channelId}_${userId}`) || [];
    console.log(existingTags);
    // Filter out tags that already exist
    let newTags = validTags.filter(tag => !existingTags.includes(tag));
    if (newTags.length === 0) {
      console.log("No new valid accounts found.");
      return;
    }

    for (tag of newTags) {
      let crAccount = await API.getPlayer(tag);
      if (crAccount.data) return;
      let player = await playerStats(crAccount);
      try {
        let user = await message.guild.members.fetch(userId);
        if (existingTags.length === 0) {
          await user.setNickname(crAccount.name);
        }
      } catch (error) {
        console.log(error, "ticket find player cant set name");
      }
      await message.channel.send({ embeds: [player.embedReturn] });
    }
    if (existingTags.length === 0) {
      await message.channel.send({ content: `Hey <@${message.author.id}>, Thank you for providing your playertag. One of our coleaders will be with you as soon as possible!` })
    }
    let updatedTags = [...existingTags, ...newTags];

    await db.set(`tickets_${guildId}_${message.channelId}_${userId}`, updatedTags);


  }
}


async function playerStats(account) {

  let name = account.name;
  let playertag = (account.tag).substring(1);
  let level = account.expLevel;
  let role = account?.role ?? '';
  let clan = account?.clan?.name ?? 'No Clan';
  let cw2Wins = 'N/A';
  let classicWins = 'N/A';
  let grandWins = 'N/A';

  let currentPOL;
  let currentPOLTrophies;
  let lastPOL;
  let lastPOLTrophies;
  let lastPOLRank;
  let bestPOL;
  let bestPOLTrophies;
  let bestPOLRank;

  let level15 = 0;
  let level14 = 0;
  let level13 = 0;
  let evolutions = 0;

  for (let card of account.cards) {
    let checkCardLevel = checkLevel(card.level, card.rarity);
    if (checkCardLevel === 15) {
      level15++;
    }
    if (checkCardLevel === 14) {
      level14++;
    }
    if (checkCardLevel === 13) {
      level13++;
    }
    if (card?.evolutionLevel === 1) {
      evolutions++;
    }
  }

  let badgeId = account?.clan?.badgeId ?? '0_';
  let clanBadgeIcon = findEmojiId(badgeId);

  currentPOL = account?.currentPathOfLegendSeasonResult?.leagueNumber ?? 1;
  if (currentPOL === 10) {
    currentPOLTrophies = account.currentPathOfLegendSeasonResult.trophies;
  }

  lastPOL = account?.lastPathOfLegendSeasonResult?.leagueNumber ?? 1;
  if (lastPOL === 10) {
    lastPOLTrophies = account.lastPathOfLegendSeasonResult.trophies;
    lastPOLRank = account.lastPathOfLegendSeasonResult.rank;
  }

  bestPOL = account?.bestPathOfLegendSeasonResult?.leagueNumber ?? 1;
  if (bestPOL === 10) {
    bestPOLTrophies = account.bestPathOfLegendSeasonResult.trophies;
    bestPOLRank = account.bestPathOfLegendSeasonResult.rank;
  }

  if (account.role === 'leader') {
    role = '(Leader)';
  }
  else if (account.role === 'coLeader') {
    role = '(Co-Leader)'
  }
  else if (account.role === 'elder') {
    role = '(Elder)'
  }
  else if (account.role === 'member') {
    role = '(Member)';
  }

  for (let badge of account.badges) {
    if (badge.name === "Classic12Wins") {
      classicWins = badge.progress;
    }
    if (badge.name === "Grand12Wins") {
      grandWins = badge.progress;
    }
    if (badge.name === "ClanWarWins") {
      cw2Wins = badge.progress;
    }
  }


  let description = "";
  // description += `-# [Click here to go to their ingame profile](<https://link.clashroyale.com/en/?playerInfo?id=${playertag}>)\n`
  description += `<:${badgeId}:${clanBadgeIcon}> ${clan} ${role}\n\n`
  description += `__**Path of Legends**__\n`;
  if (currentPOLTrophies !== undefined) {
    description += `Current: <:polMedal:1196602844166492261> ${currentPOLTrophies}\n`;
  }
  else {
    description += 'Current: <:polMedal:1196602844166492261> ---\n';
  }

  if (lastPOLTrophies !== undefined && lastPOLRank !== null) {
    description += `Last: <:polMedal:1196602844166492261> ${lastPOLTrophies} (#${lastPOLRank})\n`;
  }
  else if (lastPOLTrophies !== undefined && lastPOLRank === null) {
    description += `Last: <:polMedal:1196602844166492261> ${lastPOLTrophies}\n`;
  }

  if (bestPOLTrophies !== undefined && bestPOLRank !== null) {
    description += `Best: <:polMedal:1196602844166492261> ${bestPOLTrophies} (#${bestPOLRank})\n\n`;
  }
  else if (bestPOLTrophies !== undefined && bestPOLRank === null) {
    description += `Best: <:polMedal:1196602844166492261> ${bestPOLTrophies}\n\n`;
  }
  else {
    description += `Best: <:polMedal:1196602844166492261> ---\n\n`;
  }

  description += `__**Card Levels**__ <:cards:1196602848411127818>\n<:Evolutions:1248347132088418478>: ${evolutions}\n<:experience15:1196504104256671794>: ${level15}\n<:experience14:1196504101756874764>: ${level14}\n<:experience13:1196504100200796160>: ${level13}`;
  let levelIcon = findEmojiId(`experience${level}`)
  //const fileReturn = new AttachmentBuilder(`arenas/league${currentPOL}.png`);
  let playerLeague = account?.currentPathOfLegendSeasonResult?.leagueNumber;
  if (!playerLeague) {
    playerLeague = "1";
  }
  let playerLeagueIcon = getLink("league" + playerLeague + ".png")
  const embedReturn = new EmbedBuilder()
    .setTitle(`${name} <:experience${level}:${levelIcon}>\n`)
    .setThumbnail(playerLeagueIcon)
    .setURL(`https://royaleapi.com/player/${playertag}`)
    .setColor("Purple")
    .addFields(
      { name: `__CW2 Wins__ <:cw2:1196604288886124585>`, value: `${cw2Wins}`, inline: true },
      { name: `__CC Wins__ <:classicWin:1196602845890355290>`, value: `${classicWins}`, inline: true },
      { name: `__GC Wins__ <:grandChallenge:1196602855482728560>`, value: `${grandWins}`, inline: true },
      { name: `\u200B`, value: `\u200B<:outsideicon:1324707556026875914> [Ingame profile](<https://link.clashroyale.com/en/?playerInfo?id=${playertag}>)`, inline: false }
    )
    .setDescription(description)
  // .setFooter({ text: `Linked! ${account.tag}` });

  //await interaction.editReply({ embeds: [embedReturn], files: [file] });
  return { embedReturn, name, playertag };
}

function getLink(key) {
  // Read the JSON file
  const data = fs.readFileSync('imageLinks.json');
  const imageLinks = JSON.parse(data);
  if (key === undefined || key === null) {
    key = "league0";
  }
  console.log(key, typeof key);
  // Check if the key exists in the JSON object
  if (imageLinks.hasOwnProperty(key)) {
    return imageLinks[key]; // Return the link associated with the key
  }
  else {
    return 'Key not found'; // Key does not exist in the JSON object
  }
}

function findEmojiId(nameLookingFor) {

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
function checkLevel(level, rarity) {
  let actualLevel = 0;
  if (rarity === "common") {
    actualLevel = level;
    return actualLevel;
  }
  if (rarity === "rare") {
    actualLevel = level + 2;
    return actualLevel;
  }
  if (rarity === "epic") {
    actualLevel = level + 5;
    return actualLevel;
  }
  if (rarity === "legendary") {
    actualLevel = level + 8;
    return actualLevel;
  }
  if (rarity === "champion") {
    actualLevel = level + 10;
    return actualLevel;
  }
}

