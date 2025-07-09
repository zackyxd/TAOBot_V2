const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, Embed, PermissionsBitField } = require("discord.js");
const path = require('path');
const Database = require('better-sqlite3');
const { QuickDB } = require("quick.db");
const fs = require('fs');
const API = require("../../API.js");
const { createSuccessEmbed, createExistEmbed, createErrorEmbed, createMaintenanceEmbed } = require('../../utilities/embedUtility.js');
const cron = require('node-cron');


module.exports = {
  data: new SlashCommandBuilder()
    .setName("lurkers-remove")
    .setDescription("Remove lurkers from server"),
  // .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "lurkers-remove") return;
    await interaction.deferReply();
    const dbPath = API.findFileUpwards(__dirname, `guildData/${interaction.guild.id}.sqlite`);
    const db = new QuickDB({ filePath: dbPath });
    let members = await interaction.guild.members.fetch();


    const clans = await db.get(`clans`);
    if (!clans) return;
    let activePlayers = new Map();
    for (const clantag in clans) {
      let currentRace = await API.getCurrentRiverRace(clantag);
      let raceHistory = await API.getRiverRaceLog(clantag);
      let clan = await API.getClan(clantag);

      for (const participant of currentRace.clan.participants) {
        activePlayers.set(participant.tag, { name: participant.name, playertag: participant.tag, status: "active" });
      }

      for (const member of clan.memberList) {
        activePlayers.set(member.tag, { name: member.name, playertag: member.tag, status: "active" });
      }

      for (const item of raceHistory.items) {
        for (let i = 0; i < item.standings.length; i++) {
          let standing = item.standings[i];
          if (standing.clan.tag === clantag) {
            for (const participant of standing.clan.participants) {
              activePlayers.set(participant.tag, { name: participant.name, playertag: participant.tag, status: "active" });
            }
          }
        }
      }
    }
    // console.log(activePlayers)
    // console.log(activePlayers.size);

    // Convert Set to Array

    // const activePlayersArray = Array.from(activePlayers);
    // fs.writeFile("checkingJson.json", JSON.stringify(activePlayersArray, null, 2), (err) => {
    //   if (err) throw err;
    // })


    let discordNotLinkedAccounts = new Set();
    let noActivePlayertags = new Set();
    // let REMOVETHESEROLES = ['1294378323472027761', '1183818611899506838', '1184508781728641024']; // clamfam, ac, a1. MY SERVER
    // let KEEPTHESEROLES = ['1201503459476770836'] // attacking late

    // 1057168619936682055

    let AFAMROLES = ['1326036972447465504', '1317270669301518490', '1315095350830170242', '1301318655698669679', '1290776557492633770', '1270127103156949122', '783177344293797908', '1142977903353659402', '1180208506666766397', '1351568649667874886', '1344413844205867008', '1363890379375775895', '1115372668464676985', '968260581415071764', '1227750844179415060', '1138989851631423538', '1138989813224185866', '1138989747423940668', '1138989457018732635', '1138989373145235539', '1026642626943926312', '1225966572003135488', '952807483561365565', '891452315100409898', '1225622163529138286', '991283111889469500', '1266748354562359349', '945216955319713813', '1225620336721264723', '891457598774185994']
    // Chessmaster, Crypto Degen, 2025 Tourny, shiraz, Anti shock unit, 2024 tourny, addictedclamfam, practice, addictedtreesquad, malaka, addicted 2 math, addicted tiger, al2w, afh-l2w, ac-l2w, ap-l2w, a3-l2w, coc-l2w, a1-l2w, afh, ac-temp, a3, ac, ap-temp, ap, coc-temp, coc, a1-temp, a1
    // AFAM SERVER


    let AMROLES = ['1315730046761304177', '1315730003836801074', '1315729971251249206', '1315729944202055811', '1315729905291366533', '1315729869619068961', '1315729337680400464']
    // Afterburn, aftertaste, afterparty, afterglow, afterlife, aftershock, aftermath
    // AM ROLES:
    let REMOVETHESEROLES = AFAMROLES.concat(AMROLES);

    // Clamfam, practice, tiger, afh l2w, ac-l2w, ap-l2w, a3-l2w, coc-l2w, a1-l2w, clash of clamz, afh, a3, ac, ap, coc, a1, 

    let KEEPTHESEROLES = ['783176199471235103', '1022712022623854612', '1281673819328745564', '816320265692381244', '783175208621441075', '893867446358925332', '915056810812121108', '832649149501145138', '927924207780773958', '950900876321652826', '1337135805914943611', '1278400718159483045', '1051604116939485215', '851189946320814091', '826948115566690318', '826949890101346304', '1057168619936682055', '1241347491761492139', '1097719170365403166', '1031618743337492541', '892061240334110720', '824842742731374634', '824789784018550785', '871427279954251816', '1031652332766773310', '1090751319758885035', '1125500364431573043', '1245873914740215838', '1145827928987414628', '1019726871262416938', '838412429347127316', '1142945014675144836', '1352379496187301898', '918200826714026054']
    // leader, admin, management, db, coleader, trial-co, 1v1 champ, 2v2 champ, final fantasy champ,  march madness winner, deck specialist, VIP, US colo record (L2), 9k colo, 8k-club, 7k-club, a1-legacy, hayday, og-crew, final basketball champ, vacay, reset-warrior, glitch-mafia, final football, final basketball, final baseball, brawl-stars, squad busters, final football 2023, fishermen, visitor, deck master, moco, clamz

    let currentPlayerNumber = 0;
    for (const member of members.values()) {
      currentPlayerNumber++;
      console.log(`Checking player #${currentPlayerNumber}`)
      if (!REMOVETHESEROLES.some(role => member.roles.cache.has(role))) {
        continue;
      }
      let link = await db.get(`users.${member.id}`);
      if (!link) {
        discordNotLinkedAccounts.add(member.id);
        continue;
      }

      // console.log(link);

      // Check if playertags is empty or none linked, inactive
      if (!link.playertags || link.playertags.length === 0) {
        noActivePlayertags.add(member.id);
        continue;
      }

      // Check playertags if a part of active players
      let isActive = false; // Flag to check if any playertag is active

      for (const playertag of link.playertags) {
        if (activePlayers.has(playertag)) {
          isActive = true;
          break; // Stop checking as soon as an active playertag is found
        }
      }

      if (!isActive) {
        noActivePlayertags.add(member.id); // Add member only if none of the playertags are active
      }
    }


    let combinedInactiveIds = new Set([...discordNotLinkedAccounts, ...noActivePlayertags]);
    // console.log(combinedInactiveIds);
    const excludeUserIds = await getExcludedUserIds(API.findFileUpwards(__dirname, 'doNotRemoveThesePlayers.txt'));
    combinedInactiveIds = new Set([...combinedInactiveIds].filter(id => !excludeUserIds.has(id)))
    // console.log(combinedInactiveIds);

    let membersToRemove = [];
    for (const memberId of combinedInactiveIds) {
      let member = await interaction.guild.members.fetch(memberId);
      membersToRemove.push(member);
      delay(100);
    }

    membersToRemove.sort((a, b) => a.joinedTimestamp - b.joinedTimestamp);
    await writeMembers(interaction, membersToRemove, REMOVETHESEROLES, KEEPTHESEROLES);


    // const activePlayersArray = Array.from(activePlayers);
    // await interaction.editReply("Check the file for who it would remove");
  }
}

async function getExcludedUserIds(filepath) {
  const data = await fs.promises.readFile(filepath, 'utf-8');
  return new Set(data.split('\n').map(id => id.trim()).filter(Boolean)); // Parse IDs, trim whitespace, filter empty
}

async function writeMembers(interaction, sortedMembers, REMOVETHESEROLES, KEEPTHESEROLES) {

  let goodbye = "";
  let goodbye2 = "";
  let number = 0;
  let notCounted = 0;
  let memberCount = 0;
  for (const member of sortedMembers) {
    memberCount++;
    if (KEEPTHESEROLES.some(role => member.roles.cache.has(role))) {
      notCounted++;
      continue;
    }
    let removeRoleCount = 0;
    for (const roleId of REMOVETHESEROLES) {
      if (member.roles.cache.has(roleId)) {
        // await member.roles.remove(roleId); // Comment this line to remove roles
        removeRoleCount++;
        delay(150)
      }
    }

    number++;
    goodbye2 += `#${number}. ${member.nickname || member.user.globalName} | ${member.user.username}. Joined ${new Date(member.joinedTimestamp).toLocaleDateString()}, Removing ${removeRoleCount} role(s). id: ${member.id}\n`

  }

  goodbye = `INACTIVE\n${sortedMembers.length - notCounted} players have roles when they aren't active.\nWill be removing roles from these people below:\n\n`;
  goodbye += goodbye2;

  fs.writeFile("deletedTheseMembers.txt", goodbye, (err) => {
    if (err) throw err;
  })
  const attachment = new AttachmentBuilder(API.findFileUpwards(__dirname, "deletedTheseMembers.txt"));
  await interaction.editReply({ files: [attachment] })
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}