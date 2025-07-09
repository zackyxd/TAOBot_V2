const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, Embed, PermissionsBitField } = require("discord.js");
const path = require('path');
const Database = require('better-sqlite3');
const { QuickDB } = require("quick.db")
const fs = require('fs');
const API = require("../../API.js");
const { createSuccessEmbed, createExistEmbed, createErrorEmbed, createMaintenanceEmbed } = require('../../utilities/embedUtility.js');
const moment = require('moment-timezone');


module.exports = {
  data: new SlashCommandBuilder()
    .setName("force-replace-me")
    .setDescription("Set someone to as if they pinged replace-me")
    .addUserOption((option) =>
      option.setName("user").setDescription("@user to link").setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers),

  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "force-replace-me") return;
    await interaction.deferReply();

    const user = interaction.options.getMember("user");
    const dbPath = path.join(__dirname, `../../../guildData/${interaction.guild.id}.sqlite`);
    const db = new QuickDB({ filePath: dbPath });

    let discordId = user.user.id;

    try {
      const userPlayerTags = await db.get(`users.${discordId}.playertags`) || [];
      for (const playertag of userPlayerTags) {
        let checkPlayer = await API.getPlayer(playertag);
        const clanData = await db.get(`clans.${checkPlayer?.clan?.tag}`);
        if (clanData && (await db.get(`users.${discordId}.replace-me`) === false || await db.get(`users.${discordId}.replace-me`) === undefined)) {
          const importantChannel = interaction.guild.channels.cache.get(clanData.importantChannel);
          if (importantChannel && !(user.permissions.has([PermissionsBitField.Flags.MuteMembers]))) {
            await importantChannel.send({ embeds: [createErrorEmbed(`⚠️ <@${discordId}> (${checkPlayer.name}) asked to be replaced.`)] });
            continue;
          }
        }

        if (!clanData && (await db.get(`users.${discordId}.replace-me`) === false || await db.get(`users.${discordId}.replace-me`) === undefined)) {
          let checkPlayerBattleLog = await API.getPlayerBattleHistory(playertag);
          const processedClans = new Set();
          for (const battle of checkPlayerBattleLog) {
            if (battle.team && battle.team.length > 0 && battle.gameMode.name !== "TeamVsTeam") {
              for (const player of battle.team) {
                if (player.clan && player.clan.tag && !processedClans.has(player.clan.tag)) {
                  processedClans.add(player.clan.tag);
                  const clanData = await db.get(`clans.${player.clan.tag}`);
                  if (clanData && clanData.importantChannel) {
                    const importantChannel = interaction.guild.channels.cache.get(clanData.importantChannel);
                    if (importantChannel) {
                      if (!user.permissions.has([PermissionsBitField.Flags.MuteMembers])) {
                        await importantChannel.send({ embeds: [createErrorEmbed(`⚠️ <@${discordId}> (${player.name}) asked to be replaced.`)] });
                        continue; // Exit the loop and stop further execution inside the battle log processing
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("Couldn't set replace-me", error);
    }


    await db.set(`users.${discordId}.replace-me`, true);
    await interaction.editReply({ embeds: [createSuccessEmbed(`Successfully made the user <@${discordId}> replace me.`)] });
  }
}