const API = require("../../API.js");
const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, Embed, ChannelType, PermissionsBitField, ComponentType } = require("discord.js");
const path = require('path');
const Database = require('better-sqlite3');
const { QuickDB } = require("quick.db")
const fs = require('fs').promises;
const { createSuccessEmbed, createExistEmbed, createErrorEmbed, createMaintenanceEmbed } = require('../../utilities/embedUtility.js');

const command = new SlashCommandBuilder()
  .setName("add-members")
  .setDescription("Add multiple users to a member channel.")
  .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers);

// Dynamically add up to 10 user options
for (let i = 1; i <= 10; i++) {
  command.addUserOption(option =>
    option.setName(`user${i}`)
      .setDescription(`User ${i}`)
      .setRequired(i === 1) // Make the first user option required, others optional
  );
}

module.exports = {
  data: command,

  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "add-members") return;
    await interaction.deferReply({ ephemeral: true });

    // Collect mentioned users
    let users = [];
    for (let i = 1; i <= 10; i++) {
      const member = interaction.options.getMember(`user${i}`);
      if (member) users.push(member);
    }
    if (users.length === 0) {
      await interaction.editReply({ embeds: [createErrorEmbed("No @users were provided.")] });
      return;
    }

    const db = await API.getDb(interaction.guildId);

    // Check if channels have been created
    let getChannels = await db.get(`massLinkChannels`);
    if (!getChannels) {
      await interaction.editReply({ embeds: [createErrorEmbed("There were no channels created yet. Please do `/createmasschannel` to begin")] });
      return;
    }

    let validChannelForMember = await db.get(`massLinkChannels.${interaction.channel.id}`);
    if (!validChannelForMember) {
      await interaction.editReply({ embeds: [createErrorEmbed("You cannot add members to this channel.\nIt is not a #members channel")] });
      return;
    }

    let wantedAccounts = []; // Will hold objects: { user, playertag, name? }
    let multiPlayertagsData = []; // For users with multiple playertags

    for (const user of users) {
      let userId = user.id;
      let findLinkedAccounts = await db.get(`users.${userId}`);
      let playertags = findLinkedAccounts?.playertags;
      if (!playertags) {
        // await interaction.followUp({ embeds: [createErrorEmbed(`This user has no accounts linked, cannot add.`)], ephemeral: true });
        continue;
      }
      if (playertags.length > 1 && !multiPlayertagsData.some(data => data.user === user)) {
        multiPlayertagsData.push({ user, playertags });
      } else if (playertags.length === 1) {
        // Normalize: push an object with user, playertag, and optionally name later.
        wantedAccounts.push({ user, playertag: playertags[0] });
      }
    }

    let selectedTags = [];
    if (multiPlayertagsData.length > 0) {
      try {
        selectedTags = await handleMultiplePlayertags(interaction, multiPlayertagsData);
      } catch (error) {
        await interaction.followUp({ embeds: [createErrorEmbed(`Timed out or invalid. ${error}`)], ephemeral: true });
        return;
      }
      if (selectedTags === 'stop') {
        await interaction.editReply({
          content: '',
          embeds: [createExistEmbed(`Command stopped, please rerun if needed.`)],
          components: []
        });
        return;
      } else if (selectedTags.length === 0) {
        await interaction.editReply({
          content: '',
          embeds: [createExistEmbed(`No accounts selected, user(s) not added.`)],
          components: []
        });
        return;
      }
      // Merge interactive results (which are now flattened objects with { user, playertag, name })
      wantedAccounts = [...wantedAccounts, ...selectedTags];
    }
    if (wantedAccounts.length === 0) {
      await interaction.editReply({ embeds: [createErrorEmbed("No accounts selected, user(s) not added.")] });
      return;
    }

    // Build a mapping from each user ID to an array of their playertags.
    let accountMapping = {};
    for (const account of wantedAccounts) {
      const uid = account.user.id;
      if (!accountMapping[uid]) {
        accountMapping[uid] = [];
      }
      accountMapping[uid].push(account.playertag);
    }

    let channelIdToAdd = await db.get(`massLinkChannels.${interaction.channel.id}.channelId`);
    if (!channelIdToAdd) {
      await interaction.editReply({ embeds: [createErrorEmbed(`Please @Zacky if you received this message`)] });
      return;
    }

    let channelToAddMemberTo = interaction.guild.channels.cache.get(channelIdToAdd);
    if (!channelToAddMemberTo) {
      await interaction.editReply({ embeds: [createErrorEmbed("The members channel could not be found.")] });
      return;
    }

    let currentPlayersAdded = await db.get(`massLinkChannels.${interaction.channel.id}.playersAdded`) || [];
    let updatedPlayersAdded = [
      ...new Set([
        ...currentPlayersAdded,
        ...wantedAccounts.map(account => account.playertag)
      ])
    ];
    await db.set(`massLinkChannels.${interaction.channel.id}.playersAdded`, updatedPlayersAdded);

    for (const user of users) {
      await channelToAddMemberTo.permissionOverwrites.create(user, {
        ViewChannel: true,
        SendMessages: true,
      });
    }

    let roleId = await db.get(`massLinkChannels.${interaction.channel.id}.roleId`);
    await interaction.guild.members.fetch();
    for (const user of users) {
      let member = interaction.guild.members.cache.get(user.id);
      if (!channelToAddMemberTo.permissionsFor(member).has(PermissionsBitField.Flags.ViewChannel)) {
        await channelToAddMemberTo.permissionOverwrites.create(member, {
          ViewChannel: true,
          SendMessages: true,
        });
      }
      if (roleId && !member.roles.cache.has(roleId)) {
        await member.roles.add(roleId);
      }
    }
    console.log("Confirmed members have access and/or role");

    // Now, we want to build a confirmation message that shows each user once along with the accounts added.
    // We want only the playertags to be stored in the database, but the confirmation should display the names.
    // So, fetch API details for each account in wantedAccounts.
    let accountDetailsArr = await Promise.all(
      wantedAccounts.map(async (account) => {
        try {
          const details = await grabPlayerName(account.playertag);
          // Return an object including the user and details (including name).
          return { user: account.user, name: details.name, playertag: details.playertag };
        } catch (error) {
          return { user: account.user, name: account.playertag, playertag: account.playertag };
        }
      })
    );

    // Group the results by user ID.
    const groupedAccounts = accountDetailsArr.reduce((acc, cur) => {
      const uid = cur.user.id;
      if (!acc[uid]) {
        acc[uid] = { user: cur.user, names: [] };
      }
      acc[uid].names.push(cur.name);
      return acc;
    }, {});

    // Remove duplicate names per user.
    for (const uid in groupedAccounts) {
      groupedAccounts[uid].names = [...new Set(groupedAccounts[uid].names)];
    }

    // Calculate total number of unique accounts selected.
    let totalCount = Object.values(groupedAccounts)
      .reduce((sum, entry) => sum + entry.names.length, 0);

    // Build the confirmation string.
    let addedPlayersMessage = `**These are the accounts added:**\n`
    let confirmationMessage = Object.values(groupedAccounts)
      .map(entry => `<@${entry.user.id}>: ${entry.names.join(', ')}`)
      .join('\n');
    addedPlayersMessage += confirmationMessage;
    addedPlayersMessage += `\n\n**Please read above or wait for any information about movements.**`
    // Send a confirmation in the members channel.
    await channelToAddMemberTo.send(addedPlayersMessage);

    await interaction.editReply({
      embeds: [createSuccessEmbed(`Added ${totalCount} account${totalCount === 1 ? '' : 's'} to <#${channelToAddMemberTo.id}>.`)],
      components: []
    });
  }
}


async function handleMultiplePlayertags(interaction, multiUsersData) {
  const row = createButtonRow();
  let description = "";

  // Global mapping: optionNumber -> { user, playertag, pt }
  const mapping = {};
  // Group mapping: userId -> array of option numbers belonging to that user
  const groupMapping = {};
  let currentOption = 1;

  // Build mapping and description for each multi-account user.
  for (const { user, playertags } of multiUsersData) {
    // Fetch API data for each playertag:
    let playersData = await Promise.all(playertags.map(grabPlayerName));

    // Sort playersData by level (descending), then by name ascending.
    playersData.sort((a, b) => {
      if (a.level !== b.level) return b.level - a.level;
      return a.name.localeCompare(b.name);
    });

    // Use user mention in the description.
    description += `**<@${user.id}>**\n`;

    // Initialize groupMapping for this user.
    if (!groupMapping[user.id]) {
      groupMapping[user.id] = [];
    }

    playersData.forEach(pt => {
      const emoji = pt.levelId ? `<:experience${pt.expLevel}:${pt.levelId}>` : '';
      // Save the full user object (not only user.id) so later you can access user.id.
      mapping[currentOption] = { user, playertag: pt.playertag, pt };
      groupMapping[user.id].push(currentOption);
      description += `${currentOption}. [${pt.name}](<https://royaleapi.com/player/${pt.playertag.substring(1)}>) (${pt.playertag}) ${emoji}\n`;
      currentOption++;
    });
    description += "\n";
  }

  // Build and send the initial embed.
  const embed = new EmbedBuilder()
    .setTitle("Select Players")
    .setDescription(description)
    .setColor("Purple")
    .setFooter({ text: "Send a message with the option numbers you wish to toggle (separated by spaces)." });

  await interaction.editReply({
    embeds: [embed],
    components: [row],
    ephemeral: true
  });


  const buttonCollector = interaction.channel.createMessageComponentCollector({
    filter: i =>
      ['ccContinue', 'ccStop'].includes(i.customId) &&
      i.user.id === interaction.user.id,
    componentType: ComponentType.Button,
    time: 600000
  });

  const messageCollector = interaction.channel.createMessageCollector({
    filter: m => m.author.id === interaction.user.id,
    time: 600000
  });

  let selectedIndices = new Set();

  // Return a promise that resolves with the selected accounts.
  return new Promise((resolve, reject) => {
    buttonCollector.on('collect', async i => {
      await i.deferUpdate();
      if (i.customId === 'ccContinue') {
        // Stop collectors.
        buttonCollector.stop('continue');
        messageCollector.stop('continue');

        // Build selections grouped by user.
        const selectionsByUser = {};
        for (let opt of selectedIndices) {
          const obj = mapping[opt];
          if (!selectionsByUser[obj.user.id]) {
            selectionsByUser[obj.user.id] = [];
          }
          selectionsByUser[obj.user.id].push({
            user: obj.user,
            playertag: obj.playertag,
            name: obj.pt.name
          });
        }
        // Now flatten all selections into a single array.
        const flattenedSelections = Object.values(selectionsByUser).flat();
        resolve(flattenedSelections);


      } else if (i.customId === 'ccStop') {
        buttonCollector.stop('stop');
        messageCollector.stop('stop');
        resolve('stop');
      }
    });

    messageCollector.on('collect', async m => {
      const inputArr = m.content.split(' ');
      const inputNumbers = inputArr.map(n => parseInt(n)).filter(n => !isNaN(n));

      // Validate that each input number exists as a key in our mapping.
      const allValid = inputNumbers.every(n => n > 0 && n < currentOption);
      if (allValid) {
        // Toggle selection for each number.
        inputNumbers.forEach(num => {
          if (selectedIndices.has(num)) {
            selectedIndices.delete(num);
          } else {
            selectedIndices.add(num);
          }
        });
        try {
          await m.delete();
        } catch (error) {
          console.error("Error deleting message:", error);
        }
        // Update the embed using our mapping and selectedIndices.
        const updatedEmbed = generateEmbedFromMapping(mapping, selectedIndices, groupMapping);
        await interaction.editReply({ embeds: [updatedEmbed], components: [row], ephemeral: true });
        console.log("Selected option numbers:", selectedIndices);
      }
    });

    buttonCollector.on('end', (collected, reason) => {
      if (reason === 'time') {
        reject(new Error('Button press timeout'));
      }
    });
    messageCollector.on('end', (collected, reason) => {
      if (reason === 'time') {
        reject(new Error('Message collector timeout'));
      }
    });
  });
}

// Helper function to generate an updated embed from the mapping and current selections.
function generateEmbedFromMapping(mapping, selectedIndices, groupMapping) {
  let description = "";
  // Go through each user group.
  for (const userId in groupMapping) {
    description += `**<@${userId}>**\n`;
    // For each option number that belongs to this user.
    groupMapping[userId].forEach(opt => {
      const entry = mapping[opt];
      const pt = entry.pt;
      const emoji = pt.levelId ? `<:experience${pt.expLevel}:${pt.levelId}>` : '';
      const checkmark = selectedIndices.has(opt) ? ' ✅' : '';
      description += `${opt}. [${pt.name}](<https://royaleapi.com/player/${pt.playertag.substring(1)}>) (${pt.playertag}) ${emoji}${checkmark}\n`;
    });
    description += "\n";
  }
  return new EmbedBuilder()
    .setTitle("Select Players")
    .setDescription(description)
    .setColor("Purple")
    .setFooter({ text: "Send a message with the numbers (separated by spaces) to toggle selection." });
}


// Helper to generate an updated embed from mapping and selected indices.
// This version also attempts to visually group options by user.
function generateEmbedFromMapping(mapping, selectedIndices, groupMapping) {
  let description = "### Choose Players\n\n";
  // Loop over each user group in groupMapping.
  for (const userId in groupMapping) {
    // Instead of printing "User ID: ${userId}", print the mention:
    description += `**<@${userId}>**\n`;
    // Get all the option numbers for this user.
    const options = groupMapping[userId];
    options.forEach(opt => {
      const entry = mapping[opt];
      const pt = entry.pt;
      const emoji = pt.levelId ? `<:experience${pt.expLevel}:${pt.levelId}>` : '';
      const checkmark = selectedIndices.has(opt) ? ' ✅' : '';
      description += `${opt}. [${pt.name}](<https://royaleapi.com/player/${pt.playertag.substring(1)}>) (${pt.playertag}) ${emoji}${checkmark}\n`;
    });
    description += "\n";
  }

  return new EmbedBuilder()
    .setTitle("Select Players")
    .setDescription(description)
    .setColor("Purple")
    .setFooter({ text: "Send a message with the numbers (separated by spaces) to toggle selection." });
}



async function grabPlayerName(playertag) {
  if (playertag.charAt(0) !== '#') playertag = "#" + playertag;
  let playerData = await API.getPlayer(playertag);
  let levelId = await getEmojiIdGivenName(`experience${playerData.expLevel}`);
  return { playertag, name: playerData.name, level: playerData.expLevel, levelId };
}

async function getEmojiIdGivenName(name) {
  let emojiPath = path.join(__dirname, '..', '..', '..', `emojis.json`);
  try {
    const data = await fs.readFile(emojiPath, 'utf8');
    const emojis = JSON.parse(data);

    const emoji = emojis.find(emoji => emoji.name.trim() === name.trim());
    return emoji ? emoji.id : null; // REturn ID of emoji found, else null
  } catch (error) {
    console.error(`Error loading emojis in mass channel, ${error}`)
    return null;
  }
}

function createButtonRow() {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('ccContinue')
        .setLabel('Confirm')
        .setStyle(ButtonStyle.Primary)
    )
    .addComponents(
      new ButtonBuilder()
        .setCustomId('ccStop')
        .setLabel('Stop Command')
        .setStyle(ButtonStyle.Danger)
    );
}
