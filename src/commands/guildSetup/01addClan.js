const API = require("../../API.js");
const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, Embed } = require("discord.js");
const path = require('path');
const Database = require('better-sqlite3');
const { QuickDB } = require("quick.db")
const fs = require('fs');
const { createSuccessEmbed, createExistEmbed, createErrorEmbed, createMaintenanceEmbed } = require('../../utilities/embedUtility.js');



module.exports = {
  data: new SlashCommandBuilder()
    .setName("add-clan")
    .setDescription("Add a clan to your server.")
    .addStringOption(option =>
      option.setName("abbreviation")
        .setDescription("What is the abbreviation you want to use for this clan?")
        .setRequired(true))
    .addStringOption(option =>
      option.setName("clantag")
        .setDescription("What is the clantag for your clan?")
        .setRequired(false))
    .addChannelOption(option =>
      option.setName('important-channel')
        .setDescription('Which channel should important messages be sent to?')
        .setRequired(false))
    .addChannelOption(option =>
      option.setName("members-channel")
        .setDescription("Which channel is used for members of this clan?")
        .setRequired(false))
    .addRoleOption(option =>
      option.setName('role')
        .setDescription('What role is used for this clan?')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "add-clan") return;
    await interaction.deferReply();

    let clantag = interaction.options.get("clantag")?.value.toUpperCase();
    if (clantag && clantag.charAt(0) !== '#') clantag = '#' + clantag;
    let importantChannel = interaction.options?.getChannel("important-channel");
    const roleId = interaction.options.get("role")?.value;
    const abbrev = interaction.options.get("abbreviation").value.toLowerCase();
    const membersChannel = interaction.options?.getChannel("members-channel");
    if (importantChannel && importantChannel.type !== 0) {
      await interaction.editReply({ embeds: [createErrorEmbed("Please make sure the channel is a text channel.")] });
      return;
    }


    const dbPath = API.findFileUpwards(__dirname, `guildData/${interaction.guild.id}.sqlite`);
    const db = new QuickDB({ filePath: dbPath });

    // Check if the abbreviation already exists
    const clans = await db.get(`clans`) || {};
    const existingAbbrev = Object.values(clans).find(clan => clan.abbreviation === abbrev); // find abbreviation if it exists
    const checkOldClantag = Object.keys(clans).find(tag => clans[tag].abbreviation === abbrev); // get the clantag of the abbreviation

    if (existingAbbrev) {
      const oldClantag = await db.get(`clans.${checkOldClantag}.clantag`);
      // console.log(`oldClantag: ${oldClantag}`);
      if (clantag && oldClantag !== clantag) {
        await interaction.editReply({ embeds: [createExistEmbed(`The abbreviation \`${abbrev}\` is already in use by another clan.`)] });
        return;
      }
      // If previously existing abbreviation, just update the new values given.
      let clanData = await db.get(`clans.${checkOldClantag}`)
      if (roleId) clanData.roleId = roleId;
      if (importantChannel) clanData.importantChannel = importantChannel.id;
      if (membersChannel) clanData.membersChannel = membersChannel.id;

      clans[oldClantag] = clanData;
      await db.set(`clans`, clans);


      let successMessage = `Successfully linked ${clanData.clanName} to the server with the abbreviation \`${abbrev}\``;
      if (importantChannel) successMessage += `\nAny important information will be posted to <#${importantChannel.id}>`;
      if (membersChannel) successMessage += `\nMember updates will be posted to <#${membersChannel.id}>`;
      if (roleId) successMessage += `\nWith the role <@&${roleId}>`;
      await interaction.editReply({
        embeds: [createSuccessEmbed(successMessage)]
      });
      return;
    }

    if (!clantag || !importantChannel) {
      await interaction.editReply({ embeds: [createErrorEmbed`Please make sure you fill out the clantag and important channel for new clans.`] })
      return;
    }

    // Get PlayerData.json, if error return error, else link player.
    let crClan = await API.getClan(clantag);
    if (crClan.data) {
      await interaction.editReply({ embeds: [crClan] });
      return;
    }

    try {

      await db.set(`clans.${clantag}`, {
        clanName: crClan.name,
        clantag: clantag,
        abbreviation: abbrev,
        roleId: roleId || '',
        importantChannel: importantChannel.id,
      })


      if (roleId) {
        await interaction.editReply({
          embeds: [createSuccessEmbed(`Successfully linked ${crClan.name} to the server with the abbreviation \`${abbrev}\`\nAny important information will be pasted to <#${importantChannel.id}>\nWith the role <@&${roleId}>`)]
        })
      }
      else {
        await interaction.editReply({
          embeds: [createSuccessEmbed(`Successfully linked ${crClan.name} to the server with the abbreviation \`${abbrev}\`\nAny important information will be pasted to <#${importantChannel.id}>`)]
        })
      }

    } catch (error) {
      console.error('Error creating clan:', error);
      await interaction.editReply({ embeds: [createErrorEmbed('An error occurred while linking the playertag. Please try again later.')] });
      return;
    }


  }
};

