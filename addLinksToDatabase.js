

const { QuickDB } = require(`quick.db`);
const fs = require('fs');
const path = require('path');
const dbPath = path.join(__dirname, `guildData/722956243261456536.sqlite`);
const db = new QuickDB({ filePath: dbPath });
const data = JSON.parse(fs.readFileSync('722956243261456536.json', 'utf8'));
// console.log(data);
async function moveDataToDb() {
  let count = 1;
  try {
    for (const discordId in data.playersId) {
      const playerData = data.playersId[discordId];
      console.log(`Processing discordId: ${discordId}`, playerData);
      await db.set(`users.${discordId}`, {
        "playertags": playerData.playertags || []
      });

      if (playerData.playertags) {
        for (const playertag of playerData.playertags) {
          await db.set(`playertags.${playertag}`, {
            "discordId": discordId
          })
        }
      }
      // Verify the data in the database
      // const usersData = await db.get('users');
      // const playertagsData = await db.get('playertags');
      // console.log('Users data:', usersData);
      // console.log('Playertags data:', playertagsData);
      console.log(count);
      count++;
    }
    console.log('Data moved successfully!');
  } catch (error) {
    console.error('Error moving data:', err);
  }
}

// Call the async function
moveDataToDb();