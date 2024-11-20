const API = require("../../API.js");
const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, Embed, ChannelType, PermissionsBitField } = require("discord.js");
const path = require('path');
const Database = require('better-sqlite3');
const { QuickDB } = require("quick.db")
const fs = require('fs');
const { createSuccessEmbed, createExistEmbed, createErrorEmbed, createMaintenanceEmbed } = require('../../utilities/embedUtility.js');


module.exports = {
  data: new SlashCommandBuilder()
    .setName("add-member")
    .setDescription("Add a user to a member channel.")
    .addUserOption(option =>
      option.setName("user")
        .setDescription("Please @ the player to add to a member channel.")
        .setRequired(true)
    )
    .addChannelOption(option =>
      option.setName("channel")
        .setDescription("Please put the #member-channel you want to add this person to.")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers),

  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "add-member") return;
    await interaction.deferReply({ ephemeral: true });
    let user = interaction.options.getMember("user"); // gets full user
    let userId = user.id;
    let channel = interaction.options.getChannel("channel");
    if (channel.type !== 0) {
      await interaction.editReply({ embeds: [createErrorEmbed("Please make sure the channel is a text channel.")] });
      return;
    }

    const guild = interaction.guild;
    const dbPath = path.join(__dirname, `../../../guildData/${interaction.guild.id}.sqlite`);
    const db = new QuickDB({ filePath: dbPath });


    let validChannelForMember = await db.get(`massLinkChannels.${channel.id}`);
    if (!validChannelForMember) {
      await interaction.editReply({ embeds: [createErrorEmbed(`You cannot add this member to this channel.\nIt is not a #members channel`)] });
      return;
    }


    let getChannels = await db.get(`massLinkChannels`);
    if (!getChannels) {
      await interaction.editReply({ embeds: [createErrorEmbed("There were no channels created yet. Please do `/createmasschannel` to begin")] });
      return;
    }

    let linkedAccounts = [];
    let realAccounts = [];
    let findLinkedAccounts = await db.get(`users.${userId}`);
    let playertags = findLinkedAccounts?.playertags;
    if (!playertags) {
      await interaction.editReply({ embeds: [createErrorEmbed(`This user has no accounts linked, cannot add.`)] });
      return;
    }
    linkedAccounts = [...linkedAccounts, ...playertags];
    realAccounts.push(userId);

    let channelIdToAdd = await db.get(`massLinkChannels.${channel.id}.channelId`);
    if (!channelIdToAdd) {
      await interaction.editReply({ embeds: [createErrorEmbed(`Please @Zacky if you received this message`)] });
      return;
    }

    let channelToAddMemberTo = await interaction.guild.channels.cache.get(channelIdToAdd);

    // Check if the user had access to the channel 
    // let hadAccess = false;
    // if (channelToAddMemberTo.permissionsFor(user).has(PermissionsBitField.Flags.ViewChannel)) {
    //   // await interaction.editReply({ embeds: [createExistEmbed(`<@${userId}> already had access to this channel.`)] });
    //   // return;
    // }

    await channelToAddMemberTo.permissionOverwrites.create(user, {
      ViewChannel: true,
      SendMessages: true,
    });

    let roleId = await db.get(`massLinkChannels.${channel.id}.roleId`);
    await interaction.guild.members.fetch();
    let allUsersHaveAccess;
    let allUsersHaveRole;
    do {
      allUsersHaveAccess = true;
      allUsersHaveRole = true;
      for (let userId of realAccounts) {
        let member = interaction.guild.members.cache.get(userId);
        if (!channelToAddMemberTo.permissionsFor(member).has(PermissionsBitField.Flags.ViewChannel)) {
          await channelToAddMemberTo.permissionOverwrites.create(member, {
            ViewChannel: true,
            SendMessages: true,
          });
          allUsersHaveAccess = false;
        }

        if (roleId) {
          if (!member.roles.cache.has(roleId)) {
            await member.roles.add(roleId);
            allUsersHaveRole = false;
          }
        }
        else {
          allUsersHaveRole = false;
        }
      }
    } while (!allUsersHaveAccess && !allUsersHaveRole);
    console.log("Confirmed this person has access and or role");

    let description1 = `Added <@${userId}> to this channel.`
    if (roleId) {
      description1 += `\nGave them the <@&${roleId}> role.`
    }
    let description2 = `<@${userId}>: **Please read above or wait for any information about movements.**`

    // Fetch the existing playersAdded array 
    let currentPlayersAdded = await db.get(`massLinkChannels.${channel.id}.playersAdded`) || [];

    // Update the playersAdded array with the new playertags 
    let updatedPlayersAdded = [...new Set([...currentPlayersAdded, ...playertags])]; // Using Set to avoid duplicates 

    // Save the updated playersAdded array back to the database 
    await db.set(`massLinkChannels.${channel.id}.playersAdded`, updatedPlayersAdded);
    await channelToAddMemberTo.send({ embeds: [createSuccessEmbed(description1)] });
    await channelToAddMemberTo.send(description2);

    await interaction.editReply({ embeds: [createSuccessEmbed(`Successfully added <@${userId}> to the channel <#${channel.id}>`)] })


  }
}