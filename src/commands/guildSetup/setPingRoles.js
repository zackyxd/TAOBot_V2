const API = require("../../API.js");
const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, Embed } = require("discord.js");
const path = require('path');
const Database = require('better-sqlite3');
const { QuickDB } = require("quick.db")
const fs = require('fs');
const { createSuccessEmbed, createExistEmbed, createErrorEmbed, createMaintenanceEmbed } = require('../../utilities/embedUtility.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("set-ping-role")
    .setDescription("Set which role will be pinged by the players for Attacking Late and Replace Me")

    .addSubcommand((subcommand) =>
      subcommand
        .setName("attacking-late")
        .setDescription("Select the role that is used for Attacking Late")
        .addRoleOption(option =>
          option.setName("role-to-ping")
            .setDescription("Which role will be pinged?")
            .setRequired(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("replace-me")
        .setDescription("Select the role that is used for Replace Me")
        .addRoleOption(option =>
          option.setName("role-to-ping")
            .setDescription("Which role will be pinged?")
            .setRequired(true))
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;
    if (!interaction.commandName === 'set-ping-role') return;
    await interaction.deferReply();
    let subcommand = interaction.options.getSubcommand();
    console.log(subcommand);
    const dbPath = API.findFileUpwards(__dirname, `guildData/${interaction.guild.id}.sqlite`);
    const db = new QuickDB({ filePath: dbPath });

    switch (subcommand) {
      case "attacking-late": {
        const role = interaction.options.getRole("role-to-ping");
        await db.set(`guilds.${interaction.guild.id}.attacking-late`, role.id);
        await interaction.editReply({ embeds: [createSuccessEmbed(`The <@&${role.id}> role will be used for Attacking Late.`)] });
        break;
      }

      case "replace-me": {
        const role = interaction.options.getRole("role-to-ping");
        await db.set(`guilds.${interaction.guild.id}.replace-me`, role.id);
        await interaction.editReply({ embeds: [createSuccessEmbed(`The <@&${role.id}> role will be used for Replace Me.`)] });
        break;
      }
    }


    return;
  }
}
