const API = require('../../API.js')
const path = require('path')
const fs = require('fs')
const { createSuccessEmbed, createErrorEmbed, createExistEmbed } = require('../../utilities/embedUtility.js');
const { QuickDB } = require('quick.db');

const {
  EmbedBuilder,
  AttachmentBuilder,
  SlashCommandBuilder,
  PermissionFlagsBits
} = require('discord.js')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remove-clan-role')
    .setDescription(
      'Remove roles of players not in the clan at the time.'
    )
    .addStringOption(option =>
      option.setName("abbreviation")
        .setDescription("Abbreviation of the clan role to remove")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return

    if (interaction.commandName === 'remove-clan-role') {
      await interaction.deferReply({ ephemeral: false })

      let members = await interaction.guild.members.fetch()
      let abbrev = interaction.options.get("abbreviation").value.toLowerCase();
      const db = await API.getDb(interaction.guild.id);

      const clans = await db.get(`clans`) || {};
      if (!clans) {
        await interaction.editReply({ embeds: [createErrorEmbed(`Issue with finding the clans in the server. There is no clans linked.`)] });
        return;
      }


      const clantag = Object.keys(clans).find(tag => clans[tag].abbreviation === abbrev);
      if (!clantag) {
        await interaction.editReply({ embeds: [createErrorEmbed(`The abbreviation \`${abbrev}\` is not linked to the server.`)] });
        return;
      }

      let clanInfo = await db.get(`clans.${clantag}`);
      let roleToRemove;
      if (clanInfo?.roleId) {
        roleToRemove = clanInfo.roleId
      }
      else {
        await interaction.editReply({ embeds: [createErrorEmbed(`The clan with abbreviation \`${abbrev}\` does not have a role attached to it.`)] })
        return;
      }

      let clan = await API.getClan(clantag);
      // if (clan?.clanWarTrophies >= 5000) {
      //   await interaction.editReply({ embeds: [createExistEmbed(`Cannot remove roles of clans above 5k war trophies @hahn`)] })
      //   return;
      // }
      if (clan.tag === "#V2GQU") {
        await interaction.editReply({ embeds: [createExistEmbed(`Sorry, the stupid 🐔 doesn't want his e-babies to lose their COCK role, so cannot clear this clan.`)] })
        return;
      }

      const membersInClanSet = await getMembersInClan(db, clanInfo.clantag);
      if (!membersInClanSet) { await interaction.edit.reply({ embeds: [createErrorEmbed(`There were no members found in the clan...contact Zacky if this is a mistake`)] }); return }

      let currentUserNumber = 1
      let removeRoles = 0
      let membersPing = [];
      for (const member of members.values()) {
        console.log(`Checking player ${currentUserNumber} out of ${members.size}`)
        try {
          // If member has role, and member's discordid is not in the clan...remove
          if (member.roles.cache.has(roleToRemove) && !membersInClanSet.has(member.user.id)) {
            await member.roles.remove(roleToRemove);
            console.log("Removing role from", member.user.id, "because they arent in the clan:", clantag);
            removeRoles++;
            membersPing.push(member.user.id)
            await new Promise(resolve => setTimeout(resolve, 75))
          }
          currentUserNumber++
        } catch (error) {
          currentUserNumber++;
        }
      }
      if (removeRoles === 0) {
        await interaction.editReply({ embeds: [createExistEmbed(`There were no members with the <@&${roleToRemove}> role that were not in the clan.`)] })
        return;
      }
      let messageToSend = `Removed ${removeRoles} members that had <@&${roleToRemove}> role and weren't in the clan.\n Member(s) removed: `;
      let formattedMembersPing = membersPing.map(id => `<@${id}>`);
      const maxMessageLength = 2000; // Discord's message length limit
      let currentMessage = messageToSend;

      for (const ping of formattedMembersPing) {
        // Add the current ping to the message, but check if it exceeds the max length
        if ((currentMessage + ping + ", ").length > maxMessageLength) {
          // Send the current message and reset it
          await interaction.followUp({ embeds: [createSuccessEmbed(currentMessage)] });
          currentMessage = ""; // Reset the message
        }
        // Add the ping to the current message
        currentMessage += `${ping}, `;
      }

      // If there's any remaining message to send, send it
      if (currentMessage.length > 0) {
        await interaction.followUp({ embeds: [createSuccessEmbed(currentMessage)] });
      }

    }
  }
}


// Returns set of members in clan. Converts playertag to discordid
async function getMembersInClan(db, clantag) {
  const clan = await API.getClan(clantag);
  if (!clan.memberList) return null;
  let membersInClan = new Set();
  for (const member of clan.memberList) {
    try {
      let discordId = await db.get(`playertags.${member.tag}.discordId`);
      membersInClan.add(discordId)
    } catch (error) {
      console.log("Playertag does not have associated discordid:", member.tag);
    }
  }
  return membersInClan;
}
