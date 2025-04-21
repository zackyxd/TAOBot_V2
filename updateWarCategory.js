const API = require("./src/API.js");
const { QuickDB } = require("quick.db")
const path = require('path');
const fs = require('fs');

// Used to do automatic stats. Run when new clans wanted to add to it. 
async function updateWarCategory(guildId) {
  const dbPath = path.join(__dirname, `./guildData/${guildId}.sqlite`);
  const db = new QuickDB({ filePath: dbPath });
  const clans = await db.get('clans') || {};

  for (const [clanTag, clanInfo] of Object.entries(clans)) {
    const abbreviation = clanInfo.abbreviation;
    // Fetch war trophies using the API
    let warTrophies;
    let previousTrophies;
    let currentTrophies;
    let findClan;
    try {
      let previousClan = await API.getRiverRaceLog(clanTag); // Check river race log for how many trophies they were at last war
      const standings = previousClan.items[0].standings;
      findClan = standings.find(standing => standing.clan.tag === clanTag);
      previousTrophies = findClan.trophyChange;

      let currentClan = await API.getClan(clanTag);
      currentTrophies = currentClan.clanWarTrophies;

      warTrophies = currentTrophies - previousTrophies;
    } catch (error) {
      console.log(`Error fetching war trophies for clan ${abbreviation}:`, error);
      continue;
    }

    // Determine the war category based on war trophies
    let warCategory;
    if (warTrophies >= 5000) {
      warCategory = '5k';
    } else if (warTrophies >= 4000 && warTrophies < 5000) {
      warCategory = '4k';
    } else {
      warCategory = 'below4k';
    }

    // Update the clan information with the new warCategory
    clanInfo.warCategory = warCategory;
    await db.set(`clans.${clanTag}`, clanInfo);
    console.log(`Set ${findClan.clan.name} war category to ${warCategory}`);
  }
}

module.exports = {
  updateWarCategory
}