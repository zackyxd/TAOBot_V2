const {
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField
} = require('discord.js')
const path = require('path')
const fs = require('fs');
const { QuickDB } = require("quick.db")
const Database = require('better-sqlite3');
const API = require("../../API.js");
const { createSuccessEmbed, createExistEmbed, createErrorEmbed, createMaintenanceEmbed } = require('../../utilities/embedUtility.js');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    // console.log(interaction);
    if (interaction.isChatInputCommand()) {
      const command = interaction.client.commands.get(interaction.commandName)

      // Check if the server is initialized, except for the /initialize-server command
      if (interaction.commandName !== "initialize-server") {
        const isInitialized = await isServerInitialized(interaction.guild.id);
        if (!isInitialized) {
          await interaction.reply({
            embeds: [createErrorEmbed(`Server is not initialized. Please use /initialize-server first.`)],
            ephemeral: true
          });
          return;
        }
      }
      if (!command) {
        console.error(
          `No command matching ${interaction.commandName} was found.`
        )
        return
      }

      try {
        await command.execute(interaction)
      } catch (error) {
        console.error(error)
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content: 'There was an error while executing this command!',
            ephemeral: true
          })
        } else {
          await interaction.reply({
            content: 'There was an error while executing this command!',
            ephemeral: true
          })
        }
      }
    }

    else if (interaction.isButton()) {

      if (interaction.customId.startsWith(`removeLink`)) {
        await interaction.deferUpdate()
        const member = await interaction.guild.members.fetch(interaction.user.id);
        if (!member.permissions.has([PermissionsBitField.Flags.MuteMembers])) {
          await interaction.followUp({ content: `You cannot use this button, it's only allowed for coleaders`, ephemeral: true });
          return;
        }
        const parts = interaction.customId.split('_');
        const playertag = parts[1];
        const discordId = parts[2];
        const dbPath = API.findFileUpwards(__dirname, `guildData/${interaction.guild.id}.sqlite`);
        const db = new QuickDB({ filePath: dbPath });
        try {
          // Get player data (discordId);
          let playerData = await db.get(`playertags.${playertag}`);
          if (!playerData.discordId) {
            console.log("Didn't have discordId");
            return;
          }
          let discordId = playerData.discordId;
          // Remove the discordId from the player data
          delete playerData.discordId;
          // Update the player data in the database
          await db.set(`playertags.${playertag}`, playerData);


          // Get the user data and remove playertag from user's playertags list
          let userData = await db.get(`users.${discordId}`);
          if (userData && userData.playertags) {
            userData.playertags = userData.playertags.filter(tag => tag !== playertag);
            await db.set(`users.${discordId}`, userData);
          }

          let unlinked = new ButtonBuilder()
            .setCustomId('unlinked')
            .setLabel('Unlinked!')
            .setDisabled(true)
            .setStyle(ButtonStyle.Secondary);

          const unlinkedRow = new ActionRowBuilder().addComponents(unlinked);

          await interaction.message.edit({ components: [unlinkedRow] })

        } catch (error) {
          console.error('Error unlinking playertag:', error);
          await interaction.followUp({ embeds: [createErrorEmbed('An error occurred while linking the playertag. Please try again later.')] });
          return;
        }
      }


      if (interaction.customId.startsWith('switchName')) {
        await interaction.deferUpdate();
        const member = await interaction.guild.members.fetch(interaction.user.id);
        if (!member.permissions.has([PermissionsBitField.Flags.MuteMembers])) {
          await interaction.followUp({ content: `You cannot use this button, it's only allowed for coleaders`, ephemeral: true });
          return;
        }

        try {
          const parts = interaction.customId.split('_');
          console.log(parts);
          const changeNameToThis = parts[1];
          const discordId = parts[2];
          const guild = interaction.guild.id;
          const user = await interaction.guild.members.fetch(discordId);
          try {
            await user.setNickname(changeNameToThis);
          } catch (error) {
            await interaction.channel.send({ embeds: [createErrorEmbed(`Cannot change this users name.`)] });
            return;
          }

          // Update the message with the new components
          await interaction.channel.send({ embeds: [createSuccessEmbed(`Name changed to: ${changeNameToThis}`)] });

        } catch (error) {
          console.log("Couldn't change name", error);
        }


      }
    }
  }
}




async function isServerInitialized(guildId) {
  const dbPath = API.findFileUpwards(__dirname, `guildData/${guildId}.sqlite`);
  const db = new QuickDB({ filePath: dbPath });
  try {
    const isInitialized = await db.get(`guilds.${guildId}.initialized`);
    return isInitialized;
  } catch (error) {
    return false;
  }
}
