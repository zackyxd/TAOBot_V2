const API = require("../../API.js");
const { QuickDB } = require("quick.db");
const path = require('path');
const fs = require('fs');
const { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField, Embed, ModalBuilder, TextInputStyle } = require('discord.js');
const { createErrorEmbed, createExistEmbed } = require("../../utilities/embedUtility.js");
module.exports = {
  async handleModal(interaction) {
    await interaction.deferReply({ ephemeral: true })
    if (interaction.customId === "linkplayers") {
      let playertag = interaction.fields.getTextInputValue('playertag').toUpperCase().trim();
      if (playertag.charAt(0) !== '#') playertag = '#' + playertag;
      let crAccount = await API.getPlayer(playertag);
      if (crAccount.data) {
        await interaction.editReply({ embeds: [crAccount] })
        return;
      }

      let password = interaction.fields.getTextInputValue('password').toLowerCase().trim();
      if (password !== "aftermath") {
        await interaction.editReply({ embeds: [createErrorEmbed("Sorry, this is the incorrect password.\nIf you do not know the password, this button is not for you. Please make a ticket in <#978462412128804924>")] })
        return;
      }


      const dbPath = path.join(__dirname, `../../../guildData/${interaction.guild.id}.sqlite`);
      const db = new QuickDB({ filePath: dbPath });
      const discordId = interaction.user.id;
      const user = interaction.user;
      const member = await interaction.guild.members.fetch(discordId); // Fetch the guild member

      try {
        let playertagLink = await db.get(`playertags.${playertag}.discordId`); // get if linked
        if (playertagLink && (playertagLink !== discordId || !playertagLink)) {
          await interaction.editReply({ embeds: [createErrorEmbed(`1: Sorry, this playertag ${playertag} is already linked to someone else. Please message one of the coleaders if this is your account.`)] });
          return;
        }
        // Already linked and using modal
        else if (playertagLink && playertagLink === discordId) {
          await interaction.editReply({ embeds: [createExistEmbed(`This playertag ${playertag} is already linked to you. Adding your role now.`)] });
          try {
            await member.setNickname(crAccount.name);
          }
          catch (error) {
            console.log("Couldnt change name:", error);
            await interaction.followUp({ content: "Issue changing your name, link still completed", ephemeral: true })
          }
          try {
            let globalRole = await db.get(`guilds.${interaction.guild.id}.globalRole`)
            await member.roles.add([globalRole, "1315365947501973594"]); // temp role to see channel afterwards
          } catch (error) {
            console.error("1: Issue adding global role or adding to mergedPlayers:", error);
          }
          return;
        }

        let userData = await db.get(`users.${discordId}`);
        let mergeTags = await db.get(`mergedPlayers`) || [];
        if (!userData) {
          userData = { playertags: [] };
        }
        else if (!Array.isArray(userData.playertags)) {
          userData.playertags = [];
        }
        if (!userData.playertags.includes(playertag)) {
          userData.playertags.push(playertag);
          let mergeCheck = { "discordId": discordId, "playertag": playertag, playerName: crAccount.name };
          mergeTags.push(mergeCheck);
          // Add link

          let grabPreviousPlayertagData = await db.get(`playertags.${playertag}`);
          if (!grabPreviousPlayertagData) {
            grabPreviousPlayertagData = {};
          }
          grabPreviousPlayertagData.discordId = discordId;
          grabPreviousPlayertagData.playerName = crAccount.name;
          await interaction.editReply({ embeds: [await getPlayerEmbed(crAccount, user)] });
          await db.set(`users.${discordId}`, userData);
          await db.set(`playertags.${playertag}`, grabPreviousPlayertagData);
          try {
            await member.setNickname(crAccount.name);
          }
          catch (error) {
            console.log("Couldnt change name:", error);
            await interaction.followUp({ content: "2: Issue changing your name, link still completed", ephemeral: true })
          }
        }
        else {
          await interaction.editReply({ embeds: [createErrorEmbed(`2: Sorry, this playertag ${playertag} is already linked to someone else. Please message one of the coleaders if this is your account.`)] });
          return;
        }

        try {
          let globalRole = await db.get(`guilds.${interaction.guild.id}.globalRole`)
          await member.roles.add([globalRole, "1315365947501973594"]); // temp role to see channel afterwards
          await db.set(`mergedPlayers`, mergeTags)
        } catch (error) {
          console.error("Issue adding global role or adding to mergedPlayers:", error);
          await db.set(`mergedPlayers`, mergeTags)
        }

        // Send to channel if available
        try {
          const channelData = await db.get(`guilds.${interaction.guild.id}`);
          const channelId = channelData.modalLinkChannel;
          if (!channelId) {
            console.log("No channel configured for modal links.");
            return;
          }

          const channel = await interaction.guild.channels.fetch(channelId);
          if (!channel) {
            console.log("Channel not found.");
            return;
          }

          // Post to channel to show linked
          let playertag = (crAccount.tag).substring(1);
          let level = crAccount.expLevel;
          let levelIcon = findEmojiId(`experience${level}`)
          let playerLeague = crAccount?.currentPathOfLegendSeasonResult?.leagueNumber ?? 1;
          let playerLeagueIcon = getLink("league" + playerLeague + ".png");
          let badgeId = crAccount?.clan?.badgeId ?? '0_';
          let clanBadgeIcon = findEmojiId(badgeId);
          let role = crAccount?.role ?? '';
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
          let clan = crAccount?.clan?.name ?? 'No Clan';
          let description = `<:experience${level}:${levelIcon}> [${crAccount.name}](<https://royaleapi.com/player/${playertag}>)\n`
          description += `<:${badgeId}:${clanBadgeIcon}> ${clan} ${role}\n`
          description += `<@${discordId}>`
          let embed = new EmbedBuilder()
            .setAuthor({ name: `New Link!` })
            .setDescription(description)
            .setThumbnail(playerLeagueIcon)
            .setColor("Purple")
            .setFooter({ text: `${crAccount.tag}` })
            .setTimestamp();

          await channel.send({ embeds: [embed] });
        } catch (error) {
          console.log("A player linked their account, but nowhere to send the embed to:", error);
        }



      } catch (error) {
        console.error(`Error linking player using modal: ${error}`)
        await interaction.editReply({ embeds: [createErrorEmbed('1: An error occurred while linking the playertag. Please message one of the coleaders.')] });
        return;
      }


    }
  }
}

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
  let playerLeague = account?.currentPathOfLegendSeasonResult?.leagueNumber;
  if (!playerLeague) {
    playerLeague = "1";
  }
  let playerLeagueIcon = getLink("league" + playerLeague + ".png")
  console.log(playerLeagueIcon);
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
    .setFooter({ text: `${user.username} linked!`, iconURL: user.displayAvatarURL() })
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