const API = require("../../API.js");
const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, Embed } = require("discord.js");
const path = require('path');
const Database = require('better-sqlite3');
const { QuickDB } = require("quick.db")
const fs = require('fs');
const { createSuccessEmbed, createExistEmbed, createErrorEmbed, createMaintenanceEmbed } = require('../../utilities/embedUtility.js');
const { paginate } = require('../../../pagination.js');
const moment = require('moment-timezone');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("info")
    .setDescription("Show all the clans in the server")
    .addStringOption(option =>
      option.setName("clan-abbreviation")
        .setDescription("What is the clan abbreviation you want to check instead?")
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers),

  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "info") return;
    await interaction.deferReply();
    let abbrev = interaction.options.get("clan-abbreviation")?.value?.toLowerCase();
    const dbPath = path.join(__dirname, `../../../guildData/${interaction.guild.id}.sqlite`);
    const db = new QuickDB({ filePath: dbPath });
    if (abbrev) {
      const clans = await db.get(`clans`) || {};
      if (!clans) {
        await interaction.editReply({ embeds: [createErrorEmbed(`Error grabbing clan data, likely no clans in server.`)] });
        return;
      }
      const clantag = Object.keys(clans).find(tag => clans[tag].abbreviation === abbrev);
      if (!clantag) {
        await interaction.editReply({ embeds: [createErrorEmbed(`No abbreviation in server with \`${abbrev}\``)] });
        return;
      }
      let clanInfo = await grabClanDatabaseInfo(clantag, db, interaction);

      await interaction.editReply({ embeds: [clanInfo] });
    }



    // No specific clan given, show all clans
    else {
      const clans = await db.get(`clans`) || {};
      if (!clans) {
        await interaction.editReply({ embeds: [createErrorEmbed(`Error grabbing clans data, likely no clans in server.`)] });
        return;
      }
      try {
        const clanData = await Promise.all(Object.keys(clans).map(async clantag => {
          const clanInfo = await API.getClan(clantag);
          return {
            clantag,
            warTrophies: clanInfo.clanWarTrophies,
            clanInfo
          };
        }));

        const sortedClans = clanData.sort((a, b) => b.warTrophies - a.warTrophies);
        // Generate embeds for each sorted clan data
        let pages = await Promise.all(sortedClans.map(async ({ clantag, clanInfo }) => {
          return grabClanDatabaseInfo(clantag, db, interaction);
        }));


        let clanInvites = await db.get(`guilds.${interaction.guild.id}.clanInvitesChannel`);
        if (!clanInvites) {
          clanInvites = `N/A`;
        }
        else {
          clanInvites = `<#${clanInvites}>`;
        }
        let attackLateRole = await db.get(`guilds.${interaction.guild.id}[attacking-late]`);
        if (!attackLateRole) {
          attackLateRole = `N/A`;
        }
        else {
          attackLateRole = `<@&${attackLateRole}>`;
        }
        let replaceMeRole = await db.get(`guilds.${interaction.guild.id}[replace-me]`);
        if (!replaceMeRole) {
          replaceMeRole = `N/A`;
        }
        else {
          replaceMeRole = `<@&${replaceMeRole}>`;
        }
        let playersLinked = 0;
        let playersAmount = await db.get(`playertags`);
        Object.keys(playersAmount).forEach(key => {
          if (playersAmount[key].hasOwnProperty('discordId')) {
            playersLinked++;
          }
        });

        let reply = `Clan Invites: ${clanInvites}\n`;
        reply += `Attacking Late Role: ${attackLateRole}\n`
        reply += `Replace Me Role: ${replaceMeRole}\n`
        reply += `There are \`${playersLinked}\` players linked!`
        const specificEmbed = new EmbedBuilder()
          .setTitle(`${interaction.guild.name}`)
          .setDescription(reply)
          .setColor("Purple")
          .setThumbnail(process.env.BOT_IMAGE)

        // Prepend the specific embed to the list of clan embeds
        pages = [specificEmbed, ...pages];
        // console.log(pages);

        await paginate(interaction, pages, "clans");
      } catch (error) {
        console.error('Error fetching clans:', error);
        await interaction.editReply({ embeds: [createErrorEmbed('An error occurred while fetching all the clans. Please try again later.')] });

      }


    }
  }
}


async function grabClanDatabaseInfo(clantag, db, interaction) {
  let cleanClantag = clantag.substring(1);
  let clanName = await db.get(`clans.${clantag}.clanName`);
  let abbreviation = await db.get(`clans.${clantag}.abbreviation`);
  let importantChannelId = await db.get(`clans.${clantag}.importantChannel`);
  let clanlogsChannelId = await db.get(`clans.${clantag}.clanlogsChannel`);
  let roleId = await db.get(`clans.${clantag}.roleId`);
  let badgeIdFind = await db.get(`clanData.${clantag}`);
  let badgeId = badgeIdFind?.badgeId || '0';


  let reply = '';

  reply += `__**General Info**__\nAbbreviation: \`${abbreviation}\`\n`
  const importantChannel = interaction.guild.channels.cache.get(importantChannelId);
  if (!importantChannel) {
    reply += `Important Channel: \`None set\`\n`
  }
  else {
    reply += `Important Channel: <#${importantChannelId}>\n`
  }

  const clanlogsChannel = interaction.guild.channels.cache.get(clanlogsChannelId);
  if (!clanlogsChannel) {
    reply += `Clan logs: \`None set\`\n`
  }
  else {
    reply += `Clan logs: <#${clanlogsChannelId}>\n`
  }


  if (roleId) {
    reply += `Role: <@&${roleId}>\n\n`
  }
  else {
    reply += `Role: \`No role set\`\n\n`;
  }

  let nudgeToggle = await db.get(`clans.${clantag}.nudgeSettings.enabled`);

  reply += `__**Nudge Settings**__\n`
  reply += nudgeToggle ? `Nudge: \`on\`\n` : `Nudge: \`off\`\n`;

  let nudgeChannel = await db.get(`clans.${clantag}.nudgeSettings.nudgeChannel`);
  const nudgeChannelCheck = interaction.guild.channels.cache.get(nudgeChannel);
  reply += nudgeChannelCheck ? `Nudge Channel: <#${nudgeChannel}>\n` : `Nudge Channel: \`None Set\`\n`;

  let lastNudged = await db.get(`clans.${clantag}.nudgeSettings.lastNudged`);
  if (lastNudged) {
    let unixTimestamp = moment(lastNudged).unix();
    reply += `Last nudged: <t:${unixTimestamp}:R>`;
  } else {
    reply += `Last nudged: \`N/A\``;
  }

  let embed = new EmbedBuilder()
    .setTitle(`${clanName}`)
    .setThumbnail(await getLink(`${badgeId}.png`))
    .setURL(`https://royaleapi.com/clan/${cleanClantag}`)
    .setColor("Purple")
    .setDescription(reply);
  return embed;

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