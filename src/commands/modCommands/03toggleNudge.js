const API = require("../../API.js");
const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, Embed } = require("discord.js");
const path = require('path');
const Database = require('better-sqlite3');
const { QuickDB } = require("quick.db")
const fs = require('fs');
const { createSuccessEmbed, createExistEmbed, createErrorEmbed, createMaintenanceEmbed } = require('../../utilities/embedUtility.js');


module.exports = {
  data: new SlashCommandBuilder()
    .setName("toggle-autonudge")
    .setDescription("Toggle autonudge on or off, just provide the abbreviation")
    .addStringOption(option =>
      option.setName("abbreviation")
        .setDescription("Abbreviation of the clan to nudge")
        .setRequired(true)
    )
    .addChannelOption(option =>
      option.setName("channel")
        .setDescription("Channel these logs will go to")
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers),

  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "toggle-autonudge") return;
    await interaction.deferReply();
    let abbrev = interaction.options.get("abbreviation").value.toLowerCase();
    let channel = interaction.options.getChannel("channel");
    if (channel && channel.type !== 0) {
      await interaction.editReply({ embeds: [createErrorEmbed("Please make sure the channel is a text channel.")] });
      return;
    }

    const dbPath = API.findFileUpwards(__dirname, `guildData/${interaction.guild.id}.sqlite`);
    const db = new QuickDB({ filePath: dbPath });
    const clans = await db.get(`clans`) || {};
    if (!clans) {
      await interaction.editReply({ embeds: [createErrorEmbed(`Error grabbing clan data.`)] });
      return;
    }
    const clantag = Object.keys(clans).find(tag => clans[tag].abbreviation === abbrev);

    if (!clantag) {
      await interaction.editReply({ embeds: [createErrorEmbed(`The abbreviation \`${abbrev}\` is not linked to the server.`)] });
      return;
    }

    let clan = await db.get(`clans.${clantag}`);
    if (!clan) {
      await interaction.editReply({ embeds: [createErrorEmbed(`Error grabbing clan data for ${clan}, contact Zacky`)] });
      return;
    }

    if (!clan.nudgeSettings) {
      clan.nudgeSettings = { enabled: true, lastNudged: null, nudgeChannel: null, customMessage: "" };
    } else {
      clan.nudgeSettings = { ...clan.nudgeSettings, enabled: !clan.nudgeSettings.enabled };
    }

    if (channel) {
      clan.nudgeSettings.nudgeChannel = channel.id;
    }

    await db.set(`clans.${clantag}`, clan);

    const status = clan.nudgeSettings.enabled ? "on" : "off";
    let replyMessage = `Autonudge for ${clan.clanName} turned __${status}.__\n`;
    if (!clan.nudgeSettings.nudgeChannel) {
      replyMessage += `No nudge channel is set. Please provide a channel to post auto nudges.`;
    }
    else {
      replyMessage += `Posting to <#${clan.nudgeSettings.nudgeChannel}>`
    }
    await interaction.editReply({ embeds: [createSuccessEmbed(replyMessage)] })

  }
}