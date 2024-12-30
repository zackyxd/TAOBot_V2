const { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField, Embed } = require('discord.js')
const path = require('path')
const fs = require('fs');
const { QuickDB } = require("quick.db")
const Database = require('better-sqlite3');
const API = require("../../API.js");
const { createSuccessEmbed, createExistEmbed, createErrorEmbed, createMaintenanceEmbed } = require('../../utilities/embedUtility.js');
const buttonHandler = require("./buttonInteraction.js")
const modalHandler = require("./modalInteraction.js")


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
      await buttonHandler.handleButton(interaction);
    }

    else if (interaction.isModalSubmit()) {
      await modalHandler.handleModal(interaction);
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
