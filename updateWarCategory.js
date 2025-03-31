const API = require("./src/API.js");
const { QuickDB } = require("quick.db")
const path = require('path');
const fs = require('fs');

// Used to do automatic stats. Run when new clans wanted to add to it. 
async function updateWarCategory() {
  const dbPath = path.join(__dirname, `./guildData/722956243261456536.sqlite`);
  const db = new QuickDB({ filePath: dbPath });
  const clans = await db.get('clans') || {};

  for (const [clanTag, clanInfo] of Object.entries(clans)) {
    const abbreviation = clanInfo.abbreviation;
    // Fetch war trophies using the API
    let warTrophies;
    let clan;
    try {
      clan = await API.getClan(clanTag);
      warTrophies = clan.clanWarTrophies;
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
    console.log(`Set ${clan.name} war category to ${warCategory}`);
  }
}

// Call the function to update the war category for all clans
updateWarCategory().then(() => {
  console.log('War categories updated successfully.');
}).catch(error => {
  console.log('Error updating war categories:', error);
});