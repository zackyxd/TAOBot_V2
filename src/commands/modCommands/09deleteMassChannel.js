const API = require("../../API.js");
const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, Embed, ChannelType, PermissionsBitField } = require("discord.js");
const path = require('path');
const Database = require('better-sqlite3');
const { QuickDB } = require("quick.db")
const fs = require('fs');
const { createSuccessEmbed, createExistEmbed, createErrorEmbed, createMaintenanceEmbed } = require('../../utilities/embedUtility.js');


module.exports = {
  data: new SlashCommandBuilder()
    .setName("deletechannel")
    .setDescription("Delete a mass-member channel. Requires two people to confirm.")
    .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers),

  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "deletechannel") return;
    await interaction.deferReply();


    const guild = interaction.guild;
    const dbPath = path.join(__dirname, `../../../guildData/${interaction.guild.id}.sqlite`);
    const db = new QuickDB({ filePath: dbPath });

    let findDbChannel = await db.get(`massLinkChannels`);
    if (!findDbChannel) {
      await interaction.editReply({ embeds: [createExistEmbed(`No channels were added yet to be deleted.`)] });
      return;
    }


    let channelToDelete = await db.get(`massLinkChannels.${interaction.channel.id}`);
    if (!channelToDelete) {
      await interaction.editReply({ embeds: [createErrorEmbed(`This command can only delete #member-movement channels.`)] });
      return;
    }

    if (channelToDelete && channelToDelete.zacky === true) {
      await interaction.editReply({ embeds: [createErrorEmbed(`This channel has been Zackified, you cannot delete it with this command. `)] });
      return;
    }

    let embed = new EmbedBuilder()
      .setTitle(`Delete Channel`)
      .setColor("Red")
      .setDescription(`Are you sure you want to delete this channel?`)
      .setFooter({ text: `0/2 needed` })

    let confirmButton = new ButtonBuilder()
      .setCustomId(`confirmDeleteChannel_${interaction.channel.id}`)
      .setLabel("Delete")
      .setStyle(ButtonStyle.Danger);
    const buttonRow = new ActionRowBuilder().addComponents(confirmButton);
    await interaction.editReply({ embeds: [embed], components: [buttonRow] });


  }


}