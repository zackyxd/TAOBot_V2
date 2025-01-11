const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, Embed } = require("discord.js");
const path = require('path');
const Database = require('better-sqlite3');
const { QuickDB } = require("quick.db")
const fs = require('fs');
const API = require("../../API.js");
const { createSuccessEmbed, createExistEmbed, createErrorEmbed, createMaintenanceEmbed } = require('../../utilities/embedUtility.js');
const moment = require('moment-timezone');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ping-player")
    .setDescription("Set a person to be nudged or not.")
    .addUserOption((option) =>
      option.setName("user").setDescription("@user to link").setRequired(true)
    )
    .addStringOption((option) =>
      option.setName("ping")
        .setDescription("Do you want it to ping this player or not?")
        .setRequired(true)
        .addChoices(
          { name: 'Yes (only affects if they are co/leader in-game)', value: 'true' },
          { name: 'No (won\'t ever ping this player)', value: 'false' },
          { name: 'Normal pings', value: 'undefined' }
        ))
    .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers),

  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "ping-player") return;
    await interaction.deferReply();

    const user = interaction.options.getMember("user");
    let setPing = interaction.options?.getString('ping');
    const dbPath = path.join(__dirname, `../../../guildData/${interaction.guild.id}.sqlite`);
    const db = new QuickDB({ filePath: dbPath });

    let discordId = user.user.id;
    if (setPing === 'undefined') {
      await db.delete(`users.${discordId}.pingCo`);
      await interaction.editReply({ embeds: [createSuccessEmbed(`The user <@${discordId}> will now get normal pings depending on their role.`)] });
      return;
    }
    else {
      const pingValue = setPing === 'true' ? true : false;
      await db.set(`users.${discordId}.pingCo`, pingValue);
      if (pingValue === true) {
        await interaction.editReply({ embeds: [createSuccessEmbed(`The user <@${discordId}> will always get pings during nudges.`)] })
        return;
      }
      else if (pingValue === false) {
        await interaction.editReply({ embeds: [createSuccessEmbed(`The user <@${discordId}> will never receive another ping during clan nudges.`)] })
        return;
      }
      else {
        await interaction.editReply({ embeds: [createErrorEmbed(`Not sure what happened, ask Zacky.`)] })
        return;
      }
    }
  }
}