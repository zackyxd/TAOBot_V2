// findAttacksRunner.js
const { findAttacks } = require("./findPlayerAttacksInClans.js"); // Your existing findAttacks logic

process.on("message", async (msg) => {
  // console.log("📨 Received message in child process:", msg); // <-- Add this
  if (msg.command === "runFindAttacks") {
    try {
      await findAttacks(msg.client); // must support this format!
      process.exit(0);
    } catch (err) {
      console.error("Error in forked findAttacks:", err);
      process.exit(1);
    }
  }
});
