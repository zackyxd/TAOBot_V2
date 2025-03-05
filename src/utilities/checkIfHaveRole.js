// const API = require("../API.js");
// const { Events, ActivityType, EmbedBuilder, Embed, PermissionsBitField } = require("discord.js");
// const path = require('path');
// const { QuickDB } = require("quick.db")
// const fs = require('fs');
// const { createSuccessEmbed, createExistEmbed, createErrorEmbed, createMaintenanceEmbed } = require('./embedUtility.js');
// const cron = require('node-cron');
// require('dotenv/config');


// const updateMemberClanRoles = async (client) => {
//   let allGuildPromises = [];
//   for (const guild of client.guilds.cache.values()) {
//     allGuildPromises.push(processGuild(guild));
//   }
//   await Promise.all(allGuildPromises);
//   console.log("Finished going through all members to update their clan roles");
// }

// const processGuild = async (guild) => {
//   try {
//     const dbPath = API.findFileUpwards(__dirname, `guildData/${guild.id}.sqlite`);
//     const db = new QuickDB({ filePath: dbPath, timeout: 5000 });
//     const clans = await db.get(`clans`);
//     if (!clans) return;

//     let grabGlobalRole = await db.get(`guilds.${guild.id}`); // global role they must have
//     let grabRole = grabGlobalRole?.globalRole; // global role id
//     // console.log(`Processing guild: ${guild.id}`);

//     const clanPromises = [];
//     for (const clantag in clans) {
//       clanPromises.push(processClan(clantag, db, grabRole, guild)); // must have global role (grabRole)
//     }

//     await Promise.all(clanPromises);
//   } catch (error) {
//     console.error(`Error processing guild ${guild.id}:`, error);
//   }
// };

// const processClan = async (clantag, db, grabRole, guild) => {
//   try {
//     // console.log(`Second loop, starting clantag: ${clantag}`);
//     let roleId = await db.get(`clans.${clantag}.roleId`);
//     if (!roleId) {
//       // console.log(`No roleId found for clantag: ${clantag}, skipping...`);
//       return;
//     }
//     // console.log("Updating clan member roles for:", clantag);

//     const { memberList: membersInClan, clanWarTrophies } = await getClanMembers(clantag); // grab members in clan
//     if (!membersInClan) return;
//     await sleep(75);
//     const discordIds = await findDiscordIds(membersInClan, guild.id); // grab discord ids of members if available

//     let over5000Clan = false;
//     if (clanWarTrophies >= 5000) {
//       over5000Clan = true; // if above 5000, give role to coleaders
//     }
//     await addMissingClanRole(discordIds, roleId, grabRole, guild, over5000Clan);
//     // console.log(`Finished processing check-roles for clantag: ${clantag}`);
//   } catch (error) {
//     console.error("Error processing clan:", clantag, error);
//   }
// };


// // Get clan members array from api
// async function getClanMembers(clantag) {
//   if (clantag.charAt(0) !== "#") clantag = "#" + clantag;
//   let clanData = await API.getClan(clantag);
//   if (!clanData || !clanData.memberList) {
//     console.error(`Error: No member list found for clantag ${clantag} for checking roles`)
//     return null;
//   }
//   // console.log("Fetched member list for:", clantag);
//   const memberList = clanData.memberList;
//   const clanWarTrophies = clanData.clanWarTrophies;
//   return { memberList, clanWarTrophies };
// }

// // find discord ids in my database, return as set for unique people
// async function findDiscordIds(members, guildId) {
//   // console.log("Finding discord ids...");
//   const dbPath = API.findFileUpwards(__dirname, `guildData/${guildId}.sqlite`);
//   const db = new QuickDB({ filePath: dbPath, timeout: 5000 });
//   let discordIds = new Set();
//   for (let member of members) {
//     let memberDiscordId = await db.get(`playertags.${member.tag}`);
//     if (!memberDiscordId || !memberDiscordId.discordId) continue;
//     discordIds.add(memberDiscordId.discordId);
//   }
//   return discordIds;
// }


// async function addMissingClanRole(discordIds, roleId, mustHaveRole, guild, over5000Clan) {
//   let rolePromises = [];
//   for (const discordId of discordIds) {
//     rolePromises.push(addRoleToMember(discordId, roleId, mustHaveRole, guild, over5000Clan));
//     sleep(75);
//   }
//   await Promise.all(rolePromises);
// }

// const addRoleToMember = async (discordId, roleId, mustHaveRole, guild, over5000Clan) => {
//   try {
//     let member = await guild.members.fetch(discordId);
//     if (mustHaveRole && member.roles.cache.has(mustHaveRole) && (!member.permissions.has(PermissionsBitField.Flags.MuteMembers) || over5000Clan)) { // must have global role (must have role)
//       await member.roles.add(roleId);
//       await sleep(100);
//     }
//   } catch (error) {
//     console.log(`${error}: Couldn't fetch user ${discordId}, do not give any roles`);
//   }
// }



// function sleep(ms) {
//   return new Promise(resolve => setTimeout(resolve, ms));
// }

// module.exports = { updateMemberClanRoles };