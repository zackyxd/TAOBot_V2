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

    const member = message.guild.members.cache.get(message.author.id);
    if (!member.permissions.has([PermissionsBitField.Flags.MuteMembers])) {
      return;
    }
    if (!(message.content).includes('!')) return;

    // console.log(message.content);
    messageQueue.push(message);
    if (!isProcessing) {
      await processQueue(member);
    }
  }
}

async function processQueue(member) {
  isProcessing = true;

  while (messageQueue.length > 0) {
    // console.dir(messageQueue);
    const message = messageQueue.shift();
    let discordId = message.author.id;
    const guildId = message.guild.id;

    const dbPath = API.findFileUpwards(__dirname, `guildData/${guildId}.sqlite`);
    const db = new QuickDB({ filePath: dbPath });

    // const regex = /!(\w+link)\b/i;
    const regex = /!(\w+)\b/;


    const match = (message.content).match(regex);
    if (!match) continue;
    let clanAbbrev = match[1].replace(/link/i, '').toLowerCase();
    // console.log(clanAbbrev);
    // let clanAbbrev = match[1];
    // Check if the input message contains an underscore
    // if (clanAbbrev.includes('_')) {
    //   console.log("Input contains an underscore; continuing to next iteration.");
    //   continue; // Skip this iteration if there is an underscore in the input
    // }
    const clans = await db.get(`clans`);
    let clantagForClan;
    for (const clantag in clans) {
      if (clans[clantag].abbreviation === clanAbbrev) {
        clantagForClan = clantag;
      }
    }
    // if someone does previous !a1link command that contains "link"
    // if (!clantagForClan) {
    //   clanAbbrev = match[1].replace('link', '');
    //   for (const clantag in clans) {
    //     if (clans[clantag].abbreviation === clanAbbrev) {
    //       clantagForClan = clantag;
    //     }
    //   }
    // }

    if (!clantagForClan) {
      // await message.channel.send({ embeds: [createErrorEmbed(`\`${clanAbbrev}\` is not a valid clan abbreviation.`)] });
      // if (message.content.trim() === `!${clanAbbrev}link`) {
      // if (message.content.trim() === `!${clanAbbrev}link` || message.content.trim() === `!${clanAbbrev}`) {
      //   try {
      //     await message.delete();
      //   } catch (error) {
      //     console.log("Couldn't delete quick clan link.", error);
      //   }
      // }
      continue;
    }

    // if (!member.permissions.has([PermissionsBitField.Flags.KickMembers])) {
    //   await member.send({ embeds: [createExistEmbed(`Hey! Coleaders are currently disabled from using clan link invites. Please message management if you need to give out a link.`)] });
    //   continue;
    // }

    let clanInfo = await db.get(`clans.${clantagForClan}`);
    let clanName = clanInfo?.clanName;
    if (!clanInfo) {
      await message.channel.send({ embeds: [createErrorEmbed(`Error with this clan link \`${clanName}\`. Contact Zacky`)] });
      continue;
    }

    // DELETE LATER
    let notAllowedClantags = []
    if (notAllowedClantags.includes(clanInfo.clantag)) {
      await message.channel.send({ embeds: [createErrorEmbed(`Sorry, ${(clanInfo.abbreviation).toUpperCase()} links cannot be generated at the current time.`)] });
      continue;
    }

    if (clanInfo && !clanInfo.clanLink) {
      await message.channel.send({ embeds: [createExistEmbed(`\`${clanName}\` does not have a clan invite available.`)] });
    }
    if (clanInfo && clanInfo.clanLink && clanInfo.alreadyExpired === 1) {
      await message.channel.send({ embeds: [createErrorEmbed(`The link for \`${clanName}\` is currently expired. Please generate a new invite.`)] });
    }
    if (clanInfo && clanInfo.clanLink && clanInfo.alreadyExpired === 0) {
      let clan = await API.getClan(clanInfo.clantag);
      let clanMemberCount = clan.members;
      let embed = new EmbedBuilder()
        .setColor('#00FF00') // Green color for success
        .setDescription(`## [Click here to join ${clanName}](<${clanInfo.clanLink}>)\n-# Expires: <t:${clanInfo.expiryTime}:R> | ${clanMemberCount}/50`) // Make the message bold
      // .setFooter({ text: convertUnixToTime(clanInfo.expiryTime) })
      let content = `-# [Click this to join ${clanName}](<${clanInfo.clanLink}>) Expires: <t:${clanInfo.expiryTime}:R> | ${clanMemberCount}/50`;
      let linkMessage = await message.channel.send({ embeds: [embed], content: content });
      // let linkMessageMini = await message.channel.send(`-# [Click this to join ${clanName}](<${clanInfo.clanLink}>) Expires: <t:${clanInfo.expiryTime}:R>`);
      await addClanLinkToDatabase(db, member, message.channelId, linkMessage.id, clanInfo, clanMemberCount);
    }

    // if (message.content.trim() === `!${clanAbbrev}link`) {
    if (message.content.trim() === `!${clanAbbrev}link` || message.content.trim().toLowerCase() === `!${clanAbbrev}`) {
      try {
        await message.delete();
      } catch (error) {
        console.log("Couldn't delete quick clan link.", error);
      }
    }

  }
  isProcessing = false;
}


async function addClanLinkToDatabase(db, member, channelId, messageId, clanInfo, clanMemberCount) {
  const memberThatSent = member?.nickname || member.user.username;
  const expiryTime = clanInfo.expiryTime;
  const clanName = clanInfo.clanName;
  const clantag = clanInfo.clantag;

  // Create the object for the current messageId
  const messageData = {
    channelId,
    clanName,
    expiryTime,
    memberThatSent,
    messageId,
  };

  try {
    // Retrieve the existing data for this expiry time
    const existingData = await db.get(`clanLinkTracker2.${expiryTime}`) || {};

    // Ensure there is a structure under the clantag and add the messageId
    if (!existingData[clantag]) {
      existingData[clantag] = {};
    }
    existingData[clantag][messageId] = messageData;
    existingData[clantag].clanMembers = clanMemberCount
    // Save the updated structure back to the database
    await db.set(`clanLinkTracker2.${expiryTime}`, existingData);

  } catch (error) {
    console.error("Error saving to database:", error);
    let errorChannel = await member.guild.channels.fetch('1199157863344517180'); // Replace with your error channel ID
    await errorChannel.send(`Error saving to db: ${error.message}\n${memberThatSent}, ${clantag}, https://discord.com/channels/722956243261456536/${channelId}/${messageId}`);
  }
}





function convertUnixToTime(unixTimestamp) {
  const now = Math.floor(Date.now() / 1000);
  const timeLeft = unixTimestamp - now;

  const days = Math.floor(timeLeft / (24 * 60 * 60));
  const hours = Math.floor((timeLeft % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((timeLeft % (60 * 60)) / 60);
  return timeLeft;
  return `Expires in: ${days} days ${hours} hours ${minutes} minutes from this time.`;


}