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
    let channel = message.guild.channels.cache.get(message.channelId);
    if (!channel || !channel.name.includes("invite")) {
      return;
    }
    console.log("ITS AN INVITE");
    const guildId = message.guild.id;
    const dbPath = API.findFileUpwards(__dirname, `guildData/${guildId}.sqlite`);
    const db = new QuickDB({ filePath: dbPath });
    const getGuildData = await db.get(`guilds.${guildId}`);
    if (!getGuildData) {
      return;
    }
    const getClanInviteChannel = getGuildData.clanInvitesChannel;


    if (message.channelId !== getClanInviteChannel || message.guildId !== guildId) {
      return; // make sure it's invite channel and in the guild
    }

    try {
      const fetchedMessage = await message.channel.messages.fetch(message.id);
      if (fetchedMessage) {
        await fetchedMessage.delete();
      }
    } catch (error) {
      console.error(`Failed to delete message: ${error.message}`);
    }

    let parsedMessage = message.content.split(/\s+/); // filter so the link is separated

    let foundClan = false;
    let clanName = "";
    let clanLink = "";
    let clantag = "";
    let promises = parsedMessage.map(async (msg) => {
      let regex = /\/invite\/.*tag=([^&]*)/;
      let regexLink = /https:\/\/link\.clashroyale\.com\/invite\/clan\/[a-z]{2}\?tag=[^&]*&token=[^&]*&platform=(android|iOS)/;
      let match = msg.match(regex); // gets the clantag
      // console.log(match);
      let apiLink = msg.match(regexLink); // gets the entire link
      // console.log(apiLink);

      if (match === null || match[1] === undefined || apiLink === null) {
        return false; // no valid link
      }

      if (!foundClan) {
        let getClan = await API.getClan(match[1]);
        if (getClan.data) {
          return false;
        }
        clanName = getClan.name; // name of clan 
        console.log(clanName);
        clanLink = apiLink[0]; // get full clan invite url
        clantag = "#" + match[1];
        foundClan = true;
      }
      return false; // No clan found
    });
    await Promise.all(promises);
    // console.log(foundClan);
    if (!foundClan) {
      console.log("Cannot find clan to make link");
      return;
    }
    console.log("FOUND CLAN LINK, SHOULD BE DELETING");

    const currentTime = Math.floor(Date.now() / 1000); // Current Unix time in seconds
    const threeDaysInSeconds = 3 * 24 * 60 * 60; // Seconds in 3 days
    // const threeDaysInSeconds = 5; // 5 seconds
    const expiryTime = currentTime + threeDaysInSeconds;
    // console.log(expiryTime);

    const clan = await db.get(`clans.${clantag}`);
    if (clan && clan.expiryTime) {
      console.log(clan.expiryTime);
    }

    if (!clan) {
      const channelId = getClanInviteChannel;
      const channel = await message.client.channels.fetch(channelId);
      if (channel) {
        try {
          const sentMessage = await channel.send(`<@${message.author.id}>, ${clanName} is not a clan linked in the server. Deleting this message after 7 seconds.`);

          setTimeout(async () => {
            try {
              await sentMessage.delete();
            }
            catch (error) {
              console.log("Couldn't delete unaccepted invite: " + error);
            }
          }, 7000);
        }
        catch (error) {
          console.error(`Failed to send message: ${error.message}`);
        }
      }
      return;
    }

    // DELETE LATER
    let notAllowedClantags = []
    if (notAllowedClantags.includes(clantag)) {
      const channelId = getClanInviteChannel;
      const channel = await message.client.channels.fetch(channelId);
      if (channel) {
        try {
          const sentMessage = await channel.send(`<@${message.author.id}>, we are not accepting new ${clanName} links here at the moment. Deleting this message in 7 seconds.`);

          setTimeout(async () => {
            try {
              await sentMessage.delete();
            }
            catch (error) {
              console.log("Couldn't delete unaccepted invite: " + error);
            }
          }, 7000);
        }
        catch (error) {
          console.error(`Failed to send message: ${error.message}`);
        }
      }
      return;
    }

    // alreadyExpired = 0 means that it hasnt sent a ping yet for expiring.
    let clanLinkData = { ...clan, expiryTime: expiryTime, clanLink: clanLink, alreadyExpired: 0 }
    await db.set(`clans.${clantag}`, clanLinkData);




    // if (message.mentions.roles.has(attackingLateRoleId) || message.mentions.roles.has(replaceMeRoleId)) {
    //   // Add the message to the queue if it mentions the relevant roles
    //   messageQueue.push(message);

    //   // Process the queue if not already processing
    //   if (!isProcessing) {
    //     processQueue();
    //   }
    // }
  }
}