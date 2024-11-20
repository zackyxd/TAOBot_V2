const API = require("../../API.js");
const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, Embed, ChannelType, PermissionsBitField } = require("discord.js");
const path = require('path');
const Database = require('better-sqlite3');
const { QuickDB } = require("quick.db")
const fs = require('fs');
const { createSuccessEmbed, createExistEmbed, createErrorEmbed, createMaintenanceEmbed } = require('../../utilities/embedUtility.js');


module.exports = {
  data: new SlashCommandBuilder()
    .setName("remove-member")
    .setDescription("Remove a user to a member channel. You must use this in the channel.")
    .addUserOption(option =>
      option.setName("user")
        .setDescription("Please @ the player to remove from this member channel.")
        .setRequired(true)
    )
    // .addChannelOption(option =>
    //   option.setName("channel")
    //     .setDescription("Please put the #member-channel you want to add this person to.")
    //     .setRequired(true)
    // )
    .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers),

  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "remove-member") return;

    await interaction.deferReply({ ephemeral: true });
    let user = interaction.options.getMember("user");
    let userId = user.id;
    // let channel = interaction.options.getChannel("channel");

    // if (channel.type !== 0) {
    //   await interaction.editReply({ embeds: [createErrorEmbed("Please make sure the channel is a text channel.")] });
    //   return;
    // }

    const guild = interaction.guild;
    const dbPath = path.join(__dirname, `../../../guildData/${interaction.guild.id}.sqlite`);
    const db = new QuickDB({ filePath: dbPath });

    let validChannelForMember = await db.get(`massLinkChannels.${interaction.channel.id}.channelId`);
    if (!validChannelForMember) {
      await interaction.editReply({ embeds: [createErrorEmbed(`You cannot remove this member from this channel.\nIt was not a #members channel`)] });
      return;
    }

    let getChannels = await db.get(`massLinkChannels`);
    if (!getChannels) {
      await interaction.editReply({ embeds: [createErrorEmbed("There were no channels created yet.")] });
      return;
    }

    let findLinkedAccounts = await db.get(`users.${userId}`);
    let playertags = findLinkedAccounts?.playertags;

    let channelIdToRemove = await db.get(`massLinkChannels.${interaction.channel.id}.channelId`);
    if (!channelIdToRemove) {
      await interaction.editReply({ embeds: [createErrorEmbed(`Please contact @Zacky if you received this message.`)] });
      return;
    }

    let channelToRemoveMemberFrom = await interaction.guild.channels.cache.get(channelIdToRemove);
    // Check if the user had access to the channel 
    if (!channelToRemoveMemberFrom.permissionsFor(user).has(PermissionsBitField.Flags.ViewChannel)) {
      await interaction.editReply({ embeds: [createExistEmbed(`<@${userId}> did not have access to this channel.`)] });
      return;
    }

    // Remove user's permissions in the channel
    await channelToRemoveMemberFrom.permissionOverwrites.delete(user);

    let roleId = await db.get(`massLinkChannels.${interaction.channel.id}.roleId`);

    // if (roleId) {
    //   let member = interaction.guild.members.cache.get(userId);
    //   if (member && member.roles.cache.has(roleId)) {
    //     await member.roles.remove(roleId);
    //   }
    // }

    // Fetch the existing playersAdded array
    let currentPlayersAdded = await db.get(`massLinkChannels.${interaction.channel.id}.playersAdded`) || [];

    // Remove the user's playertags from the playersAdded array
    let updatedPlayersAdded = currentPlayersAdded.filter(tag => !playertags.includes(tag));

    // Save the updated playersAdded array back to the database
    await db.set(`massLinkChannels.${interaction.channel.id}.playersAdded`, updatedPlayersAdded);

    let description = `Removed <@${userId}> from this channel.`;
    if (roleId) {
      description += `\nThey received the role <@&${roleId}> when they were added to this channel.\nRemove it if necessary.`;
    }


    await channelToRemoveMemberFrom.send({ embeds: [createSuccessEmbed(description)] });
    await interaction.editReply({ embeds: [createSuccessEmbed(`Successfully removed <@${userId}> from this channel.`)] })
  }

}