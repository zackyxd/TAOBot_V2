const { google } = require('googleapis');
require('dotenv/config');
const { Events, PermissionsBitField, EmbedBuilder, Embed, SlashCommandBuilder, PermissionFlagsBits, ButtonBuilder, ButtonStyle, ActionRowBuilder, ComponentType } = require('discord.js');
const { QuickDB } = require('quick.db');
const API = require("../../API.js");
const { createSuccessEmbed, createErrorEmbed, createExistEmbed } = require('../../utilities/embedUtility.js');
const path = require('path');
const fs = require('fs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('average')
    .setDescription("Check up to 5 player averages of an @user for a specific league")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("@user to check")
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName("war-type")
        .setDescription("Do you want to check 4k or 5k leagues?")
        .setRequired(true)
        .addChoices(
          { name: "5k League", value: "5k" },
          { name: "4k League", value: "4k" },
        )),

  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "average") return;
    await interaction.deferReply();

    let user;
    let discordId;

    try {
      // Attempt to get the member from the guild
      user = interaction.options.getMember("user");
      if (user) {
        discordId = user.user.id; // Member found
      } else {
        // Fallback to fetching the user directly using the "user" option
        const userOption = interaction.options.getUser("user");
        if (userOption) {
          discordId = userOption.id; // Use the ID of the resolved user
          user = await interaction.client.users.fetch(discordId);
        }
      }
    } catch (error) {
      console.error("Failed to fetch user or member:", error);
      await interaction.editReply("An error occurred while retrieving the user. Please ensure the user or ID is valid.");
      return;
    }

    if (!user) {
      await interaction.editReply("Could not find the specified user. Please ensure the user or ID is valid.");
      return;
    }
    let warType = interaction.options?.getString('war-type');
    const dbPath = path.join(__dirname, `../../../guildData/${interaction.guild.id}.sqlite`);
    const db = new QuickDB({ filePath: dbPath });
    let stats = await grabStatsData(db, discordId, warType);
    if (stats.notLinked === true) {
      await interaction.editReply({ embeds: [createErrorEmbed(`<@${discordId}> has no accounts linked.`)] });
      return;
    }
    if (stats.length === 0) {
      await interaction.editReply({ embeds: [createErrorEmbed(`<@${discordId}> has no ${warType} scores yet.`)] });
      return;
    }

    const uniqueId = `${interaction.id}-${Date.now()}`
    const statsEmbeds = await Promise.all(stats.map(async player => {
      const embed = new EmbedBuilder()
        .setTitle(`${warType} Stats`)
        .setDescription(`[${player.name}](<https://royaleapi.com/player/${player.tag}>)`)
        .addFields(
          { name: 'Cur. Average', value: player.fameAverage.toString(), inline: false },
          ...player.last3Wars.map(war => ({
            name: `${war.warWeek}`,
            value: `${war.fame}/${war.attacks}`,
            inline: true
          }))
        )
        .setColor("Purple")
        .setFooter({ text: `${user?.nickname || user?.user?.username || user.username || discordId}`, iconURL: user?.user?.displayAvatarURL() || user.displayAvatarURL() || null })
      // await interaction.editReply({ embeds: [embed] })
      return embed;
    }));


    let allNames = "";
    stats.forEach((player, index) => {
      allNames += `${index + 1}. [${player.name}](<https://royaleapi.com/player/${player.tag}>) (${player.fameAverage.toString()})\n`;
    })

    const summaryEmbed = new EmbedBuilder()
      .setTitle(`${user?.nickname || user?.user?.username || user.username || discordId} Stats (${warType})`)
      .setDescription(allNames)
      .setFooter({ text: `${user?.nickname || user?.user?.username || user.username || discordId}`, iconURL: user?.user?.displayAvatarURL() || user.displayAvatarURL() || null })
      .setColor("Purple")
      .setThumbnail(process.env.BOT_IMAGE);


    const buttonRow = new ActionRowBuilder().addComponents(
      ...stats.map((player, index) => (
        new ButtonBuilder()
          .setCustomId(`player-${index}-${uniqueId}`)
          .setLabel(`${index + 1}`)
          .setStyle(ButtonStyle.Primary)
      ))
    )

    try {
      await interaction.editReply({ embeds: [summaryEmbed], components: [buttonRow] })
    } catch (error) {
      console.log("Failed to edit reply because command was deleted for /average");
    }


    // Collector for button pushes
    const filter = i => i.customId.includes(uniqueId) || i.customId === `home-${uniqueId}`;
    const collector = interaction.channel.createMessageComponentCollector({ filter, time: 120000 });

    collector.on('collect', async i => {
      try {
        if (i.user.id !== interaction.user.id) {
          await i.reply({ embeds: [createErrorEmbed(`These aren't your button(s) to use, please create your own by running the command /average.`)], ephemeral: true })
          return;
        }
        if (i.customId === `home-${uniqueId}`) {
          await i.update({ embeds: [summaryEmbed], components: [buttonRow] });
        }
        else {
          const index = parseInt(i.customId.split('-')[1]);
          const embed = statsEmbeds[index];
          const homeButtonRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`home-${uniqueId}`)
              .setEmoji('🏠')
              .setStyle(ButtonStyle.Primary)
          );
          await i.update({ embeds: [embed], components: [homeButtonRow] })
        }
      } catch (error) {
        console.log("Failed to handle button interaction in averages", error);
      }
    });

    collector.on('end', async collected => {
      try {
        await interaction.editReply({ components: [] })
      } catch (error) {
        console.log("Tried to update /average message, but it was deleted");
      }
    });


  }
}

async function readSheet(group) {
  const sheets = google.sheets('v4');
  let credentials;
  try {
    credentials = JSON.parse(process.env.STATSCREDENTIALS);
  } catch (error) {
    console.error(`Error parsing sheets JSON`, error);
    return;
  }

  const auth = new google.auth.GoogleAuth({
    credentials: credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });

  let rows;
  try {
    const client = await auth.getClient();
    const googleSheets = google.sheets({ version: 'v4', auth: client });
    const spreadsheetId = '1b8BgwkPZ2cUgUvy_2r5zISCSxG207qtIf7re3sVL8x0'
    const metaData = await googleSheets.spreadsheets.get({
      auth, spreadsheetId
    });

    const response = await sheets.spreadsheets.values.get({
      auth, spreadsheetId, range: `'${group} Averages'!A1:ZZ1500`
    });
    rows = response?.data?.values;
  } catch (error) {
    console.log(`Issue finding data for this response for ${group}k`);
  }

  if (rows?.length) {
    return rows;
  }
  else {
    return null;
  }
}

function findPlayertagData(rows, playertag) {
  const headerRow = rows[0];
  let playerData;
  for (const [index, row] of rows.entries()) {
    if (row.includes(playertag)) {
      playerData = { row, headerRow, rowIndex: index };
      return outputPlayerData(playerData);
    }
  }
  return null;
}

function outputPlayerData(playerData) {
  const [headerRow, row] = [playerData.headerRow, playerData.row];
  // Get all info from row
  const tag = row[0];
  const name = row[1];
  const lastClan = row[2] || "N/A";
  const fameAverage = parseFloat(row[3]);
  const fameData = row.slice(4); // Slice from above past to get all data
  let last3Wars = [];
  // for each fame/attacks entry, go through until we have max 3
  for (let i = 0; i < fameData.length; i += 2) {
    const fame = parseInt(fameData[i]);
    const attacks = parseInt(fameData[i + 1]);
    const warWeek = headerRow[i + 4]; // adjust index to match header row
    if (!isNaN(fame) && !isNaN(attacks)) {
      last3Wars.push({ fame, attacks, warWeek });
      if (last3Wars.length >= 3) break;
    }
  }
  // Return the necessary info
  return { tag, name, lastClan, fameAverage, last3Wars }
}


async function grabStatsData(db, userId, warType) {
  let playertagsData = await db.get(`users.${userId}`);
  let playertags = playertagsData?.playertags;
  if (!playertags || playertags?.length === 0) {
    return { notLinked: true };
  }
  let activePlayers = [];
  let sheetData = await readSheet(warType);
  if (!sheetData) {
    console.log("Issue reading sheet with given argument");
    return;
  }
  for (const playertag of playertags) {
    let completeData = findPlayertagData(sheetData, playertag.slice(1)); // remove # from db playertag
    if (!completeData || completeData.last3Wars.length === 0) {
      continue; // didnt exist
    }
    // console.log(completeData);
    activePlayers.push(completeData);
  }
  activePlayers.sort((a, b) => b.fameAverage - a.fameAverage); // sort by fame
  const top5 = activePlayers.slice(0, 5);
  return top5;
}
