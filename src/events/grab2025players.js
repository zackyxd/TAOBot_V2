// const { Client, Events } = require('discord.js');
// const fs = require('fs');
// const path = require('path');
// module.exports = {
//   name: Events.ClientReady,
//   once: true,
//   async execute(client) {
//     console.log(`Finding message!`);

//     const messageId = '1328348592876032063';
//     const channelId = '783182044150235157';
//     const targetEmoji = '✅';

//     try {
//       const channel = await client.channels.fetch(channelId);
//       const message = await channel.messages.fetch(messageId);
//       const players = [];
//       const reaction = message.reactions.cache.get(targetEmoji);
//       if (reaction) {
//         let users = await reaction.users.fetch({ limit: 100 });
//         users.forEach(user => {
//           if (!players.includes(user.id)) {
//             players.push(user.id);
//           }
//         });

//         while (users.size === 100) {
//           users = await reaction.users.fetch({ limit: 100, after: users.last().id });
//           users.forEach(user => {
//             if (!players.includes(user.id)) {
//               players.push(user.id);
//             }
//           });
//         }
//       }

//       const folderPath = path.join(__dirname, 'afamtourney');

//       if (!fs.existsSync(folderPath)) {
//         fs.mkdirSync(folderPath);
//       }
//       // Write the IDs to a file in the created folder
//       const filePath = path.join(folderPath, 'afam2025tournament.txt');
//       fs.writeFile(filePath, players.join('\n'), (err) => {
//         if (err) {
//           console.error('Error writing to file:', err);
//         } else {
//           console.log(`${players.length} Player IDs have been saved to afam2025tournament.txt`);
//         }
//       });
//     } catch (error) {
//       console.error('Error fetching message or reactions:', error);
//     }

//   }
// }
