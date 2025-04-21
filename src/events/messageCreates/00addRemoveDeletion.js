const { Events, PermissionsBitField, ChannelType, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { QuickDB } = require('quick.db');
const API = require("../../API.js");
const path = require('path');
const fs = require('fs');
const { createSuccessEmbed, createErrorEmbed, createExistEmbed } = require('../../utilities/embedUtility.js');
const { channel } = require('diagnostics_channel');


module.exports = {
  name: Events.MessageCreate,
  // eventKey: 'disable',
  async execute(message) {
    if (message.author.bot) return;
    const member = message.guild.members.cache.get(message.author.id);
    if (!member.permissions.has(PermissionsBitField.Flags.MuteMembers)) return;
    if (!message.content.startsWith('!zacky')) return;
    const guild = message.guild;

    const dbPath = path.join(__dirname, `../../../guildData/${message.guild.id}.sqlite`);
    const db = new QuickDB({ filePath: dbPath });

    let findDbChannel = await db.get(`massLinkChannels`);
    if (!findDbChannel) {
      await message.channel.send({ embeds: [createExistEmbed(`No channels were added yet to be affected.`)] });
      return;
    }

    let channelToDelete = await db.get(`massLinkChannels.${message.channel.id}`);
    if (!channelToDelete) {
      await message.channel.send({ embeds: [createErrorEmbed(`You cannot delete this channel.`)] });
      return;
    }

    let firstWord = message.content.split(' ')[1];
    channelToDelete.zacky = firstWord === "remove" ? true : firstWord === "add" ? false : false
    let description = firstWord === "remove" ? `You cannot delete this channel using the normal commands anymore.` : firstWord === "add" ? `You can now delete this channel using the normal commands again.` : null;
    let color = firstWord === "remove" ? `Orange` : firstWord === "add" ? `Green` : null;
    await db.set(`massLinkChannels.${message.channel.id}`, channelToDelete);

    if (!description) return;
    let embed = new EmbedBuilder()
      .setColor(color)
      .setDescription(description)

    await message.delete();
    await message.channel.send({ embeds: [embed] });


  }
}