const { google } = require('googleapis');
const { oauth2 } = require('googleapis/build/src/apis/oauth2');
const sheets = google.sheets('v4');
const { OAuth2 } = google.auth;

async function readSheet() {

  const auth = new google.auth.GoogleAuth({
    keyFile: "statsCredentials.json",
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  // Create client instance for auth
  const client = await auth.getClient();

  // Instance of Google Sheets API
  const googleSheets = google.sheets({ version: 'v4', auth: client });

  const spreadsheetId = '1b8BgwkPZ2cUgUvy_2r5zISCSxG207qtIf7re3sVL8x0';
  // Get data about spreadsheet
  const metaData = await googleSheets.spreadsheets.get({
    auth,
    spreadsheetId,
  });

  // console.log(metaData);

  const response = await sheets.spreadsheets.values.get({
    auth,
    spreadsheetId,
    range: "'5k Averages'!A1:ZZ1000", // Adjust the range and sheet name as needed
  });

  const rows = response.data.values;
  if (rows.length) {
    // console.log('Data:', rows);
    return rows;
  } else {
    console.log('No data found.');
    return [];
  }

}



async function processPlayerData(playerId) {
  let count = 0;
  const rows = await readSheet();
  for (const row of rows) {
    if (row[0] === playerId) {
      const playertag = row[0];
      const playerName = row[1];
      const lastClan = row[2];
      const fameAverage = parseFloat(row[3]);
      const fameData = row.slice(4, row.length);
      console.log(`Row: ${row}`);
      console.log(`Fame Data: ${fameData}`);
      const last3Wars = [];

      console.log(fameData.length);
      for (let i = 0; i < fameData.length; i += 2) {
        const fame = parseInt(fameData[i]);
        const attacks = parseInt(fameData[i + 1]);
        if (!isNaN(fame) && !isNaN(attacks)) {
          last3Wars.push({ fame, attacks });
          if (last3Wars.length >= 3) break;
        }
      }
      console.log(`Player ID: ${playerId}`);
      console.log(`Player Name: ${playerName}`);
      console.log(`Last Clan: ${lastClan}`);
      console.log(`Fame Average: ${fameAverage}`);
      console.log('Last 3 Wars:', last3Wars);

      console.log(`Player: ${playerName}, Last Clan: ${lastClan}, Last 3 Wars:`, last3Wars);
      return;
    }
    count++;
  }
  console.log(`Player ID ${playerId} not found.`);
  console.log(count);
}

processPlayerData("U8Q9VULCQ");