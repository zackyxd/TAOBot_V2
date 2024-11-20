const API = require("../../API.js");
const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, Embed, ChannelType, PermissionsBitField } = require("discord.js");
const path = require('path');
const Database = require('better-sqlite3');
const { QuickDB } = require("quick.db")
const fs = require('fs');
const { createSuccessEmbed, createExistEmbed, createErrorEmbed, createMaintenanceEmbed } = require('../../utilities/embedUtility.js');


module.exports = {
  data: new SlashCommandBuilder()
    .setName("createchannel")
    .setDescription("What is the channel you want for this clan's log?")
    .addStringOption(option =>
      option.setName("players")
        .setDescription("Please @ all the players in here to add to the channel.")
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName("describe")
        .setDescription("Please write one word or abbreviation for this channel. 10 character max.")
        .setRequired(true)
    )
    .addRoleOption(option =>
      option.setName("role-to-give")
        .setDescription("Do you want to give them a role? Which?")
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers),

  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "createchannel") return;
    await interaction.deferReply({ ephemeral: true });
    let players = interaction.options.getString("players");
    let describe = interaction.options.getString("describe");
    let role = interaction.options.getRole("role-to-give") || null;
    // console.log(role)
    if (describe.split(' ').length !== 1 || describe.length > 10) {
      await interaction.editReply({ embeds: [createErrorEmbed("Please make sure the `describe` option is a single word under 11 characters.")] });
      return;
    }
    const regex = /<@\d+>/g;
    const matches = players.match(regex);
    if (!matches) {
      await interaction.editReply({ embeds: [createErrorEmbed("Please mention at least one @user.")] });
      return;
    }

    const guild = interaction.guild;
    const dbPath = path.join(__dirname, `../../../guildData/${interaction.guild.id}.sqlite`);
    const db = new QuickDB({ filePath: dbPath });

    let getChannels = await db.get(`massLinkChannels`);
    if (!getChannels) {
      await db.set(`massLinkChannels`, {
        "count": 0,
      })
    }
    let count = await db.get(`massLinkChannels.count`) || 0;
    count++;
    await db.set(`massLinkChannels.count`, count);

    const channel = await guild.channels.create({
      name: `members-${count}-${describe}`, // Ensure the name field is defined
      type: ChannelType.GuildText,
      // parent: '1182482429810847807', // my guild category id
      parent: "1283051581834530978", // TAO category id
      permissionOverwrites: null, // Inherit permissions from the category
    });

    let linkedAccounts = [];
    let realAccounts = [];
    // Add specific permission overwrites for mentioned users
    for (let user of matches.values()) {
      user = user.substring(2, user.length - 1);
      let findLinkedAccounts = await db.get(`users.${user}`);
      let playertags = findLinkedAccounts?.playertags;
      if (!playertags) continue;
      linkedAccounts = [...linkedAccounts, ...playertags]
      realAccounts.push(user);
      await channel.permissionOverwrites.create(user, {
        ViewChannel: true,
        SendMessages: true,
      });
    }

    // Confirm everyone has access to channel before continuing. 
    await interaction.guild.members.fetch();
    let allUsersHaveAccess;
    let allUsersHaveRole;
    do {
      allUsersHaveAccess = true;
      allUsersHaveRole = true;
      for (let userId of realAccounts) {
        let member = interaction.guild.members.cache.get(userId);
        if (!channel.permissionsFor(member).has(PermissionsBitField.Flags.ViewChannel)) {
          await channel.permissionOverwrites.create(member, {
            ViewChannel: true,
            SendMessages: true,
          });
          allUsersHaveAccess = false;
        }

        if (role) {
          if (!member.roles.cache.has(role.id)) {
            await member.roles.add(role.id);
            allUsersHaveRole = false;
          }
        }
        else {
          allUsersHaveRole = false;
        }
      }
    } while (!allUsersHaveAccess && !allUsersHaveRole);
    console.log("Confirmed everyone has access and or role");

    let description = realAccounts.length === 1 ? `Created <#${channel.id}> with ${realAccounts.length} member.` : `Created <#${channel.id}> with ${realAccounts.length} members.`;

    if (role) {
      description += `\nGave the <@&${role.id}> role.`
    }

    if (realAccounts.length === 1) {
      await interaction.editReply({ embeds: [createSuccessEmbed(description)] });
    }
    else {
      await interaction.editReply({ embeds: [createSuccessEmbed(description)] });
    }

    const mentions = matches.map(user => `${user}`).join(' ');
    let message = await channel.send(`Attention: ${mentions}\nCreated by <@${interaction.user.id}>`);
    let messageId = message.id;
    const attachment = new AttachmentBuilder((API.findFileUpwards(__dirname, "movinggif.gif")));
    await channel.send({ files: [attachment] });
    let embed = new EmbedBuilder()
      .setColor("Purple")
      .setDescription(`Please stand by as we prepare movements. Invite links will be provided below 👇
`);
    await channel.send({ embeds: [embed] })
    await db.set(`massLinkChannels.${channel.id}`, {
      "channelId": channel.id,
      "users": [],
      "playersAdded": linkedAccounts,
      "originalMessage": messageId,
      "roleId": role ? role.id : undefined
    });


  }


}