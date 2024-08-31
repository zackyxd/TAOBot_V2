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
        .setRequired(true))
    .addChannelOption(option =>
      option.setName('important-channel')
        .setDescription('Which channel should important messages be sent to?')
        .setRequired(true))
    .addRoleOption(option =>
      option.setName('role')
        .setDescription('What role is used for this clan?')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "add-clan") return;
    await interaction.deferReply();

    let clantag = interaction.options.get("clantag").value.toUpperCase();
    if (clantag.charAt(0) !== '#') clantag = '#' + clantag;
    let importantChannel = interaction.options.getChannel("important-channel");
    const roleId = interaction.options.get("role")?.value;
    const abbrev = interaction.options.get("abbreviation").value.toLowerCase();
    if (importantChannel.type !== 0) {
      await interaction.editReply({ embeds: [createErrorEmbed("Please make sure the channel is a text channel.")] });
      return;
    }

    const dbPath = API.findFileUpwards(__dirname, `guildData/${interaction.guild.id}.sqlite`);
    const db = new QuickDB({ filePath: dbPath });

    // Check if the abbreviation already exists
    const clans = await db.get(`clans`) || {};
    const existingAbbrev = Object.values(clans).find(clan => clan.abbreviation === abbrev);
    const checkOldClantag = Object.keys(clans).find(tag => clans[tag].abbreviation === abbrev);

    // console.log(`clantag: ${clantag}`);
    // console.log(`checkOldClantag: ${checkOldClantag}`);
    if (existingAbbrev) {
      const oldClantag = await db.get(`clans.${checkOldClantag}.clantag`);
      // console.log(`oldClantag: ${oldClantag}`);
      if (oldClantag !== clantag) {
        await interaction.editReply({ embeds: [createExistEmbed(`The abbreviation \`${abbrev}\` is already in use by another clan.`)] });
        return;
      }
    }

    // Get PlayerData.json, if error return error, else link player.
    let crClan = await API.getClan(clantag);
    if (crClan.data) {
      await interaction.editReply({ embeds: [crClan] });
      return;
    }

    try {
      // let clantagLink = await db.get(`clans.${clantag}`);
      // if (clantagLink) {
      //   await interaction.editReply({ embeds: [createExistEmbed(`The clan \`${crClan.name}\` is already linked to this server.`)] });
      //   return;
      // }

      await db.set(`clans.${clantag}`, {
        clanName: crClan.name,
        clantag: clantag,
        abbreviation: abbrev,
        roleId: roleId || '',
        importantChannel: importantChannel.id,
      })

      let clanRace = await API.getCurrentRiverRace(clantag);
      let currentDay = -1;
      if (clanRace && clanRace.periodType && clanRace.periodIndex) {
        if (clanRace.periodType === 'warDay' || 'colosseum') {
          currentDay = (clanRace.periodIndex % 7) - 2;
        }
      }
      clanRace.warDay = currentDay;
      await db.set(`raceDataAttacks.${clantag}`, clanRace);
      await db.set(`raceDataScore.${clantag}`, clanRace);

      let clanInfo = await API.getClan(clantag);
      await db.set(`clanData.${clantag}`, clanInfo);


      if (roleId) {
        await interaction.editReply({
          embeds: [createSuccessEmbed(`Successfully linked ${crClan.name} to the server with the abbreviation \`${abbrev}\`\n
          Any important information will be pasted to <#${importantChannel.id}>\n
          With the role <@&${roleId}>`)]
        })
      }
      else {
        await interaction.editReply({
          embeds: [createSuccessEmbed(`Successfully linked ${crClan.name} to the server with the abbreviation \`${abbrev}\`\n
          Any important information will be pasted to <#${importantChannel.id}>`)]
        })
      }

    } catch (error) {
      console.error('Error creating clan:', error);
      await interaction.editReply({ embeds: [createErrorEmbed('An error occurred while linking the playertag. Please try again later.')] });
      return;
    }


  }
};

