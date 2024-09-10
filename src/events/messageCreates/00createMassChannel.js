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
    if (!message.content.startsWith('!createchannel')) return;

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
      parent: "1283051581834530978", // category id
      permissionOverwrites: [
        {
          id: guild.id, // The ID of the guild (everyone)
          deny: ['ViewChannel', 'SendMessages'], // Deny view channel permission for everyone
        },
        ...mentionedUsers.map(user => ({
          id: user.id, // The ID of the mentioned user
          allow: ['ViewChannel', 'SendMessages'], // Allow view channel permission for the mentioned user
        })),
      ],
    });

    await message.channel.send({ embeds: [createSuccessEmbed(`Created <#${channel.id}> and the pinged users can now view the channel.`)] });
    const mentions = mentionedUsers.map(user => `<@${user.id}>`).join(' ');
    await channel.send(`Attention: ${mentions}\nCreated by <@${message.author.id}>`);
    await db.set(`massLinkChannels.${channel.id}`, {
      "channelId": channel.id,
      "users": []
    });
  }
}
