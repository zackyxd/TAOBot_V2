const API = require("../../API.js");
const { Events, ActivityType, EmbedBuilder } = require("discord.js");
const path = require('path');
const Database = require('better-sqlite3');
const { QuickDB } = require("quick.db")
const fs = require('fs');
const { createSuccessEmbed, createExistEmbed, createErrorEmbed, createMaintenanceEmbed } = require('../../utilities/embedUtility.js');

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    setInterval(() => checkClanChanges(client), 180000);
  }
}



async function checkClanChanges(client) {
  client.guilds.cache.forEach(async (guild) => {
    const dbPath = API.findFileUpwards(__dirname, `guildData/${guild.id}.sqlite`);
    const db = new QuickDB({ filePath: dbPath, timeout: 5000 });
    const clans = await db.get(`clans`);
    if (!clans) return;

    for (const clantag in clans) {
      let currentData = await API.getClan(clantag);
      let channelId = await db.get(`clans.${clantag}.clanlogsChannel`);
      const channel = guild.channels.cache.get(channelId);
      if (channel) {
        let { veryNewData, changes } = await checkForChanges(guild.id, clantag, currentData);
        if (veryNewData) {
          await channel.send({ embeds: [veryNewData] });
        }
        if (changes && changes.length > 0) {
          for (const embed of changes) {
            await channel.send({ embeds: [embed] });
          }
        }
      } else {
        console.log("no channel exist to send embeds for", clantag);
      }
    }


  });
}

async function checkForChanges(guild, clantag, currentData) {

  const dbPath = API.findFileUpwards(__dirname, `guildData/${guild}.sqlite`);
  const db = new QuickDB({ filePath: dbPath, timeout: 5000 });

  const previousData = await db.get(`clanData.${clantag}`);
  let changes = [];

  if (!previousData) {
    // no previous data, make it the new data
    await db.set(`clanData.${clantag}`, currentData);
    console.log("started previous data");
    console.log(clantag);
    let clanName = await API.getClan(clantag);
    return { veryNewData: createSuccessEmbed(`Successfully started clan logs for \`${clanName.name}\``), changes: [] };
  }


  let memberJoinLeaveEmbeds = await processMemberJoinLeave(db, previousData, currentData, clantag);
  if (memberJoinLeaveEmbeds) {
    changes = changes.concat(memberJoinLeaveEmbeds);
  }

  let memberRoleChangeEmbeds = await processMemberPromoDemo(db, previousData, currentData, clantag);
  if (memberRoleChangeEmbeds) {
    changes = changes.concat(memberRoleChangeEmbeds);
  }

  let warTrophyChangeEmbed = await processWarTrophyChange(previousData, currentData, clantag);
  if (warTrophyChangeEmbed) {
    changes = changes.concat(warTrophyChangeEmbed);
  }

  // Update the database with the current data
  if (changes.length !== 0) {
    await db.set(`clanData.${clantag}`, currentData);
    // console.log(changes);
  }
  return { changes: changes }
}



async function processMemberJoinLeave(db, previousData, currentData, clantag) {
  let changes = [];

  const previousMembers = previousData.memberList.map(member => member.tag);
  const currentMembers = currentData.memberList.map(member => member.tag);
  const membersJoined = currentMembers.filter(tag => !previousMembers.includes(tag));
  const membersLeft = previousMembers.filter(tag => !currentMembers.includes(tag));

  for (let tag of membersJoined) {
    const discordId = await db.get(`playertags.${tag}`)
    const member = currentData.memberList.find(member => member.tag === tag);
    let title, description, color;
    tag = (member.tag).substring(1);
    clantag = (clantag).substring(1);
    let role = getRoleDisplayName(member.role);
    let arenaName = member.arena.name.replace(/[!'.,]/g, '') // remove apostrophes
      .toLowerCase() // convert to lowercase
      .replace(/\s+/g, ''); // remove spaces
    let arenaIconId = await findEmojiId(arenaName);
    let badgeIdIcon = await getLink(currentData.badgeId + ".png");
    description = `**${role} joined!**\n`;
    description += `<:${arenaName}:${arenaIconId}>\`${member.trophies}\` [${member.name}](<https://royaleapi.com/player/${tag}>)`;
    color = 0x00FF00 || 0x000000; // Green
    try {
      const user = await client.users.fetch(discordId);
      const embed = new EmbedBuilder()
        .setAuthor({ name: `${currentData.name} (${currentData.members}/50)`, iconURL: badgeIdIcon, url: `https://royaleapi.com/clan/${clantag}/` })
        .setColor(color)
        //.setTitle(title)
        .setDescription(description)
        .setFooter({ text: user.username, iconURL: user.displayAvatarURL() })
        .setTimestamp();
      changes.push(embed);
    } catch (error) {
      const embed = new EmbedBuilder()
        .setAuthor({ name: `${currentData.name} (${currentData.members}/50)`, iconURL: badgeIdIcon, url: `https://royaleapi.com/clan/${clantag}/` })
        .setColor(color)
        //.setTitle(title)
        .setDescription(description)
        //.setFooter({ text: user.username, iconURL: user.displayAvatarURL() })
        .setTimestamp();
      changes.push(embed);
    }
  }

  for (let tag of membersLeft) {
    const discordId = await db.get(`playertags.${tag}`)
    const member = previousData.memberList.find(member => member.tag === tag);
    let title, description, color;
    tag = (member.tag).substring(1);
    clantag = (clantag).substring(1);
    let role = getRoleDisplayName(member.role);
    let arenaName = member.arena.name.replace(/[!'.,]/g, '') // remove apostrophes
      .toLowerCase() // convert to lowercase
      .replace(/\s+/g, ''); // remove spaces
    let arenaIconId = await findEmojiId(arenaName);
    let badgeIdIcon = await getLink(currentData.badgeId + ".png");
    description = `**${role} left!**\n`;
    description += `<:${arenaName}:${arenaIconId}>\`${member.trophies}\` [${member.name}](<https://royaleapi.com/player/${tag}>)`;
    color = 0xFF0000 || 0x000000; // Red
    try {
      const user = await client.users.fetch(discordId);
      const embed = new EmbedBuilder()
        .setAuthor({ name: `${currentData.name} (${currentData.members}/50)`, iconURL: badgeIdIcon, url: `https://royaleapi.com/clan/${clantag}/` })
        .setColor(color)
        //.setTitle(title)
        .setDescription(description)
        .setFooter({ text: user.username, iconURL: user.displayAvatarURL() })
        .setTimestamp();
      changes.push(embed);
    } catch (error) {
      const embed = new EmbedBuilder()
        .setAuthor({ name: `${currentData.name} (${currentData.members}/50)`, iconURL: badgeIdIcon, url: `https://royaleapi.com/clan/${clantag}/` })
        .setColor(color)
        //.setTitle(title)
        .setDescription(description)
        //.setFooter({ text: user.username, iconURL: user.displayAvatarURL() })
        .setTimestamp();
      changes.push(embed);
    }
  }

  return changes;
}

async function processMemberPromoDemo(db, previousData, currentData, clantag) {
  let changes = [];

  const previousMembers = previousData.memberList;
  const currentMembers = currentData.memberList;

  for (let currentMember of currentMembers) {

    const previousMember = previousMembers.find(member => member.tag === currentMember.tag);
    if (previousMember && previousMember.role !== currentMember.role) {
      const discordId = await db.get(`playertags.${currentMember.tag}`);
      let description, color;
      const cleantag = currentMember.tag.substring(1);
      const cleanClantag = clantag.substring(1);
      const role = getRoleDisplayName(currentMember.role);
      let arenaName = currentMember.arena.name.replace(/[!'.,]/g, '') // remove apostrophes
        .toLowerCase() // convert to lowercase
        .replace(/\s+/g, ''); // remove spaces
      let arenaIconId = await findEmojiId(arenaName);
      let badgeIdIcon = await getLink(currentData.badgeId + ".png");
      if (isPromotion(previousMember.role, currentMember.role)) {
        description = `**Promotion: ${getRoleDisplayName(previousMember.role)} → ${role}**\n`;
        description += `<:${arenaName}:${arenaIconId}>\`${currentMember.trophies}\` [${currentMember.name}](<https://royaleapi.com/player/${cleantag}>)`;
        color = 0x01ADFE || 0x000000; // Light blue for promotion
      } else {
        description = `**Demotion: ${getRoleDisplayName(previousMember.role)} → ${role}**\n`;
        description += `<:${arenaName}:${arenaIconId}>\`${currentMember.trophies}\` [${currentMember.name}](<https://royaleapi.com/player/${cleantag}>)`;
        color = 0xFE5201 || 0x000000; // Orange for demotion
      }

      // Ensure color is valid
      if (typeof color !== 'number' || isNaN(color)) {
        console.error(`Invalid color value: ${color}`);
        color = 0x000000; // Default to black if color is invalid
      }

      try {
        const user = await client.users.fetch(discordId);
        const embed = new EmbedBuilder()
          .setAuthor({ name: `${currentData.name} (${currentData.members}/50)`, iconURL: badgeIdIcon, url: `https://royaleapi.com/clan/${cleanClantag}/` })
          .setColor(color)
          .setDescription(description)
          .setFooter({ text: user.username, iconURL: user.displayAvatarURL() })
          .setTimestamp();
        changes.push(embed);
      } catch (error) {
        const embed = new EmbedBuilder()
          .setAuthor({ name: `${currentData.name} (${currentData.members}/50)`, iconURL: badgeIdIcon, url: `https://royaleapi.com/clan/${cleanClantag}/` })
          .setColor(color)
          .setDescription(description)
          .setTimestamp();
        changes.push(embed);
      }
    }
  }
  return changes;
}

async function processWarTrophyChange(previousData, currentData, clantag) {
  let changes = [];
  let description, color;
  const previousScore = previousData.clanWarTrophies;
  const currentScore = currentData.clanWarTrophies;
  let cleanClantag = clantag.substring(1);

  let scoreChange = currentScore - previousScore;

  if (scoreChange > 0) { // positive
    description = `**War Trophy Increase!**\n`;
    description += `<:currentTrophies:1192213718294085702>\`${previousScore}\` → <:currentTrophies:1192213718294085702>\`${currentScore}\``;
    color = 0x00FF00 || 0x000000; // Green
  }
  else if (scoreChange < 0) { // negative
    description = `**War Trophy Decrease!**\n`;
    description += `<:currentTrophies:1192213718294085702>\`${previousScore}\` → <:currentTrophies:1192213718294085702>\`${currentScore}\``;
    color = 0xFF0000 || 0x000000; // Red
  }
  else {
    return;
  }
  const badgeIdIcon = await getLink(currentData.badgeId + ".png");
  const embed = new EmbedBuilder()
    .setAuthor({ name: `${currentData.name}`, iconURL: badgeIdIcon, url: `https://royaleapi.com/clan/${cleanClantag}` })
    .setColor(color)
    //.setTitle(title)
    .setDescription(description)
    //.setFooter({ text: user.username, iconURL: user.displayAvatarURL() })
    .setTimestamp();
  changes.push(embed);
  return changes;
}

function isPromotion(oldRole, newRole) {
  const roles = ['member', 'elder', 'coLeader', 'leader'];
  const oldRoleIndex = roles.indexOf(oldRole);
  const newRoleIndex = roles.indexOf(newRole);
  return newRoleIndex > oldRoleIndex;
}

function getRoleDisplayName(role) {
  const roleMap = {
    member: "Member",
    elder: "Elder",
    coLeader: "Co-leader",
    leader: "Leader"
  };
  return roleMap[role] || "Unknown Role"; // Default to "Unknown Role" if the role is not found
}

async function getLink(key) {
  // Read the JSON file
  const data = fs.readFileSync('imageLinks.json');
  const imageLinks = JSON.parse(data);

  // Check if the key exists in the JSON object
  if (imageLinks.hasOwnProperty(key)) {
    return imageLinks[key]; // Return the link associated with the key
  } else {
    return 'Key not found'; // Key does not exist in the JSON object
  }
}

async function findEmojiId(nameLookingFor) {

  const emojiPath = path.join(__dirname, '..', '..', '..', `emojis.json`);
  let emojis = {}
  try {
    const data = fs.readFileSync(emojiPath, 'utf8');
    emojis = JSON.parse(data); // Parse the JSON string into an array
  } catch (err) {
    console.error('Error loading emojis:', err);
    return []; // Return an empty array in case of an error
  }

  let emojiId = emojis.find(emoji => {
    // Ensure both values are strings and trim any whitespace
    const emojiName = String(emoji.name).trim();
    const trimmedName = String(nameLookingFor).trim();

    return emojiName === trimmedName;
  })?.id;

  if (emojiId) {
    //console.log(`Found emoji ID: ${emojiId}`);
    return emojiId;
  } else {
    console.error(`Emoji not found for: ${nameLookingFor}`);
    return null;
  }
}