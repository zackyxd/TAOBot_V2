const API = require("../../API.js");
const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder, EmbedBuilder, ActionRowBuilder, Embed, ButtonBuilder, ButtonStyle } = require("discord.js");
const path = require('path');
const Database = require('better-sqlite3');
const { QuickDB } = require("quick.db")
const fs = require('fs');
const { createSuccessEmbed, createExistEmbed, createErrorEmbed, createMaintenanceEmbed } = require('../../utilities/embedUtility.js');
const { paginate } = require('../../../pagination.js');



module.exports = {
  data: new SlashCommandBuilder()
    .setName("players")
    .setDescription("Shows CR accounts linked to a Discord user")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("@user to check")
        .setRequired(true)
    ),
  // .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers),

  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "players") return;
    await interaction.deferReply();

    let user = interaction.options.getMember("user"); // gets full user
    const discordId = user.user.id;

    const dbPath = path.join(__dirname, `../../../guildData/${interaction.guild.id}.sqlite`);
    const db = new QuickDB({ filePath: dbPath });



    try {
      // Get all users linked to player
      let userData = await db.get(`users.${discordId}`);
      if (!userData || !userData.playertags || userData.playertags.length === 0) {
        await interaction.editReply({ embeds: [createErrorEmbed(`No players linked for the user <@${discordId}>`)] });
        return;
      }

      // Limit to 5 playertags
      const playertags = userData.playertags;
      // Generate embeds for each playertag
      // Fetch player data and sort by level
      const playerData = await Promise.all(playertags.map(async (playertag) => {
        let crAccount = await API.getPlayer(playertag);
        return crAccount;
      }));

      playerData.sort((a, b) => b.expLevel - a.expLevel);

      // Generate embeds for each sorted player data
      const pages = await Promise.all(playerData.map(async (crAccount) => {
        if (crAccount.data) {
          return crAccount;
        }
        return getPlayerEmbed(crAccount, user, userData.playertags.length);
      }));

      // Use the paginate function
      await paginate(interaction, pages, "playersList");

    } catch (error) {
      console.error('Error fetching playertags:', error);
      await interaction.editReply({ content: 'An error occurred while fetching the playertags. Please try again later.' });
    }
  }
};

async function getPlayerEmbed(crAccount, user, howManyAccounts) {
  const accountText = howManyAccounts === 1 ? 'Account' : 'Accounts';
  const discordId = user.user.id;
  const userName = user.nickname || user.user.username;
  const userAvatarURL = user.user.displayAvatarURL();
  let name = crAccount.name;
  let playertag = (crAccount.tag).substring(1);
  let level = crAccount.expLevel;
  let role = crAccount?.role ?? '';
  let clan = crAccount?.clan?.name ?? 'No Clan';
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

  for (let card of crAccount.cards) {
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

  let badgeId = crAccount?.clan?.badgeId ?? '0_';

  currentPOL = crAccount?.currentPathOfLegendSeasonResult?.leagueNumber ?? 1;
  if (currentPOL === 10) {
    currentPOLTrophies = crAccount.currentPathOfLegendSeasonResult.trophies;
  }

  lastPOL = crAccount?.lastPathOfLegendSeasonResult?.leagueNumber ?? 1;
  if (lastPOL === 10) {
    lastPOLTrophies = crAccount.lastPathOfLegendSeasonResult.trophies;
    lastPOLRank = crAccount.lastPathOfLegendSeasonResult.rank;
  }

  bestPOL = crAccount?.bestPathOfLegendSeasonResult?.leagueNumber ?? 1;
  if (bestPOL === 10) {
    bestPOLTrophies = crAccount.bestPathOfLegendSeasonResult.trophies;
    bestPOLRank = crAccount.bestPathOfLegendSeasonResult.rank;
  }

  if (crAccount.role === 'leader') {
    role = '(Leader)';
  }
  else if (crAccount.role === 'coLeader') {
    role = '(Co-Leader)'
  }
  else if (crAccount.role === 'elder') {
    role = '(Elder)'
  }
  else if (crAccount.role === 'member') {
    role = '(Member)';
  }

  for (let badge of crAccount.badges) {
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
  description += `<:${badgeId}:${findEmojiId(badgeId)}> ${clan} ${role}\n\n`
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
  const playerLeagueIcon = getLink("league" + currentPOL + ".png");
  const embedReturn = new EmbedBuilder()
    .setTitle(`${name} <:experience${level}:${levelIcon}>`)
    .setThumbnail(playerLeagueIcon)
    .setURL(`https://royaleapi.com/player/${playertag}`)
    .setColor("Purple")
    .addFields(
      { name: `__CW2 Wins__ <:cw2:1196604288886124585>`, value: `${cw2Wins}`, inline: true },
      { name: `__CC Wins__ <:classicWin:1196602845890355290>`, value: `${classicWins}`, inline: true },
      { name: `__GC Wins__ <:grandChallenge:1196602855482728560>`, value: `${grandWins}`, inline: true }
    )
    .setFooter({ text: `${userName}'s ${accountText}`, iconURL: userAvatarURL })
    .setDescription(description);

  // console.log(embedReturn);
  return embedReturn;
}

function getLink(key) {
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
