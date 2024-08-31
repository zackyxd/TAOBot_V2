const { EmbedBuilder } = require('discord.js');

function createSuccessEmbed(message) {
  return new EmbedBuilder()
    .setColor('#00FF00') // Green color for success
    .setDescription(`**${message}**`) // Make the message bold
}

function createExistEmbed(message) {
  return new EmbedBuilder()
    .setColor('#EEFF01') // Yellow color for something existing
    .setDescription(`**${message}**`) // Make the message bold
}

function createErrorEmbed(message) {
  return new EmbedBuilder()
    .setColor('#FF0000') // Red color for error
    .setDescription(`**${message}**`) // Make the message bold
}

function createMaintenanceEmbed() {
  return new EmbedBuilder()
    .setColor('#FE9900') // Orange color for Maintenance
    .setDescription(`**Clash Royale is currently on Maintenance Break.**`) // Make the message bold
}

module.exports = { createSuccessEmbed, createExistEmbed, createErrorEmbed, createMaintenanceEmbed };