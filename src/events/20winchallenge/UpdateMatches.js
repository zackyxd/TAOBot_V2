const API = require("../../API.js");
const { Events, ActivityType, EmbedBuilder, Embed, AttachmentBuilder } = require("discord.js");
const path = require('path');
const { QuickDB } = require("quick.db")
const fs = require('fs');
const { createSuccessEmbed, createExistEmbed, createErrorEmbed, createMaintenanceEmbed } = require('../../utilities/embedUtility.js');
const cron = require('node-cron');
require('dotenv/config');
const createMatchImg = require("./createMatchImg.js");
const { channel } = require("diagnostics_channel");




const post20WinsEmbeds = async (client) => {
  cron.schedule(`*/10 * * * *`, async function () {
    postWins(client);
  })
}

const RATE_LIMIT = 20;
const RATE_LIMIT_INTERVAL = 1500;
const writeQueue = [];
let isProcessingQueue = false;

async function processQueue2() {
  if (isProcessingQueue || writeQueue.length === 0) return;

  isProcessingQueue = true;
  const { db, key, value, resolve, reject } = writeQueue.shift();

  try {
    await db.set(key, value);
    resolve();
  } catch (error) {
    reject(error);
  } finally {
    isProcessingQueue = false;
    processQueue2(); // Process the next item in the queue
  }
}


function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const fetchPlayerBattleHistory = async (playertag) => {
  const battles = await API.getPlayerBattleHistory(playertag);
  return battles;
}


function rateLimit(fn, limit, interval) {
  let queue = [];
  let inProgress = 0;

  const processQueue = () => {
    if (queue.length === 0) return;
    if (inProgress >= limit) return;

    const { resolve, args } = queue.shift();
    inProgress++;
    fn(...args)
      .then(resolve)
      .finally(() => {
        inProgress--;
        if (queue.length > 0) {
          setTimeout(processQueue, interval / limit);
        }
      });
  };

  return (...args) => {
    return new Promise((resolve) => {
      queue.push({ resolve, args });
      processQueue();
    })
  }
}

const rateLimitedFetchPlayerBattleHistory = rateLimit(fetchPlayerBattleHistory, RATE_LIMIT, RATE_LIMIT_INTERVAL);

async function postWins(client) {
  console.log("Checking 20 challenge winners...");
  const dbPath = API.findFileUpwards(__dirname, `guildData/722956243261456536.sqlite`);
  const db = new QuickDB({ filePath: dbPath, timeout: 120000 });
  const playertags = await db.get(`playertags`);
  if (!playertags) return;
  console.log("Grabbing playertags with discordId...");
  const playertagKeys = Object.keys(playertags).filter(playertag => playertags[playertag].hasOwnProperty('discordId'));

  for (let i = 0; i < playertagKeys.length; i += RATE_LIMIT) {
    const batch = playertagKeys.slice(i, i + RATE_LIMIT);
    const promises = batch.map(playertag => rateLimitedFetchPlayerBattleHistory(playertag));
    const results = await Promise.allSettled(promises);
    const successfulResults = results.filter(result => result.status === 'fulfilled').map(result => result.value);
    // console.log("Grabbed results...working to check users");
    successfulResults.forEach((battles, index) => {
      const playertag = batch[index];
      checkBattles(db, client, battles)
    })
    console.log("Processed a batch...");
    await sleep(300);
  }
  console.log("FINISHED PROCESSING 20 WINS");
}

async function checkBattles(db, client, battlesArray) {
  const reversedBattlesArray = battlesArray.reverse();
  // console.log("Came to check battles...");
  for (const battle of reversedBattlesArray) {
    if (battle.challengeWinCountBefore && battle.challengeWinCountBefore >= 16) {
      const matchKey = `${battle.team[0].tag}-${battle.battleTime.replace('.000Z', '')}`;
      const existingMatch = await db.get(`matches.${matchKey}`);
      if (!existingMatch) {
        if (checkIfMatchWon(battle.team[0].crowns, battle.opponent[0].crowns)) {
          await checkAndAddUniqueMatch(db, client, battle.team[0].tag, battle);
          // console.log(`${battle.team[0].name} has wins: `, battle.challengeWinCountBefore + 1);
        }
        else {
          let wins = checkIfMatchWon(battle.team[0].crowns, battle.opponent[0].crowns) ? battle.challengeWinCountBefore + 1 : battle.challengeWinCountBefore;
          const matchInfo = {
            wins: wins,
            crowns: `${battle.team[0].crowns} v ${battle.opponent[0].crowns}`,
            oppTag: battle.opponent[0].tag,
            oppName: battle.opponent[0].name,
            teamTag: battle.team[0].tag,
            teamName: battle.team[0].name,
          };
          await addToQueue(db, `matches.${matchKey}`, matchInfo);
        }
      }
    }
  }
}

function checkIfMatchWon(teamCrowns, oppCrowns) {
  return teamCrowns > oppCrowns;
}

async function addToQueue(db, key, value) {
  return new Promise((resolve, reject) => {
    writeQueue.push({ db, key, value, resolve, reject });
    processQueue2(); // Start processing if not already doing so
  });
}

async function checkAndAddUniqueMatch(db, client, playertag, battle) {
  // console.log("Adding battle to database...");
  const matchKey = `${playertag}-${battle.battleTime.replace('.000Z', '')}`;
  try {
    let wins = checkIfMatchWon(battle.team[0].crowns, battle.opponent[0].crowns) ? battle.challengeWinCountBefore + 1 : battle.challengeWinCountBefore;
    const matchInfo = {
      wins: wins,
      crowns: `${battle.team[0].crowns} v ${battle.opponent[0].crowns}`,
      oppTag: battle.opponent[0].tag,
      oppName: battle.opponent[0].name,
      teamTag: battle.team[0].tag,
      teamName: battle.team[0].name,
    };



    const buffer = await createMatchImg(battle, wins);
    let guilds = await db.get(`guilds`);
    let channelId = guilds['722956243261456536']['20wins'];
    const channel = client.channels.cache.get(channelId);

    const guild = client.guilds.cache.get('722956243261456536');
    if (!guild) {
      console.error(`Guild with ID 722956243261456536 not found.`);
      return;
    }

    const memberId = await db.get(`playertags.${playertag}.discordId`);
    await addToQueue(db, `matches.${matchKey}`, matchInfo);
    console.log(`Fetching member with ID: ${memberId}`);
    const member = await guild.members.fetch(memberId);

    if (!member) {
      console.error(`Member with ID ${memberId} not found, added their match still.`);
      return;
    }

    console.log(`Fetched member: ${member.displayName}`);

    let globalRole = guilds['722956243261456536']['globalRole'];
    if (!member.roles.cache.has(globalRole)) {
      console.log(`${member.displayName} does not have the required role.`);
      return;
    }

    const attachment = new AttachmentBuilder(buffer, { name: 'match.png' })
    // await channel.send(text);
    await channel.send({ files: [attachment] })

  } catch (error) {
    console.error(`Error setting match for ${matchKey}:`, error);
  }
}



module.exports = { post20WinsEmbeds }