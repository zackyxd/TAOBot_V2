const API = require("../../API.js");
const { Events, ActivityType, EmbedBuilder } = require("discord.js");
const path = require('path');
const Database = require('better-sqlite3');
const { QuickDB } = require("quick.db");
const fs = require('fs');
const { createSuccessEmbed, createExistEmbed, createErrorEmbed, createMaintenanceEmbed } = require('../../utilities/embedUtility.js');

// Checks members joined for people that weren't linked.
const verifyClanlogs = async (client) => {
  console.log("Verifying clanlogs...");
  client.guilds.cache.forEach(async guild => {
    const db = await API.getDb(guild.id);
    const clans = await db.get(`clans`);
    if (!clans) return;
    const clanlogs = await db.get('membersJoined');
    if (!clanlogs) return;
    for (const clantag in clanlogs) {
      const clan = await API.getClan(clantag);
      const members = clan?.memberList;
      if (!members) continue;
      // clanlogs[clantag] Prints out the array object
      // For member in the membersJoined database (object) of the clantag
      for (const memberObject of clanlogs[clantag]) {
        // memberObject is the full object
        const member = members.find(member => member.tag === memberObject.playertag); // Checks if member exists

        if (member) {
          // If member is in clan, check if they are linked and have global role, then give role
          const playertags = await db.get(`playertags`);
          let discordId = playertags[memberObject.playertag]?.discordId;

          if (discordId) {
            let roleId = await db.get(`clans.${clantag}.roleId`);
            let globalRole = await db.get(`guilds.${guild.id}.globalRole`);

            if (!roleId || !globalRole) {
              continue;
            }

            let guildMember = guild.members.cache.get(discordId);
            if (guildMember && guildMember.roles.cache.has(globalRole)) {
              await guildMember.roles.add(roleId);
              console.log(`Added role ${roleId} to ${guildMember.user.username}`);

              // Remove the memberObject from the array
              let updatedMembers = clanlogs[clantag].filter(m => m.playertag !== memberObject.playertag);
              await db.set(`membersJoined.${clantag}`, updatedMembers);
              console.log(`Removed ${memberObject.playertag} from membersJoined database`);

              // Delete the key if the array is empty
              if (updatedMembers.length === 0) {
                await db.delete(`membersJoined.${clantag}`);
                console.log(`No more members in database for ${clantag} in clan logs.`);
              }
            }
          }
        }
        // If member isn't in clan, don't care.
      }
    }
  });
  console.log("Finished verifying clanlogs.");
}

module.exports = { verifyClanlogs }