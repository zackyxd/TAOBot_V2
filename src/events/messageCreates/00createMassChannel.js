const { Events, PermissionsBitField, ChannelType } = require('discord.js');
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
    if (!message.content.startsWith('!createchannel') && !message.content.startsWith('!cc')) return;

    const guild = message.guild;
    const mentionedUsers = message.mentions.users;

    if (mentionedUsers.size === 0) {
      return message.channel.send({ embeds: [createErrorEmbed("Make sure to mention the users you want to add.")] });
    }

    const dbPath = path.join(__dirname, `../../../guildData/${message.guild.id}.sqlite`);
    const db = new QuickDB({ filePath: dbPath });

    let getChannels = await db.get(`massLinkChannels`);
    if (!getChannels) {
      await db.set(`massLinkChannels`, {
        "count": 0,
      })
    }

    let count = await db.get(`massLinkChannels.count`);
    count++;
    await db.set(`massLinkChannels.count`, count);


    const channel = await guild.channels.create({
      name: `members-${count}`, // Ensure the name field is defined
      type: ChannelType.GuildText,
      // parent: '1182482429810847807', // my guild category id
      parent: "1283051581834530978", // TAO category id
      permissionOverwrites: null, // Inherit permissions from the category
    });


    let linkedAccounts = [];
    // Add specific permission overwrites for mentioned users
    for (const user of mentionedUsers.values()) {

      let findLinkedAccounts = await db.get(`users.${user.id}`);
      let playertags = findLinkedAccounts?.playertags;
      if (!playertags) continue;
      linkedAccounts = [...linkedAccounts, ...playertags]


      await channel.permissionOverwrites.create(user, {
        ViewChannel: true,
        SendMessages: true,
      });
    }


    let allUsersHaveAccess;
    do {
      allUsersHaveAccess = true;
      for (const user of mentionedUsers.values()) {
        if (!channel.permissionsFor(user).has(PermissionsBitField.Flags.ViewChannel)) {
          await channel.permissionOverwrites.create(user, {
            ViewChannel: true,
            SendMessages: true,
          });
          allUsersHaveAccess = false;
        }
      }
    } while (!allUsersHaveAccess);
    console.log("Confirmed everyone has access");


    if (mentionedUsers.size === 1) {
      await message.channel.send({ embeds: [createSuccessEmbed(`Created <#${channel.id}> with ${mentionedUsers.size} member.\n-# Please check the channel above if you were pinged.`)] });
    }
    else {
      await message.channel.send({ embeds: [createSuccessEmbed(`Created <#${channel.id}> with ${mentionedUsers.size} members.\n-# Please check the channel above if you were pinged.`)] });
    }

    const mentions = mentionedUsers.map(user => `<@${user.id}>`).join(' ');
    await channel.send(`Attention: ${mentions}\nCreated by <@${message.author.id}>`);
    await db.set(`massLinkChannels.${channel.id}`, {
      "channelId": channel.id,
      "users": [],
      "playersAdded": linkedAccounts
    });
  }
}
