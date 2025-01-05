require('dotenv/config');
const { AttachmentBuilder, EmbedBuilder } = require("discord.js");
const key = process.env.CR_KEY;
const fs = require("fs");
const path = require('path');
const axios = require("axios");
const { createSuccessEmbed, createExistsEmbed, createErrorEmbed, createMaintenanceEmbed } = require('./utilities/embedUtility.js');


async function fetchData(url, filename, print) {
  try {
    const response = await axios(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${key}`,
      },
    });

    if (response.status !== 200) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = response.data;
    const dataString = JSON.stringify(data, null, 2);

    print = false;
    if (data && print === true) {
      const filePath = path.join(__dirname, '../JSON_DATA', `${filename}.json`);
      fs.writeFile(filePath, dataString, (err) => {
        if (err) {
          console.error(`Error writing ${filename}.json`, err);
        } else {
          console.log(`Wrote to ${filename}.json`);
        }
      });
    }
    return data;

  } catch (error) {
    console.log(`Fetch failed with ${url}: ${error.message}`);
    if (error.response) {
      console.log(`Error response data: ${JSON.stringify(error.response.data, null, 2)}`);
      const statusCode = error.response.status;
      if (statusCode === 404) {
        return 404;
      } else if (statusCode === 503) {
        return 503;
      }
    } else {
      console.error(`Error: ${error.message}`);
    }
    return null; // Return null if there's an error without a response
  }
}


async function getPlayer(playertag) {
  // console.log(playertag);
  if (playertag.charAt(0) !== '#') playertag = '#' + playertag;
  let playerURL = `https://proxy.royaleapi.dev/v1/players/${encodeURIComponent(playertag)}`;
  let playerData = await fetchData(playerURL, "PlayerData", true);
  if (playerData === 404) {
    return createErrorEmbed(`This playertag ${playertag} does not exist.`)
  }
  else if (playerData === 503) {
    return createMaintenanceEmbed();
  }

  // let errorCode = API.checkStatus(null, playerData, playertag);
  // //console.log(errorCode);
  // if (!errorCode.status) {
  //   // return errorCode, if error code, interaction already replied
  //   return errorCode;
  // }
  // Embed stuff
  return playerData;
}

async function getPlayerBattleHistory(playertag) {
  // console.log(playertag);
  if (playertag.charAt(0) !== '#') playertag = '#' + playertag;
  let playerURL = `https://proxy.royaleapi.dev/v1/players/${encodeURIComponent(playertag)}/battlelog`;
  let playerData = await fetchData(playerURL, "PlayerBattleLog", true);
  if (playerData === 404) {
    return createErrorEmbed(`This playertag ${playertag} does not exist.`)
  }
  else if (playerData === 503) {
    return createMaintenanceEmbed();
  }

  // let errorCode = API.checkStatus(null, playerData, playertag);
  // //console.log(errorCode);
  // if (!errorCode.status) {
  //   // return errorCode, if error code, interaction already replied
  //   return errorCode;
  // }
  // Embed stuff
  return playerData;
}

async function getClan(clantag) {
  if (clantag.charAt(0) !== '#') clantag = '#' + clantag;
  const clanURL = `https://proxy.royaleapi.dev/v1/clans/${encodeURIComponent(clantag)}`;
  const clanData = await fetchData(clanURL, "ClanData", true);
  if (clanData === 404) {
    return createErrorEmbed(`This clantag ${clantag} does not exist.`)
  }
  else if (clanData === 503) {
    return createMaintenanceEmbed();
  }
  return clanData;
}

async function getCurrentRiverRace(clantag) {
  if (clantag.charAt(0) !== '#') clantag = '#' + clantag;
  const raceURL = `https://proxy.royaleapi.dev/v1/clans/${encodeURIComponent(clantag)}/currentriverrace`;
  const raceData = await fetchData(raceURL, "CurrentRiverRaceData", true);
  if (raceData === 404) {
    return createErrorEmbed(`This clantag ${clantag} does not exist.`)
  }
  else if (raceData === 503) {
    return createMaintenanceEmbed();
  }
  return raceData;
}

async function getRiverRaceLog(clantag) {
  if (clantag.charAt(0) !== '#') clantag = '#' + clantag;
  const raceURL = `https://proxy.royaleapi.dev/v1/clans/${encodeURIComponent(clantag)}/riverracelog`;
  const raceData = await fetchData(raceURL, "RiverRaceLog", true);
  if (raceData === 404) {
    return createErrorEmbed(`This clantag ${clantag} does not exist.`)
  }
  else if (raceData === 503) {
    return createMaintenanceEmbed();
  }
  return raceData;
}

function findFileUpwards(startDir, fileName) {
  let currentDir = startDir;

  while (currentDir !== path.parse(currentDir).root) {
    const filePath = path.join(currentDir, fileName);
    // console.log(`Checking: ${filePath}`);
    if (fs.existsSync(filePath)) {
      // console.log(`Found: ${filePath}`);
      return filePath;
    }
    currentDir = path.dirname(currentDir);
  }

  // console.log(`File not found: ${fileName}`);
  return null;
}

module.exports = {
  fetchData,
  getPlayer,
  getClan,
  getPlayerBattleHistory,
  getCurrentRiverRace,
  getRiverRaceLog,
  findFileUpwards
};