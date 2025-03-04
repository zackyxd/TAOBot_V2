const API = require("../../API.js");
const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, Embed } = require("discord.js");
const path = require('path');
const Database = require('better-sqlite3');
const { QuickDB } = require("quick.db")
const fs = require('fs');
const { createSuccessEmbed, createExistEmbed, createErrorEmbed, createMaintenanceEmbed } = require('../../utilities/embedUtility.js');


module.exports = {
  data: new SlashCommandBuilder()
    .setName("set-clan-invites-channel")
    .setDescription("Set the channel that clan invites will be posted to")
    .addChannelOption(option =>
      option.setName("channel")
        .setDescription("Channel to post invites to")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "set-clan-invites-channel") return;
    await interaction.deferReply();
    let channel = interaction.options.getChannel("channel");
    if (channel.type !== 0) {
      await interaction.editReply({ embeds: [createErrorEmbed("Please make sure the channel is a text channel.")] });
      return;
    }


    const dbPath = API.findFileUpwards(__dirname, `guildData/${interaction.guild.id}.sqlite`);
    const db = new QuickDB({ filePath: dbPath });
    await db.set(`guilds.${interaction.guild.id}.clanInvitesChannel`, channel.id);

    await interaction.editReply({ embeds: [createSuccessEmbed(`You can now paste clan invites to <#${channel.id}>`)] })
    return;

  }
}