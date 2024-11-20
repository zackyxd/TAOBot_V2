const API = require("../../API.js");
const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, Embed } = require("discord.js");
const path = require('path');
const Database = require('better-sqlite3');
const { QuickDB } = require("quick.db")
const fs = require('fs');
const { createSuccessEmbed, createExistEmbed, createErrorEmbed, createMaintenanceEmbed } = require('../../utilities/embedUtility.js');


module.exports = {
  data: new SlashCommandBuilder()
    .setName("set-global-role")
    .setDescription("Set the role that is needed for every member.")
    .addRoleOption(option =>
      option.setName("role")
        .setDescription("Role that members must have")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageServer),

  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "set-global-role") return;
    await interaction.deferReply();
    const role = interaction.options.getRole("role");


    const dbPath = API.findFileUpwards(__dirname, `guildData/${interaction.guild.id}.sqlite`);
    const db = new QuickDB({ filePath: dbPath });
    await db.set(`guilds.${interaction.guild.id}.globalRole`, role.id);

    await interaction.editReply({ embeds: [createSuccessEmbed(`The global role is now <@&${role.id}>`)] })
    return;

  }
}