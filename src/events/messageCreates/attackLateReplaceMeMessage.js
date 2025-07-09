const { Events, PermissionsBitField, EmbedBuilder } = require('discord.js');
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
    console.log("Read message if looking for attacking late")
    await processMessage(message);
  }
}


async function processMessage(message) {
  console.log("entered processMessage")
  let discordId = message.author.id;
  const guildId = message.guild.id;
  const dbPath = API.findFileUpwards(__dirname, `guildData/${guildId}.sqlite`);
  const db = new QuickDB({ filePath: dbPath });

  try { // <-- Added try block
    const getGuildData = await db.get(`guilds.${guildId}`);
    const attackingLateRoleId = getGuildData['attacking-late'];
    const replaceMeRoleId = getGuildData['replace-me'];

    if (message.mentions.roles.has(attackingLateRoleId)) {
      console.log("saw attacking late");
      await db.set(`users.${discordId}.attacking-late`, true);

      const member = message.guild.members.cache.get(discordId);
      try { // <-- Added try block
        if (!member.permissions.has([PermissionsBitField.Flags.MuteMembers])) {
          const getEmoji = client.emojis.cache.get("1315135180008198206"); // salute
          if (getEmoji) {
            await message.react(getEmoji);
          }
          else {
            await message.react('👍');
          }
        }
      } catch (error) { // <-- Added catch block
        console.log(error);
        await message.channel.send({ embeds: [createErrorEmbed(`Error with reacting to Attack Late ping by <@${discordId}>`)] });
      }
    }

    if (message.mentions.roles.has(replaceMeRoleId)) {
      const member = message.guild.members.cache.get(discordId);
      try { // <-- Added try block
        // if (!member.permissions.has([PermissionsBitField.Flags.MuteMembers])) {
        //   await message.react('⚠️');
        // }

        const userPlayerTags = await db.get(`users.${discordId}.playertags`) || [];
        for (const playertag of userPlayerTags) {
          let checkPlayer = await API.getPlayer(playertag);
          const clanData = await db.get(`clans.${checkPlayer?.clan?.tag}`);
          if (clanData && (await db.get(`users.${discordId}.replace-me`) === false || await db.get(`users.${discordId}.replace-me`) === undefined)) {
            const importantChannel = message.guild.channels.cache.get(clanData.importantChannel);
            if (importantChannel && !(member.permissions.has([PermissionsBitField.Flags.MuteMembers]))) {
              let description = `⚠️ <@${discordId}> (${checkPlayer.name}) asked to be replaced.\n`
              description += `-# See any context here: https://discord.com/channels/${guildId}/${message.channel.id}/${message.id}`
              let replaceMeEmbed = new EmbedBuilder()
                .setColor("Red")
                .setDescription(description)
              await importantChannel.send({ embeds: [replaceMeEmbed] });
            }
          }

          if (!clanData && (await db.get(`users.${discordId}.replace-me`) === false || await db.get(`users.${discordId}.replace-me`) === undefined)) {
            let checkPlayerBattleLog = await API.getPlayerBattleHistory(playertag);
            const processedClans = new Set();
            checkPlayerBattleLog.forEach(async battle => {
              if (battle.team && battle.team.length > 0 && battle.gameMode.name !== ("TeamVsTeam")) {
                battle.team.forEach(async player => {
                  if (player.clan && player.clan.tag && !processedClans.has(player.clan.tag)) {
                    processedClans.add(player.clan.tag);
                    const clanData = await db.get(`clans.${player.clan.tag}`);
                    if (clanData && clanData.importantChannel) {
                      const importantChannel = message.guild.channels.cache.get(clanData.importantChannel);
                      if (importantChannel) {
                        if (!member.permissions.has([PermissionsBitField.Flags.MuteMembers])) {
                          let description = `⚠️ <@${discordId}> (${checkPlayer.name}) asked to be replaced.\n`
                          description += `-# See any context here: https://discord.com/channels/${guildId}/${message.channel.id}/${message.id}`
                          let replaceMeEmbed = new EmbedBuilder()
                            .setColor("Red")
                            .setDescription(description)
                          await importantChannel.send({ embeds: [replaceMeEmbed] });
                        }
                      }
                    }
                  }
                });
              }
            });
          }
        }
        // replace-me embed
        if (!member.permissions.has([PermissionsBitField.Flags.MuteMembers]) && (await db.get(`users.${discordId}.replace-me`) === false || await db.get(`users.${discordId}.replace-me`) === undefined)) {
          await db.set(`users.${discordId}.replace-me`, true);
          await message.react('⚠️');
          embed = new EmbedBuilder()
            .setColor('Green')
            .setDescription('**⚠️ You have pinged to be replaced!⚠️\nPlease leave the clan so we have space to cover your attacks.**')
          await message.reply({ embeds: [embed] });
        }

      } catch (error) { // <-- Added catch block
        console.log(error);
        await message.channel.send({ embeds: [createErrorEmbed(`Error with reacting to Replace Me ping by <@${discordId}>`)] });
      }
    }
  } catch (error) { // <-- Added catch block
    console.log(error);
  }
}
