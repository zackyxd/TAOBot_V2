const API = require("../API.js");
const { Events, ActivityType, EmbedBuilder, Embed, PermissionsBitField, AttachmentBuilder } = require("discord.js");
const path = require('path');
const { QuickDB } = require("quick.db")
const fs = require('fs');
const { createSuccessEmbed, createExistEmbed, createErrorEmbed, createMaintenanceEmbed } = require('./embedUtility.js');
const cron = require('node-cron');
const { keep } = require("googleapis/build/src/apis/keep/index.js");
require('dotenv/config');

// await db.set(`users.${discordId}.keepRoles`, toggle);

const removeMemberClanRoles = async (client) => {
  console.log("STARTING ROLE REMOVALS...");

  // REMEMBER TO ENABLE/DISABLE ROLE REMOVAL
  fs.writeFileSync('lost_roles.txt', 'These players lost these roles:\n');
  fs.writeFileSync('lost_all_roles.txt', 'LOST ALL CLAN ROLES, CHECK THEM:\n');

  let allGuildPromises = [];
  for (const guild of client.guilds.cache.values()) {
    allGuildPromises.push(processGuild(guild));
  }
  await Promise.all(allGuildPromises);

  console.log("Finished removing all unneeded roles");
}

const processGuild = async (guild) => {
  try {
    const dbPath = API.findFileUpwards(__dirname, `guildData/${guild.id}.sqlite`);
    const db = new QuickDB({ filePath: dbPath, timeout: 5000 });
    const clans = await db.get(`clans`);
    if (!clans) return;

    let clanRoles = Object.values(clans).map(clan => clan.roleId).filter(roleId => roleId);
    let keptRoles = new Set(); // Set to track unqiue  players to keep roles
    const clanPromises = [];
    for (const clantag in clans) {
      clanPromises.push(processClan(clans[clantag], clantag, db, guild, clanRoles, keptRoles));
    }
    await Promise.all(clanPromises);

    await outputKeptRoles(keptRoles); // finish writing to file
    let coleaderChannelId = await db.get(`guilds.${guild.id}.coleaderChannelId`);
    if (coleaderChannelId) {
      const lostRoles = new AttachmentBuilder(API.findFileUpwards(__dirname, "lost_roles.txt"));
      const lostAllRoles = new AttachmentBuilder(API.findFileUpwards(__dirname, "lost_all_roles.txt"));
      const channel = guild.channels.cache.get(coleaderChannelId);
      if (channel) {
        await channel.send({ files: [lostRoles, lostAllRoles] });
      }
    }
  } catch (error) {
    console.error(`Error processing guild ${guild.id}:`, error);
  }
};

const processClan = async (clan, clantag, db, guild, clanRoles, keptRoles) => {
  try {
    let roleId = await db.get(`clans.${clantag}.roleId`);
    let participantSet = await getClanParticipants(clantag);
    let clanMembersSet = await getClanMembers(clantag);

    let allActiveMembersSet = new Set([...participantSet, ...clanMembersSet]);
    const discordIds = await findDiscordIds(allActiveMembersSet, db);

    await guild.members.fetch();
    const role = guild.roles.cache.get(roleId);
    if (role) {
      // Fetch all members with role
      const membersWithRole = guild.members.cache.filter(member => member.roles.cache.has(roleId));
      let membersLostRole = [];
      let membersDoNotLose = [];
      for (const [memberId, member] of membersWithRole) {
        if (!discordIds.has(member.id)) {
          // Remove role if member not in discordIds set
          let keepRoles = await db.get(`users.${member.id}.keepRoles`);
          if (keepRoles === true) {
            // console.log(`Do not remove roles from: `, member.nickname || member.user.username);
            keptRoles.add(`${member.nickname || member.user.username} : ${member.id}`)
            continue;
          }
          await member.roles.remove(roleId);
          await sleep(75); // sleep for api purposes
          membersLostRole.push({ username: member.nickname || member.user.username, discordId: member.id })
          console.log(`Removed "${role.name}" role for:`, member.nickname || member.user.username);
          if (checkIfLostAllRoles(member, clanRoles)) {
            await outputLostAllRoles(member);
          }
        }
      }
      membersLostRole.sort((a, b) => a.username.localeCompare(b.username));
      membersDoNotLose.sort((a, b) => a.username.localeCompare(b.username));
      await outputLostRoles(clan.clanName, role.name, membersLostRole, membersDoNotLose);
    }
  } catch (error) {
    console.error("Error processing clan for role removal", error);
  }
}


function checkIfLostAllRoles(member, clanRoles) {
  const memberRoles = member.roles.cache.map(role => role.id);
  const hasClanRole = memberRoles.some(roleId => clanRoles.includes(roleId));

  if (!hasClanRole) {
    console.log(`Member ${member.nickname || member.user.username} has lost all their roles`);
    return true;
  }
  return false;
}

async function outputLostAllRoles(member) {
  let lostAllRoles = `${member.nickname || member.user.username} : ${member.id}\n`;
  fs.appendFile('lost_all_roles.txt', lostAllRoles, (err) => {
    if (err) {
      console.log('Error logging role changes:', err);
    }
  });
}




async function outputLostRoles(clanName, roleName, members) {

  // Members here is custom object rather than discord member object
  let removedEntry = "";
  if (members.length !== 0) {
    removedEntry += `Clan: ${clanName}, Role: ${roleName}, Roles removed: ${members.length}\n` + members.map(member => `${member.username} : ${member.discordId}`).join('\n') + `\n\n\n`;
  }
  else {
    removedEntry = `Clan: ${clanName}, Role: ${roleName}, No roles removed\n\n`
  }

  fs.appendFile(`lost_roles.txt`, removedEntry, (err) => {
    if (err) {
      console.log(`Error logging role changes:`, err);
    }
    else {
      console.log("Logged role changes for clan:", clanName);
    }
  })
}

async function outputKeptRoles(keptRoles) {

  let keptEntry = "";
  if (keptRoles.length !== 0) {
    keptEntry = `Members that do not lose roles: ${keptRoles.size}\n` + [...keptRoles].join('\n')
    keptEntry += `\nTo add members to this list, do "/keep-roles @user true".\n\n`
  }
  else {
    keptEntry = `No members are set to keep  clan roles. Do "/keep-roles @user true" to enable them.\n`
  }

  fs.appendFile(`lost_roles.txt`, keptEntry, (err) => {
    if (err) {
      console.log(`Error logging kept roles:`, err);
    }
  })
}

async function getClanMembers(clantag) {
  if (clantag.charAt(0) !== "#") clantag = "#" + clantag;
  let clanData = await API.getClan(clantag);
  if (!clanData || !clanData.memberList) {
    console.error(`Error: No member list found for clantag: ${clantag} for removing roles`);
    return null;
  }
  let memberList = clanData.memberList;
  let memberSet = new Set();
  for (member of memberList) {
    memberSet.add(member.tag);
  }
  return memberSet;
}


// Return the participants of the river race log as a set
async function getClanParticipants(clantag) {
  if (clantag.charAt(0) !== "#") clantag = "#" + clantag;
  let rrLog = await API.getRiverRaceLog(clantag);
  if (!rrLog) {
    console.error(`Error: No member list found for clantag: ${clantag} for removing roles`);
    return null;
  }

  let lastRace = rrLog?.items[0];
  let standings = lastRace.standings;
  if (!standings) {
    console.log("No standings found for role removal for clantag:", clantag);
    return null;
  }

  let indexOfClantag = standings.findIndex(standing => standing.clan.tag === clantag);
  let participants = standings[indexOfClantag].clan.participants;
  if (!participants) {
    console.log("No participants found for role removal for clantag:", clantag);
    return null;
  }

  let participantSet = new Set;
  for (participant of participants) {
    if (participant.fame > 0) {
      participantSet.add(participant.tag);
    }
  }
  return participantSet;
}

async function findDiscordIds(playertagsSet, db) {
  // console.log("Finding discord ids...");
  let discordIds = new Set();
  for (let tag of playertagsSet) {
    let playertagData = await db.get(`playertags.${tag}`);
    if (!playertagData || !playertagData.discordId) continue;

    let discordId = playertagData.discordId;
    discordIds.add(discordId);
  }
  return discordIds;
}


function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { removeMemberClanRoles };