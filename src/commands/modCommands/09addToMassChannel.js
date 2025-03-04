const API = require("../../API.js");
const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, Embed, ChannelType, PermissionsBitField, ComponentType } = require("discord.js");
const path = require('path');
const Database = require('better-sqlite3');
const { QuickDB } = require("quick.db")
const fs = require('fs').promises;
const { createSuccessEmbed, createExistEmbed, createErrorEmbed, createMaintenanceEmbed } = require('../../utilities/embedUtility.js');


module.exports = {
  data: new SlashCommandBuilder()
    .setName("add-member")
    .setDescription("Add a user to a member channel.")
    .addUserOption(option =>
      option.setName("user")
        .setDescription("Please @ the player to add to a member channel.")
        .setRequired(true)
    )
    // .addChannelOption(option =>
    //   option.setName("channel")
    //     .setDescription("Please put the #member-channel you want to add this person to.")
    //     .setRequired(true)
    // )
    .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers),

  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "add-member") return;
    await interaction.deferReply({ ephemeral: true });
    let user = interaction.options.getMember("user"); // gets full user
    let userId = user.id;
    // let channel = interaction.options.getChannel("channel");
    // if (channel.type !== 0) {
    //   await interaction.editReply({ embeds: [createErrorEmbed("Please make sure the channel is a text channel.")] });
    //   return;
    // }

    const guild = interaction.guild;
    const dbPath = path.join(__dirname, `../../../guildData/${interaction.guild.id}.sqlite`);
    const db = new QuickDB({ filePath: dbPath });


    let validChannelForMember = await db.get(`massLinkChannels.${interaction.channel.id}`);
    if (!validChannelForMember) {
      await interaction.editReply({ embeds: [createErrorEmbed(`You cannot add this member to this channel.\nIt is not a #members channel`)] });
      return;
    }

    let getChannels = await db.get(`massLinkChannels`);
    if (!getChannels) {
      await interaction.editReply({ embeds: [createErrorEmbed("There were no channels created yet. Please do `/createmasschannel` to begin")] });
      return;
    }

    let wantedAccounts = [];
    let realAccounts = [];
    let findLinkedAccounts = await db.get(`users.${userId}`);
    let playertags = findLinkedAccounts?.playertags;
    if (!playertags) {
      await interaction.editReply({ embeds: [createErrorEmbed(`This user has no accounts linked, cannot add.`)] });
      return;
    }
    // linkedAccounts = [...linkedAccounts, ...playertags];
    // realAccounts.push(userId);

    let channelIdToAdd = await db.get(`massLinkChannels.${interaction.channel.id}.channelId`);
    if (!channelIdToAdd) {
      await interaction.editReply({ embeds: [createErrorEmbed(`Please @Zacky if you received this message`)] });
      return;
    }

    let channelToAddMemberTo = await interaction.guild.channels.cache.get(channelIdToAdd); // full channel data

    // Check if the user had access to the channel 
    // let hadAccess = false;
    // if (channelToAddMemberTo.permissionsFor(user).has(PermissionsBitField.Flags.ViewChannel)) {
    //   // await interaction.editReply({ embeds: [createExistEmbed(`<@${userId}> already had access to this channel.`)] });
    //   // return;
    // }

    // Fetch the existing playersAdded array 
    let currentPlayersAdded = await db.get(`massLinkChannels.${interaction.channel.id}.playersAdded`) || [];

    console.log(`Playertags # of user: ${playertags.length}`);


    if (playertags.length > 1) {
      let selectedTags = await handleMultiplePlayertags(interaction, user, playertags);
      if (selectedTags === 'stop') {
        await interaction.editReply({ content: '', embeds: [createExistEmbed(`Command stopped, please rerun if needed.`)], components: [] })
        return;
      }
      else if (selectedTags.length === 0) {
        await interaction.editReply({ content: '', embeds: [createExistEmbed(`No accounts selected, user not added.`)], components: [] })
        return;
      }
      else {
        wantedAccounts = [...wantedAccounts, ...selectedTags]
      }
    }
    else if (playertags.length === 1) {
      wantedAccounts = [...wantedAccounts, ...playertags];
    }
    else {
      await interaction.editReply({ components: [], content: `You shouldn\'t have gotten this? Playertag length: ${playertags.length}` });
      return;
    }

    // Update the playersAdded array with the new playertags 
    let updatedPlayersAdded = [...new Set([...currentPlayersAdded, ...wantedAccounts])]; // Using Set to avoid duplicates 

    // Save the updated playersAdded array back to the database 
    await db.set(`massLinkChannels.${interaction.channel.id}.playersAdded`, updatedPlayersAdded);
    await channelToAddMemberTo.permissionOverwrites.create(user, {
      ViewChannel: true,
      SendMessages: true,
    });

    let roleId = await db.get(`massLinkChannels.${interaction.channel.id}.roleId`);
    await interaction.guild.members.fetch();
    let allUsersHaveAccess;
    let allUsersHaveRole;
    do {
      allUsersHaveAccess = true;
      allUsersHaveRole = true;
      for (let memberId of [userId]) {
        let member = interaction.guild.members.cache.get(memberId);
        if (!channelToAddMemberTo.permissionsFor(member).has(PermissionsBitField.Flags.ViewChannel)) {
          await channelToAddMemberTo.permissionOverwrites.create(member, {
            ViewChannel: true,
            SendMessages: true,
          });
          allUsersHaveAccess = false;
        }

        if (roleId) {
          if (!member.roles.cache.has(roleId)) {
            await member.roles.add(roleId);
            allUsersHaveRole = false;
          }
        }
        else {
          allUsersHaveRole = false;
        }
      }
    } while (!allUsersHaveAccess && !allUsersHaveRole);
    console.log("Confirmed this person has access and or role");

    // let description1 = `Added <@${userId}> to this channel.`
    let description2 = `Added <@${userId}>: **Please read above or wait for any information about movements.**`
    // if (roleId) {
    //   description2 += `\nGave them the <@&${roleId}> role.`
    // }

    // await channelToAddMemberTo.send({ embeds: [createSuccessEmbed(description1)], components: [] });
    await channelToAddMemberTo.send(description2);

    await interaction.editReply({ embeds: [createSuccessEmbed(`Successfully added <@${userId}> to the channel <#${interaction.channel.id}>`)] })


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

function generateEmbed(user, playersData, selectedIndices) {
  return new EmbedBuilder()
    .setDescription(`### Choosing playertag(s) for ${user}\n` + playersData.map((pt, index) => {
      const emoji = pt.levelId ? `<:experience${pt.expLevel}:${pt.levelId}>` : '';
      const isSelected = selectedIndices.has(index) ? '✅' : '' // mark as selected
      return `${index + 1}. [${pt.name}](<https://royaleapi.com/player/${(pt.playertag).substring(1)}>) (${pt.playertag}) ${emoji} ${isSelected}`
    }).join('\n'))
}