const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const Database = require('better-sqlite3');
const { QuickDB } = require("quick.db")
const path = require('path');
const { createSuccessEmbed, createExistEmbed, createErrorEmbed, createMaintenanceEmbed } = require('../../utilities/embedUtility.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("initialize-server")
    .setDescription("Initalize your server to start saving data. Just run this command.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageServer),

  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;
    if (!interaction.commandName === 'initalize-server') return;
    await interaction.deferReply();

    const dbPath = path.join(__dirname, `../../../guildData/${interaction.guild.id}.sqlite`);
    const db = new QuickDB({ filePath: dbPath });

    const guildInitialized = await db.get(`guilds.${interaction.guild.id}.initialized`);
    await interaction.guild.members.fetch();
    if (guildInitialized) {
      await interaction.editReply({ embeds: [createExistEmbed("Server is already initialized.")] });
    }
    else {
      await db.set(`guilds.${interaction.guild.id}`, {
        initialized: true,
        guildName: interaction.guild.name,
        clans: {},
        clanInvitesChannel: '',
        errorsChannel: ''
      })

      await interaction.editReply({ embeds: [createSuccessEmbed("Server successfully initialized!")] })
    }
    return;
  }
}
