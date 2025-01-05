const { Events } = require('discord.js');

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member) {
    try {
      // Fetch and cache the new member
      await member.fetch();
      console.log(`Cached new member: ${member.user.tag} in guild: ${member.guild.id}`);
    } catch (error) {
      console.error(`Could not fetch new member ${member.id}:`, error);
    }
    console.log("New member joined, cached them...");
  }
};
