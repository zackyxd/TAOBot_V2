const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, Embed } = require("discord.js");
const { QuickDB } = require("quick.db")
const API = require("../../API.js");
const { createSuccessEmbed, createExistEmbed, createErrorEmbed, createMaintenanceEmbed } = require('../../utilities/embedUtility.js');


module.exports = {
  data: new SlashCommandBuilder()
    .setName("welcome")
    .setDescription("Welcome a member to the server, gives the necessary roles and message.")
    .addUserOption((option) =>
      option.setName("user").setDescription("@user to welcome").setRequired(true)
    )
    .addStringOption(option =>
      option.setName("abbreviation")
        .setDescription("Which clan do you want to welcome them to?")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers),

  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "welcome") return;
    await interaction.deferReply({ ephemeral: true });
    let member = interaction.options.getMember("user"); // gets full user
    let abbrev = interaction.options.get("abbreviation").value.toLowerCase();
    const dbPath = API.findFileUpwards(__dirname, `guildData/${interaction.guild.id}.sqlite`);
    const db = new QuickDB({ filePath: dbPath });
    const clans = await db.get(`clans`) || {};
    if (!clans) {
      await interaction.editReply({ embeds: [createErrorEmbed(`Issue with finding the clans in the server. There is no clans linked.`)] });
      return;
    }

    let globalRole = await db.get(`guilds.${interaction.guild.id}.globalRole`);
    if (!globalRole) {
      await interaction.editReply({ embeds: [createExistEmbed(`There is no global role set, the mods should set it up.`)] });
      return;
    }

    const clantag = Object.keys(clans).find(tag => clans[tag].abbreviation === abbrev);

    if (!clantag) {
      await interaction.editReply({ embeds: [createErrorEmbed(`The abbreviation \`${abbrev}\` is not linked to the server.`)] });
      return;
    }

    let clanInfo = await db.get(`clans.${clantag}`);
    let channelToSend;
    let clanRole = clanInfo.roleId;
    try {
      channelToSend = await interaction.client.channels.fetch(clanInfo.membersChannel)
    } catch (error) {
      await interaction.editReply({ embeds: [createErrorEmbed(`${clanInfo.clanName} does not have a member channel to send to.`)] });
      return;
    }

    if (!clanRole) {
      await interaction.editReply({ embeds: [createErrorEmbed(`${clanInfo.clanName} does not have a role to give.`)] });
      return;
    }


    let roleIds = [];
    roleIds.push(globalRole);
    roleIds.push(clanRole);
    let startTimer = performance.now();
    let giveRoles = await assignRoles(interaction, member, roleIds, globalRole, clanRole);
    if (!giveRoles) {
      await interaction.editReply("Issue giving roles...Contact Zacky");
      return;
    }
    let endTimer = performance.now();
    let totalTime = ((endTimer - startTimer) / 1000).toFixed(2);
    await interaction.editReply(`Roles given and message sending in 5 seconds!`);
    let embed = new EmbedBuilder()
      .setDescription(`**The user <@${member.user.id}> should now have <@&${globalRole}> and <@&${clanRole}> roles.\nSending the welcome message to: ${channelToSend}**\n-# Took ${totalTime} seconds`)
      .setColor("#00FF00")
    await interaction.channel.send({ embeds: [embed] });
    await sleep(5000);


    let welcomeMessage = `**__Welcome to AAFAM <@${member.user.id}>!__**\nHere is some info to help you in the server!\n* This is the chat for any clan information and to talk to your clan members.\n* We have plenty of skilled war players that love helping players improve or update their war decks over at <#862870289330470922>. Just paste your [RoyaleAPI link](<https://royaleapi.com>) so they can check your account out!\n* We expect all your war attacks to be done at <t:1715659256:t> (this is converted to your time). If you can\’t get your attacks in by that time, please ping the <@&1020930468566278144> role before the deadline.\n* If you can\’t attack at all, please ping the <@&1201147623315353673> role as soon as possible so we can look for others to attack for you. No negative consequences for using this, just don\'t abuse it please.\n* If you want to chat to everyone in the family, head over to <#783029863442415665>!\n\nIf you have any questions, don\'t hesitate to reach out to us <:pepelove:975927592987291688> We\'re always looking to help!`

    await channelToSend.send(welcomeMessage);
    await interaction.editReply({ embeds: [createSuccessEmbed(`Success!`)] })

  }
}


async function assignRoles(interaction, member, roleIds) {
  console.log("Checking for the roles: ", roleIds);
  await interaction.editReply("Working on giving the roles...")
  for (role of roleIds) {
    try {
      await member.roles.add(role);
      await sleep(250);
    } catch (error) {
      console.error(`Failed to add role ${role} to user ${member.user.id}:`, error);
      return false;
    }
  }
  return true;
}


function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
