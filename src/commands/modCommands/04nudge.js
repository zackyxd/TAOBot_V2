const API = require("../../API.js");
const { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, AttachmentBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, Embed } = require("discord.js");
const path = require('path');
const Database = require('better-sqlite3');
const { QuickDB } = require("quick.db")
const fs = require('fs');
const { createSuccessEmbed, createExistEmbed, createErrorEmbed, createMaintenanceEmbed } = require('../../utilities/embedUtility.js');
const moment = require('moment-timezone');
const { send } = require("process");
const { time } = require("console");


module.exports = {

  data: new SlashCommandBuilder()
    .setName("nudge")
    .setDescription("Nudge a clan using their abbreviation")
    .addStringOption(option =>
      option.setName("abbreviation")
        .setDescription("What is the abbreviation used for the clan?")
        .setRequired(true)
    )
    .addBooleanOption(option =>
      option.setName("all")
        .setDescription("Nudge everyone in this clan")
        .setRequired(false)
    )
    .addBooleanOption(option =>
      option.setName("skip")
        .setDescription("Bypass the block on nudging if nudging too frequently")
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers),

  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "nudge") return;
    await interaction.deferReply({ ephemeral: true });
    let abbrev = interaction.options.get("abbreviation").value.toLowerCase();
    let all = interaction.options?.getBoolean('all') ?? false;
    let skip = interaction.options?.getBoolean('skip') ?? false;

    const dbPath = path.join(__dirname, `../../../guildData/${interaction.guild.id}.sqlite`);
    const db = new QuickDB({ filePath: dbPath });
    const clans = await db.get(`clans`) || {};
    const clantag = Object.keys(clans).find(tag => clans[tag].abbreviation === abbrev);

    if (!clantag) {
      await interaction.editReply({ embeds: [createErrorEmbed(`The abbreviation \`${abbrev}\` is not linked to the server.`)] });
      return;
    }

    try {
      let checkClan = await API.getCurrentRiverRace(clantag);
      if (checkClan.data) {
        interaction.editReply({ embeds: [checkClan] })
      }
      let clan = await db.get(`clans.${clantag}`);
      let currentTime = moment().tz("America/Phoenix");
      if (clan && clan.nudgeSettings && clan.nudgeSettings.lastNudged) {
        let lastNudged = moment(clan.nudgeSettings.lastNudged);
        let timeDifference = currentTime.diff(lastNudged, 'minutes');
        // console.log(timeDifference);
        if (timeDifference < 60 && !skip) {
          await interaction.editReply({ embeds: [createErrorEmbed(`The last nudge happened ${timeDifference} minutes ago. Please use the option \`skip:true\` if you would like to bypass this message.\nThis message only appears if you nudge within an hour of the last nudge.`)] });
          return;
        }
      }
      let sendMessage;
      if (all) {
        sendMessage = await getAttacksAll(clantag, db, interaction.user.id, interaction);
      }
      else {
        sendMessage = await getAttacksNoPings(clantag, db, interaction.user.id, interaction)
      }
      if (!sendMessage) {
        interaction.editReply({ embeds: [createErrorEmbed("Error sending message, try again.")] });
        return;
      }
      await interaction.channel.send(sendMessage);
      await interaction.editReply("Sending Nudge");

      if (!clan.nudgeSettings) {
        clan.nudgeSettings = { lastNudged: currentTime };
      } else {
        clan.nudgeSettings = { ...clan.nudgeSettings, lastNudged: currentTime };
      }
      await db.set(`clans.${clantag}`, clan);



    } catch (error) {
      console.log(error);
    }

  }
}


async function getAttacksAll(clantag, db, nudgerDiscordId, interaction) {
  try {
    let attackData = await API.getCurrentRiverRace(clantag);
    let clanData = await API.getClan(clantag);
    if (attackData.data || !clanData) return;

    let pointsToday = attackData.clan.fame || 0;
    // console.log(pointsToday);
    let membersInClan = {};
    let membersNotInClan = {};
    for (const member of clanData.memberList) {
      membersInClan[member.tag] = { name: member.name, role: member.role };
    }
    // Arrays to hold sorted players
    let attacksUsed = { 0: [], 1: [], 2: [], 3: [], 4: [] };
    // let thrownAttacks = { 0: [], 1: [], 2: [], 3: [], 4: [] };
    let cantAttackAnymore = {};
    let cantAttackAnymoreBool = false;
    let decksRemaining = 200;
    let playersRemaining = 50;
    let cantUseAttacks = {};
    let cantUseAttacksBool = false;
    let whichDayType = attackData.periodType;

    let warWeek = attackData.sectionIndex + 1; // week
    let periodIndex = attackData.periodIndex; // day 


    if (whichDayType === 'warDay') {
      whichDayType = `War Week ${warWeek}`;
      oldWarDay = (periodIndex % 7) - 2;
    }
    else if (whichDayType === 'training') {
      whichDayType = `Training Week`
      oldWarDay = (periodIndex % 7) + 1;
    }
    else {
      whichDayType = `Colosseum`;
      oldWarDay = (periodIndex % 7) - 2;
    }
    for (const participant of attackData.clan.participants) {
      let member = await db.get(`playertags.${participant.tag}`);
      console.log(member);
      if (!member) {
        member = {
          playerName: participant.name,
          playertag: participant.tag,
          day1DecksUsed: 0,
          day2DecksUsed: 0,
          day3DecksUsed: 0,
          day4DecksUsed: 0,
          currentDay: oldWarDay
        };
        switch (oldWarDay) {
          case 1:
            member.day1DecksUsed = participant.decksUsedToday;
            break;
          case 2:
            member.day2DecksUsed = participant.decksUsedToday;
            break;
          case 3:
            member.day3DecksUsed = participant.decksUsedToday;
            break;
          case 4:
            member.day4DecksUsed = participant.decksUsedToday;
            break;
          default:
          // console.error("Invalid war day");
        }
      }
      else {
        member.playertag = participant.tag;
      }

      let attacksUsedToday = -999; // member.attacksUsed (for today)
      switch (oldWarDay) {
        case 1:
          attacksUsedToday = member.day1DecksUsed;
          break;
        case 2:
          attacksUsedToday = member.day2DecksUsed;
          break;
        case 3:
          attacksUsedToday = member.day3DecksUsed;
          break;
        case 4:
          attacksUsedToday = member.day4DecksUsed;
          break;
      }


      // console.log(member);
      if (!membersInClan[participant.tag]) {

        // Negative Attacks and not in clan, means no attacks and left partials
        if (participant.decksUsedToday - attacksUsedToday < 0 && participant.decksUsedToday !== 0) {
          // console.log("This bitch left partials and cant complete them.");
          let attacksLeftOver = 4 - participant.decksUsedToday;
          member.attacksNotUsed = attacksLeftOver;
          cantAttackAnymore[participant.tag] = member;
          cantAttackAnymoreBool = true;
          playersRemaining--;
          decksRemaining -= participant.decksUsedToday;
          continue;
        }
        else if (participant.decksUsedToday > 0 && participant.decksUsedToday < 4) {
          decksRemaining -= participant.decksUsedToday;
          playersRemaining--;
          member.outOfClan = true;
          attacksUsed[attacksUsedToday].push(member);
        }
        else if (participant.decksUsedToday === 4) {
          decksRemaining -= participant.decksUsedToday;
          playersRemaining--;
        }

        membersNotInClan[participant.tag] = member;
      }
      else {
        // console.log(member);
        member.role = membersInClan[participant.tag].role;

        // Currently in clan, but can't use all battles
        if (participant.decksUsedToday - attacksUsedToday < 0) {
          // console.log(participant.name);
          // console.log(attacksUsedToday - participant.decksUsedToday);
          let attacksLeftOver = attacksUsedToday - participant.decksUsedToday;
          member.attacksNotUsed = attacksLeftOver;
          cantUseAttacks[participant.tag] = member;
          cantUseAttacksBool = true;
          if (participant.decksUsedToday > 0) {
            decksRemaining -= participant.decksUsedToday;
            playersRemaining--;
          }
          continue;
          console.log(`Player ${member.playerName} attacked elsewhere, only has ${actualAttacksLeft} attacks available.`)
        }
        if (attacksUsedToday >= 0 && attacksUsedToday < 4) {
          attacksUsed[attacksUsedToday].push(member);
        }
        if (participant.decksUsedToday > 0) {
          decksRemaining -= participant.decksUsedToday;
          playersRemaining--;
        }
      }
    }

    for (let attacksLeft in attacksUsed) {
      attacksUsed[attacksLeft] = sortList(attacksUsed[attacksLeft]);
    }

    // Make reply below
    let reply = `You have attacks left in ${clanData.name} by <@${nudgerDiscordId}> (Everyone nudged)\n\n`;
    let outOfClan = false;
    let partials = false;
    let replaceMe = false;
    for (let attacks = 0; attacks <= 4; attacks++) {
      if (attacksUsed.hasOwnProperty(attacks)) {
        let players = [];
        for (let player of attacksUsed[attacks]) {

          const playerData = await db.get(`playertags.${player.playertag}`);
          const discordAccount = await db.get(`users.${player.discordId}`);
          // console.log(discordAccount);
          if (playerData && playerData.attacksUsed === 4) {
            // No attacks left at all
            continue;
          }

          if (discordAccount && discordAccount['replace-me'] === true) {
            const channel = interaction.channel;
            const member = await interaction.guild.members.fetch(playerData.discordId);

            if (channel && member && channel.permissionsFor(member).has(PermissionsBitField.Flags.ViewChannel)) {
              players.push(`* ${player.playerName} ⚠️`); // ping players who havent pinged
            }
            else {
              players.push(`* ${player.playerName} ⚠️🙈`); // ping players who havent pinged
            }
            replaceMe = true;
            continue;
          }
          else if (discordAccount && discordAccount['attacking-late'] === true) {
            const channel = interaction.channel;
            const member = await interaction.guild.members.fetch(playerData.discordId);
            if (channel && member && channel.permissionsFor(member).has(PermissionsBitField.Flags.ViewChannel)) {
              players.push(`* <@${playerData.discordId}> (${player.playerName})`); // ping players who havent pinged
            }
            else {
              players.push(`* <@${playerData.discordId}> (${player.playerName}) 🙈`); // ping players who havent pinged
            }
            continue;
          }

          else if (discordAccount) {
            const channel = interaction.channel;
            const member = await interaction.guild.members.fetch(playerData.discordId);
            if (channel && member && channel.permissionsFor(member).has(PermissionsBitField.Flags.ViewChannel)) {
              players.push(`* <@${playerData.discordId}> (${player.playerName})`); // ping players who havent pinged
            }
            else {
              players.push(`* <@${playerData.discordId}> (${player.playerName}) 🙈`); // ping players who havent pinged
            }
            continue;
          }


          if (player.outOfClan === true && !discordAccount) {
            players.push(`* ${player.playerName} (not linked) ❌`); // show who attacked and left clan
            outOfClan = true;
            continue;
          }
          else if (player.outOfClan === true && discordAccount) {
            const channel = interaction.channel;
            const member = await interaction.guild.members.fetch(playerData.discordId);
            if (channel && member && channel.permissionsFor(member).has(PermissionsBitField.Flags.ViewChannel)) {
              players.push(`* <@${playerData.discordId}> (${player.playerName}) ❌`); // ping players who havent pinged
            }
            else {
              players.push(`* <@${playerData.discordId}> (${player.playerName}) ❌🙈`); // ping players who havent pinged
            }
            outOfClan = true;
            continue;
          }

          players.push(`* ${player.playerName} (not linked)`); // show who hasn't attacked yet and is in clan

        }

        if (players.length > 0) {
          if (attacks === 3) {
            reply += `__**${4 - attacks} Attack**__ (${attacksUsed[attacks].length})\n` + players.join('\n') + '\n\n';
          } else {
            reply += `__**${4 - attacks} Attacks**__ (${attacksUsed[attacks].length})\n` + players.join('\n') + '\n\n';
          }
        }
      }
    }

    if (Object.keys(cantAttackAnymore).length !== 0 || Object.keys(cantUseAttacks).length !== 0) {
      reply += `**Attention:**\n`;
      for (const tag in cantAttackAnymore) {
        if (cantAttackAnymore.hasOwnProperty(tag)) {
          const member = cantAttackAnymore[tag];
          reply += `* ${member.playerName} (-${member.attacksNotUsed}) 🤬\n`;
        }
      }
      for (const tag in cantUseAttacks) {
        if (cantUseAttacks.hasOwnProperty(tag)) {
          const member = cantUseAttacks[tag];
          reply += `* ${member.playerName} (-${member.attacksNotUsed}) 💀\n`;
        }
      }
      reply += "\n";
    }

    reply += `<:peopleLeft:1188128630270861492> ${playersRemaining}\n<:decksLeft:1187752640508088370> ${decksRemaining}\n`

    if (outOfClan) {
      reply += `❌ is out of clan.\n`
    }
    if (partials) {
      reply += `🛑 has partials in diff. clan.\n`
    }
    if (cantAttackAnymoreBool) {
      reply += `🤬 Used attacks elsewhere.\n`;
    }
    if (cantUseAttacksBool) {
      reply += `💀 In clan, can't use # attacks.\n`
    }
    if (replaceMe) {
      reply += `⚠️ Needs to be replaced.\n`
    }
    // console.log(reply);
    return reply;
  }
  catch (error) {
    console.log(error);
  }
}

async function getAttacksNoPings(clantag, db, nudgerDiscordId, interaction) {
  try {
    let attackData = await API.getCurrentRiverRace(clantag);
    let clanData = await API.getClan(clantag);
    if (attackData.data || !clanData) return;

    let pointsToday = attackData.clan.fame || 0;
    // console.log(pointsToday);
    let membersInClan = {};
    let membersNotInClan = {};
    for (const member of clanData.memberList) {
      membersInClan[member.tag] = { name: member.name, role: member.role };
    }
    // Arrays to hold sorted players
    let attacksUsed = { 0: [], 1: [], 2: [], 3: [], 4: [] };
    let thrownAttacks = { 0: [], 1: [], 2: [], 3: [], 4: [] };
    let cantAttackAnymore = {};
    let cantAttackAnymoreBool = false;
    let decksRemaining = 200;
    let playersRemaining = 50;
    let cantUseAttacks = {};
    let cantUseAttacksBool = false;
    let whichDayType = attackData.periodType;

    let warWeek = attackData.sectionIndex + 1; // week
    let periodIndex = attackData.periodIndex; // day 


    if (whichDayType === 'warDay') {
      whichDayType = `War Week ${warWeek}`;
      oldWarDay = (periodIndex % 7) - 2;
    }
    else if (whichDayType === 'training') {
      whichDayType = `Training Week`
      oldWarDay = (periodIndex % 7) + 1;
    }
    else {
      whichDayType = `Colosseum`;
      oldWarDay = (periodIndex % 7) - 2;
    }
    for (const participant of attackData.clan.participants) {
      let member = await db.get(`playertags.${participant.tag}`);
      if (!member) {
        member = {
          playerName: participant.name,
          playertag: participant.tag,
          day1DecksUsed: 0,
          day2DecksUsed: 0,
          day3DecksUsed: 0,
          day4DecksUsed: 0,
          currentDay: oldWarDay
        };
        switch (oldWarDay) {
          case 1:
            member.day1DecksUsed = participant.decksUsedToday;
            break;
          case 2:
            member.day2DecksUsed = participant.decksUsedToday;
            break;
          case 3:
            member.day3DecksUsed = participant.decksUsedToday;
            break;
          case 4:
            member.day4DecksUsed = participant.decksUsedToday;
            break;
          default:
          // console.error("Invalid war day");
        }
      }
      else {
        member.playertag = participant.tag;
      }

      let attacksUsedToday = -999; // member.attacksUsed (for today)
      switch (oldWarDay) {
        case 1:
          attacksUsedToday = member.day1DecksUsed;
          break;
        case 2:
          attacksUsedToday = member.day2DecksUsed;
          break;
        case 3:
          attacksUsedToday = member.day3DecksUsed;
          break;
        case 4:
          attacksUsedToday = member.day4DecksUsed;
          break;
      }


      // console.log(member);
      if (!membersInClan[participant.tag]) {

        // Negative Attacks and not in clan, means no attacks and left partials
        if (participant.decksUsedToday - attacksUsedToday < 0 && participant.decksUsedToday !== 0) {
          // console.log("This bitch left partials and cant complete them.");
          let attacksLeftOver = 4 - participant.decksUsedToday;
          member.attacksNotUsed = attacksLeftOver;
          cantAttackAnymore[participant.tag] = member;
          cantAttackAnymoreBool = true;
          playersRemaining--;
          decksRemaining -= participant.decksUsedToday;
          continue;
        }
        else if (participant.decksUsedToday > 0 && participant.decksUsedToday < 4) {
          decksRemaining -= participant.decksUsedToday;
          playersRemaining--;
          member.outOfClan = true;
          attacksUsed[attacksUsedToday].push(member);
        }
        else if (participant.decksUsedToday === 4) {
          decksRemaining -= participant.decksUsedToday;
          playersRemaining--;
        }

        membersNotInClan[participant.tag] = member;
      }
      else {
        // console.log(member);
        member.role = membersInClan[participant.tag].role;

        // Currently in clan, but can't use all battles
        if (participant.decksUsedToday - attacksUsedToday < 0) {
          // console.log(participant.name);
          // console.log(attacksUsedToday - participant.decksUsedToday);
          let attacksLeftOver = attacksUsedToday - participant.decksUsedToday;
          member.attacksNotUsed = attacksLeftOver;
          cantUseAttacks[participant.tag] = member;
          cantUseAttacksBool = true;
          if (participant.decksUsedToday > 0) {
            decksRemaining -= participant.decksUsedToday;
            playersRemaining--;
          }
          continue;
          console.log(`Player ${member.playerName} attacked elsewhere, only has ${actualAttacksLeft} attacks available.`)
        }
        if (attacksUsedToday >= 0 && attacksUsedToday < 4) {
          attacksUsed[attacksUsedToday].push(member);
        }
        if (participant.decksUsedToday > 0) {
          decksRemaining -= participant.decksUsedToday;
          playersRemaining--;
        }
      }
    }

    for (let attacksLeft in attacksUsed) {
      attacksUsed[attacksLeft] = sortList(attacksUsed[attacksLeft]);
    }

    // Make reply below
    let reply = `You have attacks left in ${clanData.name} by <@${nudgerDiscordId}>\n\n`;
    // let checkNudgeMessage = await db.get(`clans.${clantag}`);
    let outOfClan = false;
    let partials = false;
    let replaceMe = false;

    let currentTime = moment().tz("America/Phoenix");
    let startTime = moment().tz("America/Phoenix").hour(21).minute(1); // If it's after this time, keep pinging
    let endTime = moment().tz("America/Phoenix").hour(1).minute(1); // If it's before this time, keep pinging
    // Adjust the end time to the next day if it's before the start time
    if (endTime.isBefore(startTime)) {
      endTime.add(1, 'day');
    }
    for (let attacks = 0; attacks <= 4; attacks++) {
      if (attacksUsed.hasOwnProperty(attacks)) {
        let players = [];
        for (let player of attacksUsed[attacks]) {

          const playerData = await db.get(`playertags.${player.playertag}`);
          const discordAccount = await db.get(`users.${player.discordId}`);
          // console.log(discordAccount);
          if (playerData && playerData.attacksUsed === 4) {
            // No attacks left at all
            continue;
          }

          if (player.role === 'coLeader' || player.role === 'leader') {
            players.push(`* **${player.playerName}**`);
            continue;
          }
          if (discordAccount && discordAccount['replace-me'] === true) {
            const channel = interaction.channel;
            const member = await interaction.guild.members.fetch(playerData.discordId);

            if (channel && member && channel.permissionsFor(member).has(PermissionsBitField.Flags.ViewChannel)) {
              players.push(`* ${player.playerName} ⚠️`); // ping players who havent pinged
            }
            else {
              players.push(`* ${player.playerName} ⚠️🙈`); // ping players who havent pinged
            }
            replaceMe = true;
            continue;
          }
          else if (discordAccount && discordAccount['attacking-late'] === true) {
            const channel = interaction.channel;
            const member = await interaction.guild.members.fetch(playerData.discordId);

            if (currentTime.isBetween(startTime, endTime)) {
              if (channel && member && channel.permissionsFor(member).has(PermissionsBitField.Flags.ViewChannel)) {
                if (channel && member && channel.permissionsFor(member).has(PermissionsBitField.Flags.ViewChannel)) {
                  players.push(`* <@${playerData.discordId}> (${player.playerName})`); // ping players who havent pinged
                }
                else {
                  players.push(`* <@${playerData.discordId}> (${player.playerName}) 🙈`); // ping players who havent pinged
                }
              }
              continue;
            }
            else {
              if (channel && member && channel.permissionsFor(member).has(PermissionsBitField.Flags.ViewChannel)) {
                players.push(`* (${player.playerName})`); // ping players who havent pinged
              }
              else {
                players.push(`* ${player.playerName} ✅🙈`); // ping players who havent pinged
              }
              continue;
            }
          }
          else if (discordAccount) {
            const channel = interaction.channel;
            const member = await interaction.guild.members.fetch(playerData.discordId);
            if (channel && member && channel.permissionsFor(member).has(PermissionsBitField.Flags.ViewChannel)) {
              players.push(`* <@${playerData.discordId}> (${player.playerName})`); // ping players who havent pinged
            }
            else {
              players.push(`* <@${playerData.discordId}> (${player.playerName}) 🙈`); // ping players who havent pinged
            }
            continue;
          }


          if (player.outOfClan === true && !discordAccount) {
            players.push(`* ${player.playerName} (not linked) ❌`); // show who attacked and left clan
            outOfClan = true;
            continue;
          }
          else if (player.outOfClan === true && discordAccount) {
            const channel = interaction.channel;
            const member = await interaction.guild.members.fetch(playerData.discordId);
            if (channel && member && channel.permissionsFor(member).has(PermissionsBitField.Flags.ViewChannel)) {
              players.push(`* <@${playerData.discordId}> (${player.playerName}) ❌`); // ping players who havent pinged
            }
            else {
              players.push(`* <@${playerData.discordId}> (${player.playerName}) ❌🙈`); // ping players who havent pinged
            }
            outOfClan = true;
            continue;
          }

          players.push(`* ${player.playerName} (not linked)`); // show who hasn't attacked yet and is in clan

        }

        if (players.length > 0) {
          if (attacks === 3) {
            reply += `__**${4 - attacks} Attack**__ (${attacksUsed[attacks].length})\n` + players.join('\n') + '\n\n';
          } else {
            reply += `__**${4 - attacks} Attacks**__ (${attacksUsed[attacks].length})\n` + players.join('\n') + '\n\n';
          }
        }
      }
    }

    if (Object.keys(cantAttackAnymore).length !== 0 || Object.keys(cantUseAttacks).length !== 0) {
      reply += `**Attention:**\n`;
      for (const tag in cantAttackAnymore) {
        if (cantAttackAnymore.hasOwnProperty(tag)) {
          const member = cantAttackAnymore[tag];
          reply += `* ${member.playerName} (-${member.attacksNotUsed}) 🤬\n`;
        }
      }
      for (const tag in cantUseAttacks) {
        if (cantUseAttacks.hasOwnProperty(tag)) {
          const member = cantUseAttacks[tag];
          reply += `* ${member.playerName} (-${member.attacksNotUsed}) 💀\n`;
        }
      }
      reply += "\n";
    }

    reply += `<:peopleLeft:1188128630270861492> ${playersRemaining}\n<:decksLeft:1187752640508088370> ${decksRemaining}\n`

    if (outOfClan) {
      reply += `❌ is out of clan.\n`
    }
    if (partials) {
      reply += `🛑 has partials in diff. clan.\n`
    }
    if (cantAttackAnymoreBool) {
      reply += `🤬 Used attacks elsewhere.\n`;
    }
    if (cantUseAttacksBool) {
      reply += `💀 In clan, can't use # attacks.\n`
    }
    if (replaceMe) {
      reply += `⚠️ Needs to be replaced.\n`
    }
    // console.log(reply);
    return reply;
  }
  catch (error) {
    console.log(error);
  }
}


function sortList(list) {
  return list.sort((a, b) => {
    if (!a.playerName) {
      console.warn(`Missing playerName for participant: ${JSON.stringify(a)}`);
    }
    if (!b.playerName) {
      console.warn(`Missing playerName for participant: ${JSON.stringify(b)}`);
    }

    var nameA = (a.playerName || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    var nameB = (b.playerName || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

    if (nameA < nameB) return -1;
    if (nameA > nameB) return 1;
    return 0;
  });
}