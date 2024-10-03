const { Events, PermissionsBitField, ChannelType, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { QuickDB } = require('quick.db');
const API = require("../../API.js");
const path = require('path');
const fs = require('fs');
const { createSuccessEmbed, createErrorEmbed, createExistEmbed } = require('../../utilities/embedUtility.js');


module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    if (message.author.bot) return;
    const member = message.guild.members.cache.get(message.author.id);
    if (!member.permissions.has(PermissionsBitField.Flags.MuteMembers)) return;
    if (!message.content.startsWith('!deletechannel') && !message.content.startsWith('!dc')) return;

    const guild = message.guild;

    const dbPath = path.join(__dirname, `../../../guildData/${message.guild.id}.sqlite`);
    const db = new QuickDB({ filePath: dbPath });

    let findDbChannel = await db.get(`massLinkChannels`);
    if (!findDbChannel) {
      await message.channel.send({ embeds: [createExistEmbed(`No channels were added yet to be deleted.`)] });
      return;
    }

    let channelToDelete = await db.get(`massLinkChannels.${message.channel.id}`);
    if (!channelToDelete) {
      await message.channel.send({ embeds: [createErrorEmbed(`You cannot delete this channel. Only for channels that look like \`#member-3\``)] });
      return;
    }

    let embed = new EmbedBuilder()
      .setTitle(`Delete Channel`)
      .setColor("Red")
      .setDescription(`Are you sure you want to delete this channel?`)
      .setFooter({ text: `0/2 needed` })

    let confirmButton = new ButtonBuilder()
      .setCustomId(`confirmDeleteChannel_${message.channel.id}`)
      .setLabel("Delete")
      .setStyle(ButtonStyle.Danger);
    await message.delete();
    const buttonRow = new ActionRowBuilder().addComponents(confirmButton);
    await message.channel.send({ embeds: [embed], components: [buttonRow] });


  }
}