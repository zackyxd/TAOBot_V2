const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder, EmbedBuilder, PermissionsBitField, ButtonBuilder, ButtonStyle, ActionRowBuilder, Embed } = require("discord.js");
const path = require('path');
const Database = require('better-sqlite3');
const { QuickDB } = require("quick.db")
const fs = require('fs');
const API = require("../../API.js");
const { createSuccessEmbed, createExistEmbed, createErrorEmbed, createMaintenanceEmbed } = require('../../utilities/embedUtility.js');



module.exports = {
  data: new SlashCommandBuilder()
    .setName("link-player")
    .setDescription("Link a single player to a playertag")
    .addUserOption((option) =>
      option.setName("user").setDescription("@user to link").setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("playertag")
        .setDescription("playertag of user")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers),

  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "link-player") return;
    await interaction.deferReply();

    let user = interaction.options.getMember("user"); // gets full user
    let playertag = interaction.options.get("playertag").value.toUpperCase();
    playertag = playertag.replace(/o/gi, '0'); // Replace 'O' and 'o' with '0'
    if (playertag.charAt(0) !== "#") {
      playertag = "#" + playertag;
    }

    const dbPath = path.join(__dirname, `../../../guildData/${interaction.guild.id}.sqlite`);
    const db = new QuickDB({ filePath: dbPath });

    // Get PlayerData.json, if error return error, else link player.
    let crAccount = await API.getPlayer(playertag);
    if (crAccount.data) {
      await interaction.editReply({ embeds: [crAccount] });
      return;
    }


    try {
      const discordId = user.user.id;

      let playertagLink = await db.get(`playertags.${playertag}.discordId`);
      if (playertagLink && playertagLink !== discordId) {
        await interaction.editReply({ embeds: [createErrorEmbed(`NOT LINKED. Playertag ${playertag} is already linked to <@${playertagLink}>`)] });
        return;
      }
      else if (playertagLink && playertagLink === discordId) {
        await interaction.editReply({ embeds: [createExistEmbed(`ALREADY LINKED. Playertag ${playertag} is already linked to <@${discordId}>`)] })
        return;
      }




      // Link to discord id for list of playertags
      let userData = await db.get(`users.${discordId}`);
      if (!userData) {
        userData = { playertags: [] };
      }
      // Ensure playertags array exists
      if (!userData.playertags) {
        userData.playertags = [];
      }

      if (!userData.playertags.includes(playertag)) {
        userData.playertags.push(playertag);
        // Do links
        await db.set(`users.${discordId}`, userData);

        let grabPreviousPlayertagData = await db.get(`playertags.${playertag}`);
        if (!grabPreviousPlayertagData) {
          grabPreviousPlayertagData = {};
        }
        grabPreviousPlayertagData.discordId = discordId;
        grabPreviousPlayertagData.playerName = crAccount.name;
        console.log("Should be setting playertag as:", crAccount.name, crAccount.tag, discordId);
        await interaction.editReply({ embeds: [await getPlayerEmbed(crAccount, user)] });
        await db.set(`playertags.${playertag}`, grabPreviousPlayertagData);
        try {
          if (!user.permissions.has([PermissionsBitField.Flags.MuteMembers])) {
            await user.setNickname(crAccount.name);
          }
        } catch (error) {
          console.log("Couldnt change name: " + error)
          await interaction.followUp({ content: "Couldn't change their name, but link was still completed.", ephemeral: true })
        }
        return;
      }
      else {

        await interaction.editReply({ embeds: [createExistEmbed(`ALREADY LINKED. <@${discordId}> is already linked to playertag ${playertag}`)] });
        return;
      }
    } catch (error) {
      console.error('Error linking playertag:', error);
      await interaction.editReply({ embeds: [createErrorEmbed('An error occurred while linking the playertag. Please try again later.')] });
      return;
    }
  }
};


async function getPlayerEmbed(account, user) {

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
  let playerLeagueIcon = getLink("league" + account.currentPathOfLegendSeasonResult.leagueNumber + ".png");
  const embedReturn = new EmbedBuilder()
    .setTitle(`${name} <:experience${level}:${levelIcon}>\n`)
    .setThumbnail(playerLeagueIcon)
    .setURL(`https://royaleapi.com/player/${playertag}`)
    .addFields(
      { name: `__CW2 Wins__ <:cw2:1196604288886124585>`, value: `${cw2Wins}`, inline: true },
      { name: `__CC Wins__ <:classicWin:1196602845890355290>`, value: `${classicWins}`, inline: true },
      { name: `__GC Wins__ <:grandChallenge:1196602855482728560>`, value: `${grandWins}`, inline: true }
    )
    .setDescription(description)
    .setFooter({ text: `${user.user.username} linked!`, iconURL: user.user.displayAvatarURL() })
    .setColor('#00FF00')
  // .setFooter({ text: `Linked! ${account.tag}` });

  //await interaction.editReply({ embeds: [embedReturn], files: [file] });
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