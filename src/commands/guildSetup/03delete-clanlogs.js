const API = require("../../API.js");
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const { QuickDB } = require("quick.db");
const { createSuccessEmbed, createErrorEmbed } = require('../../utilities/embedUtility.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("delete-clanlogs")
    .setDescription("Remove the channel for this clan's log")
    .addStringOption(option =>
      option.setName("abbreviation")
        .setDescription("Abbreviation of the clan to remove log channel")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "delete-clanlogs") return;
    await interaction.deferReply();
    let abbrev = interaction.options.get("abbreviation").value.toLowerCase();

    const dbPath = API.findFileUpwards(__dirname, `guildData/${interaction.guild.id}.sqlite`);
    const db = new QuickDB({ filePath: dbPath });
    // Check if the abbreviation already exists
    const clans = await db.get(`clans`) || {};
    if (!clans) {
      await interaction.editReply({ embeds: [createErrorEmbed(`The abbreviation \`${abbrev}\` was not found linked to the server.`)] });
      return;
    }
    const clantag = Object.keys(clans).find(tag => clans[tag].abbreviation === abbrev);

    if (!clantag) {
      await interaction.editReply({ embeds: [createErrorEmbed(`The abbreviation \`${abbrev}\` is not linked to the server.`)] });
      return;
    }

    await db.delete(`clans.${clantag}.clanlogsChannel`);
    await interaction.editReply({ embeds: [createSuccessEmbed(`Clan logs channel for \`${abbrev}\` has been removed.`)] });
    return;
  }
}
