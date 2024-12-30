const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require("discord.js");
const path = require('path');
const Database = require('better-sqlite3');
const { QuickDB } = require("quick.db")
const fs = require('fs');
const API = require("../../API.js");
const { createSuccessEmbed, createExistEmbed, createErrorEmbed, createMaintenanceEmbed } = require('../../utilities/embedUtility.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("modal-players")
    .setDescription("Send the modal to request players to link themselves")
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('Optional channel to post players who linked themselves')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== 'modal-players') return;
    await interaction.deferReply({ ephemeral: true });
    let postChannel = interaction.options?.getChannel("channel");
    if (postChannel && postChannel.type !== 0) {
      await interaction.editReply({ embeds: [createErrorEmbed("Please make sure the channel is a text channel.")] });
      return;
    }
    const dbPath = API.findFileUpwards(__dirname, `guildData/${interaction.guild.id}.sqlite`);
    const db = new QuickDB({ filePath: dbPath, timeout: 5000 });
    const clans = await db.get(`guilds`);
    if (!clans) return;
    const guildData = await db.get(`guilds.${interaction.guild.id}`);
    if (postChannel) {
      guildData.modalLinkChannel = postChannel.id;
    }
    else {
      guildData.modalLinkChannel = ''; // no channel
    }

    const buttonRow = new ActionRowBuilder()
      .addComponents(new ButtonBuilder()
        .setCustomId("openModal")
        .setLabel('Link here!')
        .setStyle(ButtonStyle.Primary))

    let embed = new EmbedBuilder()
      .setTitle("Link your Clash Royale Account Here")
      .setColor("Purple")
      .setFooter({ text: "You must have the required password to do so." })
    await interaction.channel.send({ embeds: [embed], components: [buttonRow] });
    await interaction.editReply({ embeds: [createSuccessEmbed(`Users can now link themselves. If there is a global role set, they will receive it.${postChannel ? `\nPosting to the channel <#${postChannel.id}>` : ''}`)] });
    await db.set(`guilds.${interaction.guild.id}`, guildData);
  }
}