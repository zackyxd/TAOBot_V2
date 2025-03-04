const API = require("../../API.js");
const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, Embed } = require("discord.js");
const path = require('path');
const Database = require('better-sqlite3');
const { QuickDB } = require("quick.db")
const fs = require('fs');
const { createSuccessEmbed, createExistEmbed, createErrorEmbed, createMaintenanceEmbed } = require('../../utilities/embedUtility.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("check")
    .setDescription("Check which members in this channel are in the clan")
    .addStringOption(option =>
      option.setName("clan-abbreviation")
        .setDescription("What is the clan abbreviation you want to check instead?")
        .setRequired(true))
    .addBooleanOption(option =>
      option.setName(`ping-missing`)
        .setDescription(`Ping the players that have not joined the clan yet.`)
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers),

  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "check") return;
    await interaction.deferReply({ ephemeral: true });
    let abbrev = interaction.options.getString("clan-abbreviation").toLowerCase();
    let pingMissing = interaction.options?.getBoolean('ping-missing') ?? false;
    const dbPath = path.join(__dirname, `../../../guildData/${interaction.guild.id}.sqlite`);
    const db = new QuickDB({ filePath: dbPath });
    const clans = await db.get(`clans`) || {};
    if (!clans) {
      await interaction.editReply({ embeds: [createErrorEmbed(`Error grabbing clan data, likely no clans in server.`)] });
      return;
    }
    clantag = Object.keys(clans).find(tag => clans[tag].abbreviation === abbrev);
    if (!clantag) {
      await interaction.editReply({ embeds: [createErrorEmbed(`No abbreviation in server with \`${abbrev}\``)] });
      return;
    }

    let channelMembers = await db.get(`massLinkChannels.${interaction.channel.id}`);
    if (!channelMembers) {
      await interaction.editReply({ embeds: [createErrorEmbed(`Please only use this in a #members-X channel`)] });
      return;
    }
    let members = channelMembers.playersAdded;
    let clanData = await API.getClan(clantag);
    let membersInClan = {};
    for (const member of clanData.memberList) {
      membersInClan[member.tag] = { name: member.name, role: member.role };
    }

    let ifPlayerInClan = {};
    let membersInClanCount = 0;
    // Use Promise.all to fetch player data concurrently
    let playerPromises = members.map(async member => {
      let player = await API.getPlayer(member);
      let playerTag = player.tag;
      if (membersInClan[playerTag]) {
        membersInClanCount++;
        ifPlayerInClan[playerTag] = { name: player.name, playertag: player.tag, inClan: true, level: player.expLevel };
      } else {
        ifPlayerInClan[playerTag] = { name: player.name, playertag: player.tag, inClan: false, level: player.expLevel };
      }
    });
    await Promise.all(playerPromises);
    // Convert the object to an array of entries
    let sortedNames = Object.entries(ifPlayerInClan).sort((a, b) => {
      return a[1].name.localeCompare(b[1].name);
    });



    let sortedIfPlayerInClan = Object.fromEntries(sortedNames);
    // let description = "";
    let usersToPing = new Set();
    let usersNotPing = new Set();

    const MAX_FIELD_LENGTH = 25;
    let fieldContent = [];
    // Send embed
    let embed = new EmbedBuilder()
      .setTitle(`${clanData.name} Member Check (${membersInClanCount}/${members.length})`)
      .setThumbnail(process.env.BOT_IMAGE)
      .setColor(`Purple`);
    for (let player in sortedIfPlayerInClan) {
      console.log("Saw player:", player)
      let playerData = sortedIfPlayerInClan[player];

      fieldContent.push({
        name: '\t',
        value: `[${playerData.name}](<https://royaleapi.com/player/${(playerData.playertag).substring(1)}>) ${playerData.inClan ? '✅' : '❌'}`,
        inline: true
      })

      if (fieldContent.length >= MAX_FIELD_LENGTH && !pingMissing) {
        embed.addFields(fieldContent);
        if (membersInClanCount === members.length) {
          embed.setFooter({ text: 'All members in this channel have joined!' })
        }
        await interaction.channel.send({ embeds: [embed] });

        embed = new EmbedBuilder()
          .setTitle(`${clanData.name} Member Check (cont.)`)
          .setThumbnail(process.env.BOT_IMAGE)
          .setColor(`Purple`);
        fieldContent = [];
        // .setURL(`https://royaleapi.com/clan/${clanData.tag.substring(1)}`)
      }


      // if (playerData.inClan === true) {
      //   fieldContent += `[${playerData.name}](<https://royaleapi.com/player/${(playerData.playertag).substring(1)}>) ${playerData.inClan ? '✅' : '❌'}`;
      // } else if (playerData.inClan === false) {
      //   fieldContent += `[${playerData.name}](<https://royaleapi.com/player/${(playerData.playertag).substring(1)}>) ❌\n`;
      // }

      // Fetch the Discord user ID for each player tag
      let discordId = await db.get(`playertags.${playerData.playertag}.discordId`);


      if (playerData.inClan === false) { // && playerData.level > 25
        if (!usersNotPing.has(discordId)) {
          console.log("Adding discordId to usersToPing: ", discordId);
          usersToPing.add(discordId);
        }
      }
    }

    // Add any remaining content as a field
    if (fieldContent.length > 0 && !pingMissing) {
      embed.addFields(fieldContent);
      if (membersInClanCount === members.length) {
        embed.setFooter({ text: 'All members in this channel have joined!' });
      }
      await interaction.channel.send({ embeds: [embed] });
    }

    let playerPings1 = `**You have not joined \`${clanData.name}\` yet, please join:** `;
    let playerPings2 = ""; // list of players
    if (pingMissing === true && usersToPing.size > 0) {
      usersToPing.forEach(discordId => {
        if (discordId) {
          playerPings2 += `<@${discordId}> `
        }
      })
      let pingMessage = "";
      console.log("This is the players to ping: ", playerPings2);
      if (playerPings2 !== "") {
        pingMessage = playerPings1 + playerPings2;
      }
      else {
        pingMessage = "**Every in this channel has an account in the clan.**"
      }


      await interaction.editReply({ embeds: [createSuccessEmbed(`Sent ping & link.`)] });

      let clanInfo = await db.get(`clans.${clanData.tag}`)

      if (clanInfo && !clanInfo.clanLink) {
        await interaction.channel.send({ embeds: [createExistEmbed(`\`${clanInfo.clanName}\` does not have a clan invite available.`)] });
      }
      if (clanInfo && clanInfo.clanLink && clanInfo.alreadyExpired === 1) {
        await interaction.channel.send({ embeds: [createErrorEmbed(`The link for \`${clanInfo.clanName}\` is currently expired. Please generate a new invite.`)] });
      }
      if (clanInfo && clanInfo.clanLink && clanInfo.alreadyExpired === 0) {
        let embed = new EmbedBuilder()
          .setColor('#00FF00') // Green color for success
          .setDescription(`## [Click here to join ${clanInfo.clanName}](<${clanInfo.clanLink}>)\n-# Expires: <t:${clanInfo.expiryTime}:R>`) // Make the message bold
        if (membersInClanCount === members.length) {
          embed.setFooter({ text: 'All members in this channel have joined!' })
        }
        // .setFooter({ text: convertUnixToTime(clanInfo.expiryTime) })
        await interaction.channel.send(pingMessage);
        await interaction.channel.send({ embeds: [embed] });
        await interaction.channel.send(`-# [Click this to join ${clanInfo.clanName}](<${clanInfo.clanLink}>) Expires: <t:${clanInfo.expiryTime}:R>`);
      }

      return;
    }

    // const MAX_DESC_LENGTH = 2000;
    // console.log("Description length of check-clan is:", description.length);
    // let descriptions = splitDescription(description, MAX_DESC_LENGTH);

    // if (description.length < 1) {
    //   await interaction.editReply({ embeds: [createErrorEmbed(`The message was unable to send due to the length being ${description.length}. Likely no playertags added.`)] });
    //   return;
    // }
    // await interaction.editReply({ embeds: [createSuccessEmbed(`Sent list of players.`)] });
    // for (let desc of descriptions) {

    //   let embed = new EmbedBuilder()
    //     .setTitle(`${clanData.name} Member Check (${membersInClanCount}/${members.length})`)
    //     .setThumbnail(process.env.BOT_IMAGE)
    //     .setColor(`Purple`)
    //     // .setURL(`https://royaleapi.com/clan/${clanData.tag.substring(1)}`)
    //     .setDescription(desc);
    //   console.log(membersInClanCount, members.length);
    //   if (membersInClanCount === members.length) {
    //     embed.setFooter({ text: 'All members in this channel have joined!' })
    //   }

    //   await interaction.channel.send({ embeds: [embed] })
    // }

    await interaction.editReply({ embeds: [createSuccessEmbed(`Sent list of players.`)] });
  }
}

function splitDescription(description, maxLength) {
  let chunks = [];
  while (description.length > 0) {
    if (description.length > maxLength) {
      // Find last newline char in limit
      let chunkEnd = description.lastIndexOf('\n', maxLength);
      if (chunkEnd === -1) {
        chunkEnd = maxLength; // no newline found, split at maxlength
      }
      chunks.push(description.slice(0, chunkEnd));
      description = description.slice(chunkEnd + 1);
    }
    else {
      chunks.push(description);
      description = "";
    }
  }
  return chunks;
}