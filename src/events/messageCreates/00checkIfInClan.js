const { Events, PermissionsBitField, ChannelType, EmbedBuilder } = require('discord.js');
const { QuickDB } = require('quick.db');
const API = require("../../API.js");
const path = require('path');
const fs = require('fs');
const { createSuccessEmbed, createErrorEmbed } = require('../../utilities/embedUtility.js');


module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    if (message.author.bot) return;
    const member = message.guild.members.cache.get(message.author.id);
    if (!member.permissions.has(PermissionsBitField.Flags.MuteMembers)) return;
    if (!message.content.startsWith('!check')) return;
    await message.delete();
    const guild = message.guild;
    const dbPath = path.join(__dirname, `../../../guildData/${message.guild.id}.sqlite`);
    const db = new QuickDB({ filePath: dbPath });

    const findClanAbbrev = message.content.split(' ');
    let abbrev = findClanAbbrev[1].toLowerCase();
    let clantag;
    if (!abbrev) return await message.channel.send({ embeds: [createErrorEmbed(`Please provide the clan abbreviation after \`!check\``)] });
    const clans = await db.get(`clans`) || {};
    if (!clans) {
      await message.channel.send({ embeds: [createErrorEmbed(`Error grabbing clan data, likely no clans in server.`)] });
      return;
    }
    clantag = Object.keys(clans).find(tag => clans[tag].abbreviation === abbrev);
    if (!clantag) {
      await message.channel.send({ embeds: [createErrorEmbed(`No abbreviation in server with \`${abbrev}\``)] });
      return;
    }

    let channelMembers = await db.get(`massLinkChannels.${message.channel.id}`);
    if (!channelMembers) {
      await message.channel.send({ embeds: [createErrorEmbed(`Please only use this in a #members-X channel`)] });
      return;
    }
    let members = channelMembers.playersAdded;
    let clanData = await API.getClan(clantag);
    let membersInClan = {};
    for (const member of clanData.memberList) {
      membersInClan[member.tag] = { name: member.name, role: member.role };
    }

    let ifPlayerInClan = {};
    // Use Promise.all to fetch player data concurrently
    let playerPromises = members.map(member => API.getPlayer(member));
    let players = await Promise.all(playerPromises);

    for (let i = 0; i < members.length; i++) {
      let player = players[i];
      if (membersInClan[members[i]]) {
        ifPlayerInClan[members[i]] = { name: player.name, playertag: player.tag, inClan: true }
      }
      else {
        ifPlayerInClan[members[i]] = { name: player.name, playertag: player.tag, inClan: false }
      }
    }
    // Convert the object to an array of entries
    let sortedNames = Object.entries(ifPlayerInClan).sort((a, b) => {
      return a[1].name.localeCompare(b[1].name);
    });

    let sortedIfPlayerInClan = Object.fromEntries(sortedNames);

    let description = "";
    for (let player in sortedIfPlayerInClan) {
      let playerData = sortedIfPlayerInClan[player]
      if (playerData.inClan === true) {
        description += `[${playerData.name}](<https://royaleapi.com/player/${(playerData.playertag).substring(1)}>) ✅\n`
      }
      else {
        description += `[${playerData.name}](<https://royaleapi.com/player/${(playerData.playertag).substring(1)}>) ❌\n`
      }
    }

    console.log(description);

    let embed = new EmbedBuilder()
      .setTitle(`${clanData.name} Member Check`)
      .setThumbnail(process.env.BOT_IMAGE)
      .setColor(`Purple`)
      // .setURL(`https://royaleapi.com/clan/${clanData.tag.substring(1)}`)
      .setDescription(description);

    await message.channel.send({ embeds: [embed] })
  }
}