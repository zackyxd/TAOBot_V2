const API = require("./src/API.js");
const { QuickDB } = require("quick.db")
const path = require('path');
const fs = require('fs');

async function fixLinks() {
  const dbPath = path.join(__dirname, `./guildData/722956243261456536.sqlite`);
  const db = new QuickDB({ filePath: dbPath });
  const playertagsData = await db.get('playertags') || {}; // Get playertags
  const players = Object.keys(playertagsData);
  const usersData = await db.get(`users`) || {}; // Get users (has all their tags)
  const users = Object.keys(usersData);

  let membersFixed = 0;
  for (const user of users) {
    const userData = usersData[user];
    if (userData && userData.playertags.length < 1) {
      // console.log("has no playertags");
      continue;
    }

    for (const tag of userData.playertags) {
      let checkLink = await db.get(`playertags.${tag}`);
      if (!checkLink?.discordId) {
        // console.log(tag, "does not exist in the database with a discordId");
        await db.set(`playertags.${tag}.discordId`, user)
        console.log(tag, user);
        membersFixed++;
      }
    }
  }
  console.log("Members fixed users -> playertags:", membersFixed);




}

// Call the function to update the war category for all clans
fixLinks().then(() => {
  console.log('Players Posted.');
}).catch(error => {
  console.log('Couldnt get players:', error);
});