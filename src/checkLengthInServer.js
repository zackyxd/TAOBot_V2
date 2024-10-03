require('dotenv/config');
const { Client, Collection, Events, GatewayIntentBits, ActivityType } = require('discord.js');
const fs = require('node:fs');
global.client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessageReactions,
  ],
});
const { QuickDB } = require("quick.db")
const path = require('path');


client.once('ready', async () => {
  const guild = client.guilds.cache.get('722956243261456536');
  if (!guild) return console.log('Guild not found');

  await guild.members.fetch(); // Fetch all members

  // Sort members by join date
  const sortedMembers = guild.members.cache.sort((a, b) => a.joinedTimestamp - b.joinedTimestamp);

  // Get the top 10 members
  const top10Members = sortedMembers.first(20);

  // Display the top 10 members and their join dates
  top10Members.forEach((member, index) => {
    console.log(`${index + 1}. ${member.user.tag} - Joined on ${new Date(member.joinedTimestamp).toLocaleDateString()}`);
  });
});


client.login(process.env.TOKEN);