const { Events, EmbedBuilder, PermissionsBitField, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const Database = require('better-sqlite3');
const { QuickDB } = require('quick.db');
const API = require("../../API.js");
const { createSuccessEmbed, createErrorEmbed, createExistEmbed } = require('../../utilities/embedUtility.js');
const fs = require('fs');
const path = require('path');

module.exports = {
  name: Events.ChannelUpdate,
  async execute(oldChannel, newChannel) {
    // change below to and 
    if (oldChannel.name !== newChannel.name && newChannel.name.includes('closed')) {
      console.log(`Channel name updated to include "closed": ${newChannel.name}`);
      // You can add additional actions here, such as sending a message to a specific channel
      let guildId = newChannel.guildId;
      let channelId = newChannel.id;
      let nameWasChanged = false;
      const dbPath = API.findFileUpwards(__dirname, `guildData/${guildId}.sqlite`);
      const db = new QuickDB({ filePath: dbPath });
      const allKeys = await db.all();
      const matchingKeys = allKeys.filter(key => key.id.includes(`tickets_${guildId}_${channelId}_`));
      const discordId = matchingKeys.map(key => {
        const parts = key.id.split('_');
        return parts[3]; // Assuming the discordId is the fourth part of the key
      })[0];

      let playerLinks = await db.get(`tickets_${guildId}_${channelId}_${discordId}`);
      if (!playerLinks) {
        console.log("No playerlinks");
        return;
      }
      let guild;
      let channel;
      let user;
      try {
        guild = await client.guilds.fetch(guildId);
        channel = await guild.channels.cache.get(channelId);
        user = await guild.members.fetch(discordId);
      } catch (error) {
        console.log("Error with saving user");
        await channel.send({ embeds: [createErrorEmbed(`Error with user, no data was saved.`)] })
        await db.delete(`tickets_${guildId}_${channelId}_${discordId}`);
        return;
      }

      for (tag of playerLinks) {
        let crAccount = await API.getPlayer(tag);
        if (crAccount.data) {
          await channel.send({ embeds: [createErrorEmbed(`Couldn't find the account with the tag ${tag}`)] })
          continue;
        }
        try {
          let playertagLink = await db.get(`playertags.${tag}.discordId`);
          if (playertagLink && playertagLink !== discordId) {
            await channel.send({ embeds: [createExistEmbed(`The tag ${tag} was already linked to <@${playertagLink}>. Not linking it.`)] });
            continue;
          }
          else if (playertagLink && playertagLink === discordId) {
            await channel.send({ embeds: [createSuccessEmbed(`The tag ${tag} was already linked to this player.`)] })
            continue;
          }

          let userData = await db.get(`users.${discordId}`);
          if (!userData) {
            userData = { playertags: [] };
          }
          if (!userData.playertags) {
            userData.playertags = [];
          }

          if (!userData.playertags.includes(tag)) {
            userData.playertags.push(tag);
            await db.set(`users.${discordId}`, userData);

            let grabPreviousPlayertagData = await db.get(`playertags.${tag}`);
            if (!grabPreviousPlayertagData) {
              grabPreviousPlayertagData = {};
            }
            grabPreviousPlayertagData.discordId = discordId;
            await db.set(`playertags.${tag}`, grabPreviousPlayertagData);

            try {
              if (!nameWasChanged) {
                await user.setNickname(crAccount.name)
                nameWasChanged = true;
              }
            } catch (error) {
              console.log("Couldnt change name: " + error)
            }


            const removeLink = new ButtonBuilder()
              .setCustomId(`removeLink_${tag}_${discordId}`)
              .setLabel("Remove Link")
              .setStyle(ButtonStyle.Danger);

            const embed = await getPlayerEmbed(crAccount, user);
            const row = new ActionRowBuilder()
              .addComponents(removeLink);

            // Only add the changeName button if there is more than one playertag
            if (playerLinks.length > 1) {
              const changeName = new ButtonBuilder()
                .setCustomId(`switchName_${crAccount.name}_${discordId}`)
                .setLabel("Use this name")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false);
              row.addComponents(changeName);
            }

            await channel.send({ embeds: [embed], components: [row] });


          }
        }
        catch (error) {
          console.error('Error linking playertag on channel name change:', error);
          await channel.send({ embeds: [createErrorEmbed(`An error occurred while linking the playertag ${tag}. Please try again later.`)] })
        }

      }

      await db.delete(`tickets_${guildId}_${channelId}_${discordId}`);
      console.log("Deleted linked players from this ticket");
    }
  },
};


async function getPlayerEmbed(crAccount, user) {
  let playerName = crAccount.name;
  let playertag = (crAccount.tag).substring(1);
  let clan = crAccount?.clan?.name ?? 'No Clan';
  let role = crAccount?.role ?? '';
  let level = crAccount.expLevel;
  let levelIcon = findEmojiId(`experience${level}`)
  let clanBadge = crAccount?.clan?.badgeId || '0_';
  let clanBadgeIcon = findEmojiId(clanBadge);
  let playerLeagueIcon = getLink("league" + crAccount.currentPathOfLegendSeasonResult.leagueNumber + ".png");

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
  let description = `<:${clanBadge}:${clanBadgeIcon}> ${clan} ${role}\n\n`;
  let embedReturn = new EmbedBuilder()
    .setTitle(`${playerName} <:experience${level}:${levelIcon}>`)
    // .setThumbnail(playerLeagueIcon)
    .setURL(`https://royaleapi.com/player/${playertag}`)
    // .setThumbnail(playerLeagueIcon)
    .setDescription(description)
    .setFooter({ text: `${user.user.username} linked! (${crAccount.tag})`, iconURL: user.user.displayAvatarURL() })
    .setColor('#00FF00')

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
    //console.log(`Found emoji ID: ${ emojiId } `);
    return emojiId;
  } else {
    console.error(`Emoji not found for: ${nameLookingFor} `);
    return null;
  }
}