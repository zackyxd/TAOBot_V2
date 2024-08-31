const { Events, PermissionsBitField, EmbedBuilder, Embed } = require('discord.js');
const { QuickDB } = require('quick.db');
const API = require("../../API.js");
const { createSuccessEmbed, createErrorEmbed, createExistEmbed } = require('../../utilities/embedUtility.js');

const messageQueue = [];
let isProcessing = false;

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    if (message.author.bot) return;

    if (!(message.content).includes('!')) return;
    const member = message.guild.members.cache.get(message.author.id);
    if (!member.permissions.has([PermissionsBitField.Flags.MuteMembers])) return;

    // console.log(message.content);
    messageQueue.push(message);
    if (!isProcessing) {
      await processQueue();
    }
  }
}

async function processQueue() {
  isProcessing = true;

  while (messageQueue.length > 0) {
    // console.dir(messageQueue);
    const message = messageQueue.shift();
    let discordId = message.author.id;
    const guildId = message.guild.id;

    const dbPath = API.findFileUpwards(__dirname, `guildData/${guildId}.sqlite`);
    const db = new QuickDB({ filePath: dbPath });

    const regex = /!(\w+link)\b/;
    const match = (message.content).match(regex);
    console.log(match);
    if (!match) continue;
    let clanAbbrev = match[1].replace('link', '');
    const clans = await db.get(`clans`);
    let clantagForClan = "";
    for (const clantag in clans) {
      if (clans[clantag].abbreviation === clanAbbrev) {
        clantagForClan = clantag;
      }
    }
    console.log(clantagForClan);
    if (!clantagForClan) {
      await message.channel.send({ embeds: [createErrorEmbed(`\`${clanAbbrev}\` is not a valid clan abbreviation.`)] });
      if (message.content.trim() === `!${clanAbbrev}link`) {
        try {
          await message.delete();
        } catch (error) {
          console.log("Couldn't delete quick clan link.", error);
        }
      }
      continue;
    }

    let clanInfo = await db.get(`clans.${clantagForClan}`);
    let clanName = clanInfo?.clanName;
    if (!clanInfo) {
      await message.channel.send({ embeds: [createErrorEmbed(`Error with this clan link \`${clanName}\`. Contact Zacky`)] });
      continue;
    }




    if (clanInfo && !clanInfo.clanLink) {
      await message.channel.send({ embeds: [createExistEmbed(`\`${clanName}\` does not have a clan invite available.`)] });
    }
    if (clanInfo && clanInfo.clanLink && clanInfo.alreadyExpired === 1) {
      await message.channel.send({ embeds: [createErrorEmbed(`The link for \`${clanName}\` is currently expired. Please generate a new invite.`)] });
    }
    if (clanInfo && clanInfo.clanLink && clanInfo.alreadyExpired === 0) {
      let embed = new EmbedBuilder()
        .setColor('#00FF00') // Green color for success
        .setDescription(`## [Click here to join ${clanName}](<${clanInfo.clanLink}>)`) // Make the message bold
        .setFooter({ text: convertUnixToTime(clanInfo.expiryTime) })
      await message.channel.send({ embeds: [embed] });
    }

    if (message.content.trim() === `!${clanAbbrev}link`) {
      try {
        await message.delete();
      } catch (error) {
        console.log("Couldn't delete quick clan link.", error);
      }
    }

  }
  isProcessing = false;
}

function convertUnixToTime(unixTimestamp) {
  const now = Math.floor(Date.now() / 1000);
  const timeLeft = unixTimestamp - now;

  const days = Math.floor(timeLeft / (24 * 60 * 60));
  const hours = Math.floor((timeLeft % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((timeLeft % (60 * 60)) / 60);

  return `Expires in: ${days} days ${hours} hours ${minutes} minutes from this time.`;


}