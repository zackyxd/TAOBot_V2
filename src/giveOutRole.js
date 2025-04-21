require('dotenv/config');
const API = require("./API.js");
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] }); // Required intents
const token = process.env.DISCORD_TOKEN;
const guildId = process.env.GUILD_ID;
const roleId = '1361360651188043816'

client.once('ready', async () => {
  const guild = await client.guilds.fetch(guildId);
  const members = await guild.members.fetch(); // Fetch all members
  const db = await API.getDb(guildId);
  const playertags = await db.get("playertags");


  let riverRaceLog = await API.getRiverRaceLog("8CYR2V");
  let standings = riverRaceLog.items[1].standings;
  let clan = standings.find(standing => standing.clan.tag === "#8CYR2V");
  let players = {};
  for (const participant of clan.clan.participants) {
    if (participant.fame <= 0) continue;
    let player = playertags[participant.tag];
    let discordId = player?.discordId;
    players[participant.tag] = { playerName: participant.name, discordId: discordId };
  }



  let notFound = [];
  for (let [tag, info] of Object.entries(players)) {
    let member;
    console.log(`Fetching member with discordId: ${info.discordId}`);
    try {
      member = await guild.members.fetch(info.discordId);
      console.log(`Fetched member:`, member.user.username); // Debug the fetched member
    } catch (error) {
      notFound.push({ tag: tag, playerName: info.playerName, discordId: info?.discordId });
      continue;
    }

    if (member && member.roles.cache && !member.roles.cache.has(roleId)) {
      const guildMe = await guild.members.fetch(client.user.id);
      if (guildMe.permissions.has('ManageRoles')) {
        try {
          await member.roles.add(roleId); // Add role
          console.log(`Role added successfully to ${member.user.username}`);
        } catch (error) {
          console.error(`Failed to add role to ${member.user.username}:`, error);
        }
      } else {
        console.error("Bot lacks Manage Roles permission in this guild.");
      }
    }

  }


  let description = "Couldn't find these players to give roles:\n";

  for (const player of notFound) {
    let discordId = player.discordId ? `<@${player.discordId}>` : "N/A";
    description += `${player.tag} - **${player.playerName}** - ${discordId}\n`;
  }

  description += `Gave out roles to ${Object.keys(players).length} players\n-# This is for the players in AM vs. Muk Colosseum\n`;

  let embed = new EmbedBuilder()
    .setDescription(description)
    .setColor('Purple');

  let channel = await client.channels.fetch("893533620684341299");
  let message = await channel.send({ embeds: [embed] });
  console.log(description);
  console.log('Roles updated!');
  client.destroy(); // Terminate the bot connection
});

client.login(token);
