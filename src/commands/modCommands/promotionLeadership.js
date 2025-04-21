const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, Embed } = require("discord.js");
const path = require('path');
const Database = require('better-sqlite3');
const { QuickDB } = require("quick.db")
const fs = require('fs');
const API = require("../../API.js");
const { createSuccessEmbed, createExistEmbed, createErrorEmbed, createMaintenanceEmbed } = require('../../utilities/embedUtility.js');
const moment = require('moment-timezone');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("promote-trial")
    .setDescription("Promote a user to leadership with the corresponding message.")
    .addUserOption((option) =>
      option.setName("user-1").setDescription("@user to promote").setRequired(true)
    )
    .addUserOption((option) =>
      option.setName("user-2").setDescription("@user to promote").setRequired(false)
    )
    .addUserOption((option) =>
      option.setName("user-3").setDescription("@user to promote").setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "promote-trial") return;
    await interaction.deferReply({ ephemeral: true });
    const dbPath = API.findFileUpwards(__dirname, `guildData/${interaction.guild.id}.sqlite`);
    const db = new QuickDB({ filePath: dbPath });
    const clans = await db.get(`clans`) || {};
    if (!clans) {
      await interaction.editReply({ embeds: [createErrorEmbed(`Issue with finding the clans in the server. There is no clans linked.`)] });
      return;
    }

    // Collect mentioned users
    let users = [];
    for (let i = 1; i <= 10; i++) {
      const member = interaction.options.getMember(`user-${i}`);
      if (member) users.push(member);
    }

    let trialColeaderRoleId = "893867446358925332"

    let coleaderChannelId = await db.get(`guilds.${interaction.guild.id}.coleaderChannelId`);
    let channelToSend;
    try {
      channelToSend = await interaction.client.channels.fetch(coleaderChannelId)
    } catch (error) {
      await interaction.editReply({ embeds: [createErrorEmbed(`Could not fetch the channel <#${coleaderChannelId}>`)] });
      return;
    }

    if (!channelToSend) {
      await interaction.editReply({ embeds: [createErrorEmbed(`Could not fetch the channel <#${coleaderChannelId}>`)] });
      return;
    }


    let giveRoles = await assignRoles(interaction, users, trialColeaderRoleId);
    if (!giveRoles) {
      await interaction.editReply("Issue giving roles...Contact Zacky");
      return;
    }
    await interaction.editReply(`Roles given and message sending in 5 seconds!`);


    let memberString = users.join(', ');
    let embed = new EmbedBuilder()
      .setDescription(`**The user(s) ${memberString} should now have <@&${trialColeaderRoleId}>.\nSending the welcome message to: ${channelToSend}**`)
      .setColor("#00FF00")
    await interaction.editReply({ embeds: [embed] });
    await sleep(5000);



    let promotionMessage = `Welcome ${memberString}\n\nYou've been selected to become Trial Co-Leader!\n\nThis being a trial, it means that this is not yet considered a promotion. We will evaluate over the coming weeks you perform and if it's a good fit to become Co-Leader.\nThe main duties will be to help with tickets and to help with clan rosters.\n## Tickets\nWith new tickets we evaluate the players who apply to us and see for which clan they would be a good fit. Things to consider are war scores, overall profile quality (CC/GC wins, ladder finishes, GT badges etc), and card levels. You have access to all tickets, so you can watch how we do it. Once you feel confident you can start answering tickets yourself. Following up with tickets is something you can do right away. If we have responded to a ticket but the applicant hasn't responded back in a day, feel free to ping them to see if they're still interested.\n## Rosters\nWe need help with this. Each clan has a roster manager. They decide what players should get promoted/demoted or sent to L2W. Once they decided on that you can help him move those players to their destined clans. Our bot is very helpful to master these tasks. At the end of this message is a link to a document with all the important commands to make your job as a co-leader easier. Otherwise you can just look at the pinned messages from Zacky where he explains a little of what the bot can do. https://docs.google.com/document/d/1CiaQwahr4cxf1d3gecVXF4yCcId7qKgNeImYKlChGb4/edit?usp=sharing`;

    let promotionMessage2 = `Feel free to ask us any questions if you're not sure about something. One quality we're all looking for in leadership is the ability to take initiative. You've got a responsibility to your clan now to make sure that it's organized, that the right players are in the right place. If you see there's someone missing, check with them to make sure they have a link or know where to go.\n\nWhen everyone does something then it's actually not that much work. It only becomes a job when few people have to do everything, and too many are sitting around waiting for someone to tell them what to do. That's why I'm saying that initiative is the most important quality to have, since everything else can be learned. We're happy to have you on the team <:pepelove:1248329233135046820>`

    await channelToSend.send(promotionMessage);
    await channelToSend.send(promotionMessage2);
  }
}


async function assignRoles(interaction, users, trialColeaderRoleId) {
  console.log("Checking for the roles: ", trialColeaderRoleId);
  await interaction.editReply("Working on giving the roles...")
  for (user of users) {
    try {
      await user.roles.add(trialColeaderRoleId);
      await sleep(250);
    } catch (error) {
      console.error(`Failed to add role ${trialColeaderRoleId} to user ${user.user.id}:`, error);
      return false;
    }
  }
  return true;
}


function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}