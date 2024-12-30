const API = require("../API.js");
const { Events, ActivityType, EmbedBuilder, Embed, PermissionsBitField } = require("discord.js");
const path = require('path');
const { QuickDB } = require("quick.db")
const fs = require('fs');
const { createSuccessEmbed, createExistEmbed, createErrorEmbed, createMaintenanceEmbed } = require('./embedUtility.js');
const cron = require('node-cron');
require('dotenv/config');


const updateMemberClanRoles = async (client) => {
  let allGuildPromises = [];
  for (const guild of client.guilds.cache.values()) {
    allGuildPromises.push(processGuild(guild));
  }
  await Promise.all(allGuildPromises);
}

const processGuild = async (guild) => {
  try {
    const dbPath = API.findFileUpwards(__dirname, `guildData/${guild.id}.sqlite`);
    const db = new QuickDB({ filePath: dbPath, timeout: 5000 });
    const clans = await db.get(`clans`);
    if (!clans) return;

    let grabGlobalRole = await db.get(`guilds.${guild.id}`);
    let grabRole = grabGlobalRole?.globalRole;
    console.log(`Processing guild: ${guild.id}`);

    const clanPromises = [];
    for (const clantag in clans) {
      clanPromises.push(processClan(clantag, db, grabRole, guild));
    }

    await Promise.all(clanPromises);
  } catch (error) {
    console.error(`Error processing guild ${guild.id}:`, error);
  }
};

const processClan = async (clantag, db, grabRole, guild) => {
  try {
    console.log(`Second loop, starting clantag: ${clantag}`);
    let roleId = await db.get(`clans.${clantag}.roleId`);
    if (!roleId) {
      console.log(`No roleId found for clantag: ${clantag}, skipping...`);
      return;
    }
    console.log("Updating clan member roles for:", clantag);

    const membersInClan = await getClanMembers(clantag); // grab members in clan
    const discordIds = await findDiscordIds(membersInClan, guild.id); // grab discord ids of members if available
    await addMissingClanRole(discordIds, roleId, grabRole, guild);
    console.log(`Finished processing check-roles for clantag: ${clantag}`);
  } catch (error) {
    console.error("Error processing clan:", clantag, error);
  }
};


// Get clan members array from api
async function getClanMembers(clantag) {
  if (clantag.charAt(0) !== "#") clantag = "#" + clantag;
  let clanData = await API.getClan(clantag);
  // console.log("Fetched member list for:", clantag);
  return clanData.memberList;
}

// find discord ids in my database, return as set for unique people
async function findDiscordIds(members, guildId) {
  // console.log("Finding discord ids...");
  const dbPath = API.findFileUpwards(__dirname, `guildData/${guildId}.sqlite`);
  const db = new QuickDB({ filePath: dbPath, timeout: 5000 });
  let discordIds = new Set();
  for (let member of members) {
    let memberDiscordId = await db.get(`playertags.${member.tag}`);
    if (!memberDiscordId || !memberDiscordId.discordId) continue;
    discordIds.add(memberDiscordId.discordId);
  }
  return discordIds;
}


async function addMissingClanRole(discordIds, roleId, mustHaveRole, guild) {
  let rolePromises = [];
  for (const discordId of discordIds) {
    rolePromises.push(addRoleToMember(discordId, roleId, mustHaveRole, guild));
  }
  await Promise.all(rolePromises);
}

const addRoleToMember = async (discordId, roleId, mustHaveRole, guild) => {
  try {
    let member = await guild.members.fetch(discordId);
    if (mustHaveRole && member.roles.cache.has(mustHaveRole)) {
      await member.roles.add(roleId);
      await sleep(100);
    }
  } catch (error) {
    console.log(`Couldn't fetch user ${discordId}, do not give any roles`);
  }
}



function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { updateMemberClanRoles };