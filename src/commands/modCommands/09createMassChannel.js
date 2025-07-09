const API = require("../../API.js");
const { SlashCommandBuilder, PermissionFlagsBits, ComponentType, AttachmentBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, Embed, ChannelType, PermissionsBitField } = require("discord.js");
const path = require('path');
const Database = require('better-sqlite3');
const { QuickDB } = require("quick.db")
const fs = require('fs').promises;
const { createSuccessEmbed, createExistEmbed, createErrorEmbed, createMaintenanceEmbed } = require('../../utilities/embedUtility.js');


module.exports = {
  data: new SlashCommandBuilder()
    .setName("createchannel")
    .setDescription("Create a channel to help move members to different clan(s).")
    .addStringOption(option =>
      option.setName("players")
        .setDescription("Please @ all the players in here to add to the channel.")
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName("describe")
        .setDescription("Please write max 3 words for this channel. 20 characters max.")
        .setRequired(true)
    )
    .addRoleOption(option =>
      option.setName("role-to-give")
        .setDescription("Do you want to give them a role? Which?")
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers),

  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "createchannel") return;
    await interaction.deferReply({ ephemeral: true });
    let players = interaction.options.getString("players");
    let describe = interaction.options.getString("describe");
    let role = interaction.options.getRole("role-to-give") || null;
    // console.log(role)
    if (describe.split(' ').length > 3 || describe.length > 20) {
      await interaction.editReply({ embeds: [createErrorEmbed("Please make sure the `describe` option is max 3 words and 20 characters.")] });
      return;
    }
    const regex = /<@\d+>/g;
    let matches = players.match(regex);
    if (!matches) {
      await interaction.editReply({ embeds: [createErrorEmbed("Please mention at least one @user.")] });
      return;
    }
    matches = [...new Set(matches)]
    const guild = interaction.guild;
    const dbPath = path.join(__dirname, `../../../guildData/${interaction.guild.id}.sqlite`);
    const db = new QuickDB({ filePath: dbPath });

    let getChannels = await db.get(`massLinkChannels`);
    if (!getChannels) {
      await db.set(`massLinkChannels`, {
        "count": 0,
      })
    }
    let count = await db.get(`massLinkChannels.count`) || 0;
    count++;
    await db.set(`massLinkChannels.count`, count);




    let wantedAccounts = []; // all the playertags linked
    let multiPlayertagsData = []; // all the playertags linked
    let usersWithPlayertags = []; // All the users with a real account
    for (let rawUser of matches) {
      console.log(rawUser);
      // Convert user string <@222222> to just id
      let userId = rawUser.substring(2, rawUser.length - 1);
      let findLinkedAccounts = await db.get(`users.${userId}`);
      let playertags = findLinkedAccounts?.playertags;
      let userObj;
      if (playertags && playertags.length > 1) {
        try {
          userObj = await guild.members.fetch(userId);
          multiPlayertagsData.push({ user: userObj, playertags });
        } catch (error) {
          console.log("Account not in server:", userId)
        }
      }
      else if (playertags && playertags.length === 1) {
        try {
          userObj = await guild.members.fetch(userId);
          wantedAccounts.push({ user: userObj, playertag: playertags[0] });
        } catch (error) {
          console.log("Account not in server:", userId)
        }
      }
      if (!userObj) {
        continue;
      }
      usersWithPlayertags.push(userId);
    }
    // for (let user of matches.values()) {
    //   user = user.substring(2, user.length - 1); // user normally looks like <@2342423424>
    //   let findLinkedAccounts = await db.get(`users.${user}`);
    //   let playertags = findLinkedAccounts?.playertags;
    //   if (!playertags) {
    //     try {
    //       await interaction.editReply({ embeds: [] })
    //       let result = await handleNoPlayertags(interaction, user);
    //       if (result === 'continue') {
    //         continue; // Skip user
    //       }
    //     } catch (error) {
    //       await interaction.editReply({ content: '', embeds: [createExistEmbed(`Command stopped, please rerun if needed.`)], components: [] })
    //       return; // command stopped
    //     }
    //   }

    //   if (playertags.length > 1) {
    //     let selectedTags = await handleMultiplePlayertags(interaction, user, playertags);
    //     if (selectedTags === 'stop') {
    //       await interaction.editReply({ content: '', embeds: [createExistEmbed(`Command stopped, please rerun if needed.`)], components: [] })
    //       return;
    //     }
    //     else {
    //       wantedAccounts = [...wantedAccounts, ...selectedTags];
    //     }
    //   }
    //   else if (playertags.length === 1) {
    //     wantedAccounts = [...wantedAccounts, ...playertags];
    //   }

    //   usersWithPlayertags.push(user);
    // }

    if (usersWithPlayertags.length === 0) {
      await interaction.editReply({ embeds: [createErrorEmbed(`There were no members selected to create the channel.`)], components: [] });
      return;
    }

    let selectedTags = [];
    if (multiPlayertagsData.length > 0) {
      try {
        selectedTags = await handleMultiplePlayertags(interaction, multiPlayertagsData);
      } catch (error) {
        console.log(error);
        await interaction.followUp({ content: '', embeds: [createExistEmbed(`Timed out or invalid. ${error}. Likely too many players in the list`)], components: [], ephemeral: true })
        return;
      }

      if (selectedTags === 'stop') {
        await interaction.editReply({ content: '', embeds: [createExistEmbed(`Command stopped, please rerun if needed.`)], components: [] })
        return;
      }
      else if (selectedTags.length === 0) {
        await interaction.editReply({ embeds: [createErrorEmbed(`There were no members selected to create the channel.`)], components: [] });
        return;
      }
      wantedAccounts = [...wantedAccounts, ...selectedTags];
    }

    // Build mapping from each user id to an array of playertags, so that DB only saves tags.
    let accountMappingForDB = {};
    for (const account of wantedAccounts) {
      const uid = account.user.id;
      if (!accountMappingForDB[uid]) accountMappingForDB[uid] = [];
      accountMappingForDB[uid].push(account.playertag);
    }
    let flatTagsForDB = Object.values(accountMappingForDB).flat


    const channel = await guild.channels.create({
      name: `members-${count}-${describe}`, // Ensure the name field is defined
      type: ChannelType.GuildText,
      // parent: '1182482429810847807', // my guild category id
      parent: "1283051581834530978", // TAO category id
      permissionOverwrites: null, // Inherit permissions from the category
    });

    await db.set(`massLinkChannels.${channel.id}`, {
      "channelId": channel.id,
      "users": [],
      // Map each account object to only its playertag property.
      "playersAdded": wantedAccounts.map(account => account.playertag),
      "roleId": role ? role.id : undefined
    });



    let waitMessage = await channel.send('# Please don\'t send any messages until it shows all players have been added');


    // Add specific permission overwrites for mentioned users
    for (let userId of usersWithPlayertags) {
      try {
        await channel.permissionOverwrites.create(userId, {
          ViewChannel: true,
          SendMessages: true,
        });
      } catch (error) {
        console.log('User does not exist in the server', userId)
        delete usersWithPlayertags[userId]
      }
    }


    // Confirm everyone has access to channel before continuing. 
    let allUsersHaveAccess;
    let allUsersHaveRole;
    do {
      allUsersHaveAccess = true;
      allUsersHaveRole = true;
      for (let userId of usersWithPlayertags) {
        let member = interaction.guild.members.cache.get(userId);
        if (!member) continue;
        if (!channel.permissionsFor(member).has(PermissionsBitField.Flags.ViewChannel)) {
          await channel.permissionOverwrites.create(member, {
            ViewChannel: true,
            SendMessages: true,
          });
          allUsersHaveAccess = false;
        }

        if (role) {
          if (!member.roles.cache.has(role.id)) {
            await member.roles.add(role.id);
            allUsersHaveRole = false;
          }
        }
        else {
          allUsersHaveRole = false;
        }
      }
    } while (!allUsersHaveAccess && !allUsersHaveRole);
    console.log("Confirmed everyone has access and or role");

    let description = usersWithPlayertags.length === 1 ? `Created <#${channel.id}> with ${usersWithPlayertags.length} member.` : `Created <#${channel.id}> with ${usersWithPlayertags.length} members.`;

    if (role) {
      description += `\nGave the <@&${role.id}> role.`
    }

    const mentions = matches.map(user => `${user}`).join(' ');
    let message = await channel.send(`Attention: ${mentions}\nCreated by <@${interaction.user.id}>`);
    const attachment = new AttachmentBuilder((API.findFileUpwards(__dirname, "today-we-cook.gif")));
    await channel.send({ files: [attachment] });
    let embed = new EmbedBuilder()
      .setColor("Purple")
      .setDescription(`Please stand by as we prepare movements. Invite links will be provided below 👇
`);
    await channel.send({ embeds: [embed] })


    // Delete the waiting message
    try {
      await waitMessage.delete();
      let grabMembersEmbed = await getAddedMembersDescription(db, channel);
      await channel.send({ embeds: [grabMembersEmbed] })
    } catch (error) {
      console.log("Issue with: members - #", count);
      console.log(error);
    }

    if (usersWithPlayertags.length === 1) {
      await interaction.editReply({ embeds: [createSuccessEmbed(description)], components: [] });
    }
    else {
      await interaction.editReply({ embeds: [createSuccessEmbed(description)], components: [], content: '' });
    }

  }


}

async function handleMultiplePlayertags(interaction, multiUsersData) {
  // console.log(interaction, user, playertags);
  const row = createButtonRow();
  let description = "";
  // Global mapping
  const mapping = {};
  const groupMapping = {};
  let currentOption = 1;


  for (const { user, playertags } of multiUsersData) {
    let playersData = await Promise.all(playertags.map(grabPlayerName)); // Get api of all 
    // Sort by level, then name
    playersData.sort((a, b) => {
      if (a.level !== b.level) {
        return b.level - a.level;
      }
      return a.name.localeCompare(b.name);
    });

    description += `<@${user.id}>\n`;
    groupMapping[user.id] = [];
    playersData.forEach(pt => {
      const emoji = pt.levelId ? `<:experience${pt.expLevel}:${pt.levelId}>` : '';
      mapping[currentOption] = { user, playertag: pt.playertag, pt };
      groupMapping[user.id].push(currentOption);
      // description += `${currentOption}. [${pt.name}](<https://royaleapi.com/player/${(pt.playertag).substring(1)}>) (${pt.playertag}) ${emoji}\n`;
      description += `${currentOption}. ${pt.name} (${pt.playertag}) ${emoji}\n`;
      currentOption++;
    });
    description += '\n';
  }

  let embed = new EmbedBuilder()
    .setDescription(description)
    .setColor("Purple")
    .setFooter({ text: `Send a message with the option numbers you wish to toggle (separated by spaces).` });

  await interaction.editReply({
    embeds: [embed],
    components: [row],
    ephemeral: true
  })


  const filter = i => ['ccContinue', 'ccStop'].includes(i.customId) && i.user.id === interaction.user.id;
  const buttonCollector = interaction.channel.createMessageComponentCollector({ filter, componentType: ComponentType.Button, time: 600000 });

  const messageFilter = m => m.author.id === interaction.user.id;
  const messageCollector = interaction.channel.createMessageCollector({ filter: messageFilter, time: 600000 });


  let selectedIndices = new Set();
  return new Promise((resolve, reject) => {
    buttonCollector.on('collect', async i => {
      await i.deferUpdate();
      if (i.customId === 'ccContinue') {
        buttonCollector.stop('continue');
        messageCollector.stop('continue');
        // When confirmed, resolve with a flattened array of objects: { user, playertag, name }.
        // We map each selected option number to its object.
        const selections = Array.from(selectedIndices).map(index => {
          return {
            user: mapping[index].user,
            playertag: mapping[index].playertag,
            name: mapping[index].pt.name
          };
        });
        resolve(selections);
      } else if (i.customId === 'ccStop') {
        buttonCollector.stop('stop');
        messageCollector.stop('stop');
        resolve('stop');
      }
    });
    messageCollector.on('collect', async m => {
      // Split the input by whitespace and convert to numbers (1-based).
      const inputNumbers = m.content.split(' ').map(n => parseInt(n, 10)).filter(n => !isNaN(n));
      // Validate that each number is within our options range.
      const allValid = inputNumbers.every(n => n > 0 && n < currentOption);
      if (allValid) {
        // Toggle each number in the selectedIndices.
        inputNumbers.forEach(num => {
          if (selectedIndices.has(num)) selectedIndices.delete(num);
          else selectedIndices.add(num);
        });
        try {
          await m.delete();
        } catch (error) {
          console.error("Error deleting message:", error);
        }
        // Update the embed.
        const updatedEmbed = generateEmbedFromMapping(mapping, selectedIndices, groupMapping);
        await interaction.editReply({ embeds: [updatedEmbed], components: [row], ephemeral: true });
      }
    });

    buttonCollector.on('end', (collected, reason) => {
      if (reason === 'time') {
        reject(new Error('No button press detected within the time limit'));
      }
    });

    messageCollector.on('end', (collected, reason) => {
      if (reason === 'time') {
        reject(new Error('No message sent within the time limit'));
      }
    });
  })
}

async function handleNoPlayertags(interaction, user) {
  const row = createButtonRow();

  await interaction.editReply({
    content: `The user <@${user}> has no playertags linked to them. What would you like to do?`,
    components: [row]
  });

  const filter = i => ['ccContinue', 'ccStop'].includes(i.customId) && i.user.id === interaction.user.id;
  const collector = interaction.channel.createMessageComponentCollector({ filter, componentType: ComponentType.Button, time: 600000 });

  return new Promise((resolve, reject) => {
    collector.on('collect', async i => {
      console.log(`Button pressed: ${i.customId}`);
      await i.deferUpdate();

      if (i.customId === 'ccContinue') {
        console.log('Resolving promise with "continue"');
        resolve('continue');
      }
      else if (i.customId === 'ccStop') {
        console.log('Rejecting promise with "Command stopped by user."');
        reject(new Error('Command stopped by user.'));
      }

      collector.stop();
    });

    collector.on('end', (collected, reason) => {
      if (reason === 'time') {
        console.log('Rejecting promise with "No button press detected within the time limit."');
        reject(new Error('No button press detected within the time limit.'));
      }
    });
  })
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

// Helper to regenerate the embed that shows the options and
// marks selected ones with a checkmark.
function generateEmbedFromMapping(mapping, selectedIndices, groupMapping) {
  let description = "";
  for (const userId in groupMapping) {
    description += `**<@${userId}>**\n`;
    groupMapping[userId].forEach(opt => {
      const entry = mapping[opt];
      const emoji = entry.pt.levelId ? `<:experience${entry.pt.expLevel}:${entry.pt.levelId}>` : "";
      const checkmark = selectedIndices.has(opt) ? " ✅" : "";
      // description += `${opt}. [${entry.pt.name}](<https://royaleapi.com/player/${entry.pt.playertag.substring(1)}>) (${entry.pt.playertag}) ${emoji}${checkmark}\n`;
      description += `${opt}. ${entry.pt.name} (${entry.pt.playertag}) ${emoji}${checkmark}\n`;
    });
    description += "\n";
  }
  return new EmbedBuilder()
    .setDescription(description)
    .setColor("Purple")
    .setFooter({ text: "Send a message with the numbers (space separated) to toggle selection." });
}

// Show who was added to the channel, using code from checkInClan.js
async function getAddedMembersDescription(db, channel) {
  let channelMembers = await db.get(`massLinkChannels.${channel.id}`);
  let members = channelMembers.playersAdded;
  console.log(members);
  // let membersInClan = {};
  // for (const member of clanData.memberList) {
  //   membersInClan[member.tag] = { name: member.name, role: member.role };
  // }
  // let ifPlayerInClan = {};
  // let membersInClanCount = 0;
  // Use Promise.all to fetch player data concurrently
  let players = {};
  let playerPromises = members.map(async member => {
    let player = await API.getPlayer(member);
    let playerTag = player.tag;
    players[playerTag] = { name: player.name, playertag: player.tag, level: player.expLevel };
  });
  await Promise.all(playerPromises);
  // Convert the object to an array of entries
  let sortedNames = Object.entries(players).sort((a, b) => {
    return a[1].name.localeCompare(b[1].name);
  });

  let sortedPlayerNames = Object.fromEntries(sortedNames);
  let description = "";

  for (let player in sortedPlayerNames) {
    let playerData = players[player];
    description += `### [${playerData.name}](<https://royaleapi.com/player/${(playerData.playertag).substring(1)}>)\n`;
  }

  let embed = new EmbedBuilder()
    .setTitle(`Players Selected`)
    .setThumbnail(process.env.BOT_IMAGE)
    .setColor(`Purple`)
    // .setURL(`https://royaleapi.com/clan/${clanData.tag.substring(1)}`)
    .setDescription(description)
    .setFooter({ text: `Please find your name for which account to move.` })

  return embed;
}