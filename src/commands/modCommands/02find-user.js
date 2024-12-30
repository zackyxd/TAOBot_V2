const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder, EmbedBuilder, ActionRowBuilder, Embed, ButtonBuilder, ButtonStyle } = require("discord.js");
const path = require('path');
const Database = require('better-sqlite3');
const { QuickDB } = require("quick.db")
const fs = require('fs');
const API = require("../../API.js");
const { createSuccessEmbed, createExistEmbed, createErrorEmbed, createMaintenanceEmbed } = require('../../utilities/embedUtility.js');




module.exports = {
  data: new SlashCommandBuilder()
    .setName("find-user")
    .setDescription("Show who is linked to a specific playertag if available")
    .addStringOption(option =>
      option.setName("playertag")
        .setDescription("What is the playertag you are searching for?")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers),

  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "find-user") return;
    await interaction.deferReply({ ephemeral: true });


    let playertag = interaction.options.get("playertag").value.toUpperCase();
    if (playertag.charAt(0) !== "#") {
      playertag = "#" + playertag;
    }


    const dbPath = path.join(__dirname, `../../../guildData/${interaction.guild.id}.sqlite`);
    const db = new QuickDB({ filePath: dbPath });


    let findAccountLinked = await db.get(`playertags.${playertag}.discordId`);

    if (!findAccountLinked) {
      interaction.editReply({ embeds: [createErrorEmbed(`There is no user linked to this playertag \`${playertag}\`.`)] });
      return;
    }

    try {
      const user = await interaction.client.users.fetch(findAccountLinked);
      const member = await interaction.guild.members.fetch(findAccountLinked);
      const name = member.nickname || user.username;
      interaction.editReply({ embeds: [createSuccessEmbed(`<@${findAccountLinked}> (@${name}) has this playertag.`)] })
    } catch (error) {
      console.error(`Error fetching user info: ${error}`);
      interaction.editReply({ embeds: [createErrorEmbed(`There was an error fetching the user info.`)] });
    }




  }
}