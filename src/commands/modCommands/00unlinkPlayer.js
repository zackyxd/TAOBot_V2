const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, Embed } = require("discord.js");
const path = require('path');
const Database = require('better-sqlite3');
const { QuickDB } = require("quick.db")
const fs = require('fs');
const API = require("../../API.js");
const { createSuccessEmbed, createExistEmbed, createErrorEmbed, createMaintenanceEmbed } = require('../../utilities/embedUtility.js');



module.exports = {
  data: new SlashCommandBuilder()
    .setName("unlink-player")
    .setDescription("Unink a single playertag from any Discord account")
    .addStringOption((option) =>
      option
        .setName("playertag")
        .setDescription("playertag of user")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers),

  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "unlink-player") return;
    await interaction.deferReply();

    let playertag = interaction.options.get("playertag").value.toUpperCase();
    playertag = playertag.replace(/o/gi, '0'); // Replace 'O' and 'o' with '0'
    if (playertag.charAt(0) !== "#") {
      playertag = "#" + playertag;
    }

    const dbPath = path.join(__dirname, `../../../guildData/${interaction.guild.id}.sqlite`);
    const db = new QuickDB({ filePath: dbPath });

    // Get PlayerData.json, if error return error, else link player.
    // let crAccount = await API.getPlayer(playertag);
    // if (crAccount.data) {
    //   await interaction.editReply({ embeds: [crAccount] });
    //   return;
    // }


    try {
      // Get player data (discordId);
      let playerData = await db.get(`playertags.${playertag}`);
      if (playerData && !playerData.discordId) {
        await interaction.editReply({ embeds: [createErrorEmbed(`Playertag ${playertag} is not linked to any user.`)] });
        return;
      }
      let discordId = playerData.discordId;
      // Remove the discordId from the player data
      delete playerData.discordId;
      // Update the player data in the database
      await db.set(`playertags.${playertag}`, playerData);


      // Get the user data and remove playertag from user's playertags list
      let userData = await db.get(`users.${discordId}`);
      if (userData && userData.playertags) {
        userData.playertags = userData.playertags.filter(tag => tag !== playertag);
        await db.set(`users.${discordId}`, userData);
      }

      await interaction.editReply({ embeds: [createSuccessEmbed(`Playertag ${playertag} successfully unlinked from <@${discordId}>`)] });

    } catch (error) {
      console.error('Error unlinking playertag:', error);
      await interaction.editReply({ embeds: [createErrorEmbed('An error occurred while unlinking the playertag. Please try again later.')] });
      return;
    }
  }
};

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