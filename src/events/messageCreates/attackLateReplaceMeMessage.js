const { Events, PermissionsBitField } = require('discord.js');
const { QuickDB } = require('quick.db');
const API = require("../../API.js");
const { createSuccessEmbed, createErrorEmbed } = require('../../utilities/embedUtility.js');

const messageQueue = [];
let isProcessing = false;

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    if (message.author.bot) return;

    // Check if the message mentions any roles
    if (!message.mentions.roles.size) return;

    messageQueue.push(message);
    if (!isProcessing) {
      processQueue();
    }
  }
}


async function processQueue() {
  isProcessing = true;

  while (messageQueue.length > 0) {
    const message = messageQueue.shift();
    let discordId = message.author.id;
    // console.log(discordId);
    const guildId = message.guild.id;
    const dbPath = API.findFileUpwards(__dirname, `guildData/${guildId}.sqlite`);
    const db = new QuickDB({ filePath: dbPath });

    const getGuildData = await db.get(`guilds.${guildId}`);
    const attackingLateRoleId = getGuildData['attacking-late'];
    const replaceMeRoleId = getGuildData['replace-me'];

    if (message.mentions.roles.has(attackingLateRoleId)) {
      // Remove replace-me if exists
      // await db.set(`users.${discordId}.replace-me`, false);


      // Action to take if the "attacking-late" role is mentioned
      await db.set(`users.${discordId}.attacking-late`, true);

      const member = message.guild.members.cache.get(discordId);
      // console.log(member);
      try {
        if (!member.permissions.has([PermissionsBitField.Flags.MuteMembers])) {
          await message.react('👍');
        }
      }
      catch (error) {
        console.log(error);
        await message.channel.send({ embeds: [createErrorEmbed(`Error with reacting to Attack Late ping by <@${discordId}>`)] })
      }
    }

    if (message.mentions.roles.has(replaceMeRoleId)) {
      // Remove attacking-late if exists
      // await db.set(`users.${discordId}.attacking-late`, false);

      // Action to take if replace me role is mentioned

      const member = message.guild.members.cache.get(discordId);
      // console.log(member);
      try {
        if (!member.permissions.has([PermissionsBitField.Flags.MuteMembers])) {
          await message.react('⚠️');
        }

        const userPlayerTags = await db.get(`users.${discordId}.playertags`) || [];
        // Iterate through each playertag
        for (const playertag of userPlayerTags) {
          // Check if the clan is linked
          let checkPlayer = await API.getPlayer(playertag);
          const clanData = await db.get(`clans.${checkPlayer?.clan?.tag}`);
          if (clanData && (await db.get(`users.${discordId}.replace-me`) === false || await db.get(`users.${discordId}.replace-me`) === undefined)) {
            // Send a message if the clan is linked
            // await message.channel.send(`The playertag ${playertag} is linked to the clan ${clanData.clanName}.`);

            const importantChannel = message.guild.channels.cache.get(clanData.importantChannel);
            if (importantChannel && !(member.permissions.has([PermissionsBitField.Flags.MuteMembers]))) {
              await importantChannel.send({ embeds: [createErrorEmbed(`⚠️ <@${discordId}> (${checkPlayer.name}) asked to be replaced.`)] });
            }
          }

          // Check attack history of player to see if they were in a linked clan
          else if (!clanData && (await db.get(`users.${discordId}.replace-me`) === false || await db.get(`users.${discordId}.replace-me`) === undefined)) {

            // Check player battle log to see if they left clan before saying replace me
            let checkPlayerBattleLog = await API.getPlayerBattleHistory(playertag);
            const processedClans = new Set();
            checkPlayerBattleLog.forEach(async battle => {
              if (battle.team && battle.team.length > 0) {
                battle.team.forEach(async player => {
                  if (player.clan && player.clan.tag && !processedClans.has(player.clan.tag)) {
                    processedClans.add(player.clan.tag);
                    const clanData = await db.get(`clans.${player.clan.tag}`);
                    if (clanData && clanData.importantChannel) {
                      const importantChannel = message.guild.channels.cache.get(clanData.importantChannel);
                      if (importantChannel) {
                        if (member.permissions.has([PermissionsBitField.Flags.MuteMembers])) {
                          return; // dont ping if the user is a coleader in discord
                        }
                        await importantChannel.send({ embeds: [createErrorEmbed(`⚠️ <@${discordId}> (${player.name}) asked to be replaced.`)] });
                      }
                    }
                  }
                });
              }
            });
          }
        }
        await db.set(`users.${discordId}.replace-me`, true);
      }
      catch (error) {
        console.log(error);
        await message.channel.send({ embeds: [createErrorEmbed(`Error with reacting to Replace Me ping by <@${discordId}>`)] })
      }
    }
  }

  isProcessing = false;
}