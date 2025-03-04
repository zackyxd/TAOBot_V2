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
    .setDescription("What is the channel you want for this clan's log?")
    .addStringOption(option =>
      option.setName("players")
        .setDescription("Please @ all the players in here to add to the channel.")
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName("describe")
        .setDescription("Please write one word or abbreviation for this channel. 10 character max.")
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
    if (describe.split(' ').length !== 1 || describe.length > 10) {
      await interaction.editReply({ embeds: [createErrorEmbed("Please make sure the `describe` option is a single word under 11 characters.")] });
      return;
    }
    const regex = /<@\d+>/g;
    const matches = players.match(regex);
    if (!matches) {
      await interaction.editReply({ embeds: [createErrorEmbed("Please mention at least one @user.")] });
      return;
    }

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
    let usersWithPlayertags = []; // All the users with a ral account
    for (let user of matches.values()) {
      user = user.substring(2, user.length - 1); // user normally looks like <@2342423424>
      let findLinkedAccounts = await db.get(`users.${user}`);
      let playertags = findLinkedAccounts?.playertags;
      if (!playertags) {
        try {
          await interaction.editReply({ embeds: [] })
          let result = await handleNoPlayertags(interaction, user);
          if (result === 'continue') {
            continue; // Skip user
          }
        } catch (error) {
          await interaction.editReply({ content: '', embeds: [createExistEmbed(`Command stopped, please rerun if needed.`)], components: [] })
          return; // command stopped
        }
      }

      if (playertags.length > 1) {
        let selectedTags = await handleMultiplePlayertags(interaction, user, playertags);
        if (selectedTags === 'stop') {
          await interaction.editReply({ content: '', embeds: [createExistEmbed(`Command stopped, please rerun if needed.`)], components: [] })
          return;
        }
        else {
          wantedAccounts = [...wantedAccounts, ...selectedTags];
        }
      }
      else if (playertags.length === 1) {
        wantedAccounts = [...wantedAccounts, ...playertags];
      }

      usersWithPlayertags.push(user);
    }

    if (usersWithPlayertags.length === 0 || wantedAccounts.length === 0) {
      await interaction.editReply({ embeds: [createErrorEmbed(`There were no members selected to create the channel.`)], components: [] });
      return;
    }



    const channel = await guild.channels.create({
      name: `members-${count}-${describe}`, // Ensure the name field is defined
      type: ChannelType.GuildText,
      // parent: '1182482429810847807', // my guild category id
      parent: "1283051581834530978", // TAO category id
      permissionOverwrites: null, // Inherit permissions from the category
    });

    let waitMessage = await channel.send('# Please don\'t send any messages until it shows all players have been added');


    // Add specific permission overwrites for mentioned users
    for (let userId of usersWithPlayertags) {
      console.log(userId);
      await channel.permissionOverwrites.create(userId, {
        ViewChannel: true,
        SendMessages: true,
      });
    }

    // Confirm everyone has access to channel before continuing. 
    await interaction.guild.members.fetch();
    let allUsersHaveAccess;
    let allUsersHaveRole;
    do {
      allUsersHaveAccess = true;
      allUsersHaveRole = true;
      for (let userId of usersWithPlayertags) {
        let member = interaction.guild.members.cache.get(userId);
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
    let messageId = message.id;
    const attachment = new AttachmentBuilder((API.findFileUpwards(__dirname, "movinggif.gif")));
    await channel.send({ files: [attachment] });
    let embed = new EmbedBuilder()
      .setColor("Purple")
      .setDescription(`Please stand by as we prepare movements. Invite links will be provided below 👇
`);
    await channel.send({ embeds: [embed] })
    await db.set(`massLinkChannels.${channel.id}`, {
      "channelId": channel.id,
      "users": [],
      "playersAdded": wantedAccounts,
      "originalMessage": messageId,
      "roleId": role ? role.id : undefined
    });

    // Delete the waiting message
    try {
      await waitMessage.delete();
      let grabMembersEmbed = await getAddedMembersDescription(db, channel);
      await channel.send({ embeds: [grabMembersEmbed] })
    } catch (error) {
      console.log("Issue with: members - ", count);
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

async function handleMultiplePlayertags(interaction, user, playertags) {
  // console.log(interaction, user, playertags);
  const row = createButtonRow();

  let playersData = await Promise.all(playertags.map(grabPlayerName));

  playersData.sort((a, b) => {
    if (a.level !== b.level) {
      return b.level - a.level;
    }
    return a.name.localeCompare(b.name);
  })

  let embed = new EmbedBuilder()
    .setDescription(`### Choosing playertag(s) for <@${user}>\n` + playersData.map((pt, index) => {
      const emoji = pt.levelId ? `<:experience${pt.expLevel}:${pt.levelId}>` : '';
      return `${index + 1}. [${pt.name}](<https://royaleapi.com/player/${(pt.playertag).substring(1)}>) (${pt.playertag}) ${emoji}`
    }).join('\n'))
    .setFooter({ text: `Send the # of the players you want to select/deselect\nSeparated by a space for each (1 2 3...)` })
    .setColor('Purple');

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
        resolve(Array.from(selectedIndices).map(index => playersData[index].playertag));
      }
      else if (i.customId === 'ccStop') {
        buttonCollector.stop('stop');
        messageCollector.stop('stop');
        // resolve(new Error(`Command stopped by user`));
        resolve('stop');
      }
    });

    messageCollector.on('collect', async m => {
      interactionOccured = true;
      const inputContent = m.content.split(' ');
      const inputIndices = new Set(m.content.split(' ').map(num => parseInt(num - 1)));

      const allValid = inputContent.every(num => !isNaN(parseInt(num)) && parseInt(num) > 0 && parseInt(num) <= playersData.length);

      if (allValid) {
        inputIndices.forEach(index => {
          if (selectedIndices.has(index)) {
            selectedIndices.delete(index);
          }
          else {
            selectedIndices.add(index);
          }
        })

        try {
          await m.delete();
        } catch (error) {
          console.log("Someone tried 2 create channel's and typing");
        }
        embed = generateEmbed(user, playersData, selectedIndices);
        await interaction.editReply({ embeds: [embed], ephemeral: true })
        console.log(selectedIndices);
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
        .setLabel('Continue')
        .setStyle(ButtonStyle.Primary)
    )
    .addComponents(
      new ButtonBuilder()
        .setCustomId('ccStop')
        .setLabel('Stop Command')
        .setStyle(ButtonStyle.Danger)
    );
}

function generateEmbed(user, playersData, selectedIndices) {
  return new EmbedBuilder()
    .setDescription(`### Choosing playertag(s) for <@${user}>\n` + playersData.map((pt, index) => {
      const emoji = pt.levelId ? `<:experience${pt.expLevel}:${pt.levelId}>` : '';
      const isSelected = selectedIndices.has(index) ? '✅' : '' // mark as selected
      return `${index + 1}. [${pt.name}](<https://royaleapi.com/player/${(pt.playertag).substring(1)}>) (${pt.playertag}) ${emoji} ${isSelected}`
    }).join('\n'))
}

// Show who was added to the channel, using code from checkInClan.js
async function getAddedMembersDescription(db, channel) {
  let channelMembers = await db.get(`massLinkChannels.${channel.id}`);
  let members = channelMembers.playersAdded;
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