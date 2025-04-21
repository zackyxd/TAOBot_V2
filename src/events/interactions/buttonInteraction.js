const API = require("../../API.js");
const { QuickDB } = require("quick.db");
const path = require('path');
const fs = require('fs');
const { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField, Embed, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js')
module.exports = {
  async handleButton(interaction) {

    if (interaction.customId.startsWith('openModal')) {
      const modal = new ModalBuilder()
        .setCustomId('linkplayers')
        .setTitle('Link your CR Account here')

      // Add components
      const playertagInput = new TextInputBuilder()
        .setCustomId('playertag')
        .setLabel("What is your CR playertag?")
        .setStyle(TextInputStyle.Short)
        .setMaxLength(15)
        .setMinLength(3)
        .setPlaceholder("#123ABC")
        .setRequired(true);

      const passwordInput = new TextInputBuilder()
        .setCustomId('password')
        .setLabel("What is the password?")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const firstRow = new ActionRowBuilder().addComponents(playertagInput);
      const secondRow = new ActionRowBuilder().addComponents(passwordInput);
      modal.addComponents(firstRow, secondRow);
      await interaction.showModal(modal);
    }

    if (interaction.customId.startsWith(`removeLink`)) {
      await interaction.deferUpdate()
      const member = await interaction.guild.members.fetch(interaction.user.id);
      if (!member.permissions.has([PermissionsBitField.Flags.MuteMembers])) {
        await interaction.followUp({ content: `You cannot use this button, it's only allowed for coleaders`, ephemeral: true });
        return;
      }
      const parts = interaction.customId.split('_');
      const playertag = parts[1];
      const discordId = parts[2];
      const dbPath = API.findFileUpwards(__dirname, `guildData/${interaction.guild.id}.sqlite`);
      const db = new QuickDB({ filePath: dbPath });
      try {
        // Get player data (discordId);
        let playerData = await db.get(`playertags.${playertag}`);
        if (!playerData.discordId) {
          console.log("Didn't have discordId");
          return;
        }
        let discordId = playerData.discordId;
        // Remove the discordId from the player data
        delete playerData.discordId;
        // Update the player data in the database
        await db.set(`playertags.${playertag}`, playerData);


        // Get the user data and remove playertag from user's playertags list
        let userData = await db.get(`users.${discordId}`);
        if (userData && userData.playertags) {
          userData.playertags = userData.playertags.filter(tag => tag !== playertag);
          await db.set(`users.${discordId}`, userData);
        }

        let unlinked = new ButtonBuilder()
          .setCustomId('unlinked')
          .setLabel('Unlinked!')
          .setDisabled(true)
          .setStyle(ButtonStyle.Secondary);

        const unlinkedRow = new ActionRowBuilder().addComponents(unlinked);

        await interaction.message.edit({ components: [unlinkedRow] })

      } catch (error) {
        console.error('Error unlinking playertag:', error);
        await interaction.followUp({ embeds: [createErrorEmbed('An error occurred while linking the playertag. Please try again later.')] });
        return;
      }
    }

    if (interaction.customId.startsWith('switchName')) {
      await interaction.deferUpdate();
      const member = await interaction.guild.members.fetch(interaction.user.id);
      if (!member.permissions.has([PermissionsBitField.Flags.MuteMembers])) {
        await interaction.followUp({ content: `You cannot use this button, it's only allowed for coleaders`, ephemeral: true });
        return;
      }

      try {
        const parts = interaction.customId.split('_');
        console.log(parts);
        const changeNameToThis = parts[1];
        const discordId = parts[2];
        const guild = interaction.guild.id;
        const user = await interaction.guild.members.fetch(discordId);
        try {
          await user.setNickname(changeNameToThis);
        } catch (error) {
          await interaction.channel.send({ embeds: [createErrorEmbed(`Cannot change this users name.`)] });
          return;
        }

        // Update the message with the new components
        await interaction.channel.send({ embeds: [createSuccessEmbed(`Name changed to: ${changeNameToThis}`)] });

      } catch (error) {
        console.log("Couldn't change name", error);
      }
    }

    if (interaction.customId.startsWith('confirmRoles')) {
      await interaction.deferUpdate();
      const member = await interaction.guild.members.fetch(interaction.user.id);
      if (!member.permissions.has([PermissionsBitField.Flags.MuteMembers])) {
        await interaction.followUp({ content: `You cannot use this button, it's only allowed for coleaders`, ephemeral: true });
        return;
      }
      const dbPath = API.findFileUpwards(__dirname, `guildData/${interaction.guild.id}.sqlite`);
      const db = new QuickDB({ filePath: dbPath });
      let roles5k = [
        // my server
        // { id: '1262436128074760192', threshold: 220 },
        // { id: '1262415129669144628', threshold: 210 },
        // { id: '1262415183901364225', threshold: 200 },
        // { id: '1279636890080772106', threshold: 190 },

        // tao
        { id: '1136109175026487357', threshold: 220 },
        { id: '1056433107596742667', threshold: 210 },
        { id: '1056433100420284437', threshold: 200 },
        { id: '1056432944408973372', threshold: 190 },
      ];

      let roles4k = [

        // tao
        { id: '1280599632262729779', threshold: 220 },
        { id: '1056432341322584104', threshold: 210 },
        { id: '1056432268345876610', threshold: 200 },
        { id: '1056428973418098708', threshold: 190 },


        // my server
        // { id: '1279868941379833856', threshold: 210 },
        // { id: '1279868899466285166', threshold: 200 },
        // { id: '1279868840712474645', threshold: 190 },
      ]

      const [action, clan] = interaction.customId.split(`_`);

      if (action === 'confirmRoles' && clan !== "colo") {
        const clans = await db.get('clans') || {};
        const clantag = Object.keys(clans).find(tag => clans[tag].abbreviation === clan);
        const warCategory = clans[clantag]?.warCategory;
        console.log(`CONFIRM ROLES FOR: ${clantag}`);
        // Determine which role array to use based on the war category
        let roles;
        if (warCategory === '5k') {
          roles = roles5k;
        } else if (warCategory === '4k') {
          roles = roles4k;
        } else {
          console.log("Unknown war category");
          return;
        }

        let confirmationData = await db.get(`confirmationData.${clan}`) || { count: 0, users: [] };
        if (!confirmationData.users.includes(interaction.user.id)) {
          confirmationData.count += 1;
          confirmationData.users.push(interaction.user.id);
          await db.set(`confirmationData.${clan}`, confirmationData);
          // fetch og message
          const message = await interaction.channel.messages.fetch(interaction.message.id);
          const embed = message.embeds[0];

          let updatedEmbed = new EmbedBuilder(embed).setFooter({ text: `${embed.footer.text.split('|')[0].trim()} | (${confirmationData.count}/2)` })
          // Edit the message with the updated embed
          await message.edit({ embeds: [updatedEmbed] });
        }
        if (confirmationData.count < 2) {
          return;
        }

        const message = await interaction.channel.messages.fetch(interaction.message.id);
        const embed = message.embeds[0];

        let updatedEmbed = new EmbedBuilder(embed).setFooter({ text: `${embed.footer.text.split('|')[0].trim()} | Sending...` })
        // Edit the message with the updated embed
        await message.edit({ embeds: [updatedEmbed], components: [] });


        const roleGroups = await db.get(`roleAssignments.${clan}`);
        if (!roleGroups) {
          console.log("No role Groups");
          return;
        }


        let memberMentions = [];


        for (const [roleId, players] of Object.entries(roleGroups)) {
          for (const player of players) {
            try {
              let member = await interaction.guild.members.fetch(player.discordId);
              // Check if the member has a higher role
              let hasHigherRole = roles.some(role => member.roles.cache.has(role.id) && role.threshold > player.fameAverage);
              if (!hasHigherRole) {
                // Remove lower roles
                for (const role of roles) {
                  if (role.threshold < player.fameAverage && member.roles.cache.has(role.id)) {
                    await member.roles.remove(role.id);
                    // console.log("Removed role because has higher");
                  }
                }

                // add role
                if (!member.roles.cache.has(roleId)) {
                  await member.roles.add(roleId);

                  // Find the threshold for the earned role
                  const earnedRole = roles.find(role => role.id === roleId);

                  memberMentions.push(`<@${player.discordId}> ${earnedRole.threshold}+`);
                  console.log(`Assigned role ${roleId} to ${player.playerName}`);
                }
              }
            }
            catch (error) {
              console.log(`Error adding / removing roles`, error);
            }
          }
        }

        // Send the embed to the channels available to the normal players
        let description = "";
        for (const [roleId, players] of Object.entries(roleGroups)) {
          if (players.length > 0) {
            // sort by fame
            players.sort((a, b) => b.fameAverage - a.fameAverage);
            description += `<@&${roleId}>\n${players.map(player => `<@${player.discordId}> (${player.playerName})`).join(`\n`)}\n\n`;
          }
        }

        if (!description) {
          description += "No new roles earned.";
        }
        // const clans = await db.get(`clans`) || {};
        // const clantag = Object.keys(clans).find(tag => clans[tag].abbreviation === clan);
        let clanDb = await db.get(`clans.${clantag}`); // Gets entire clan data
        let channelId = await db.get(`stats.${clan}.statsChannel`)
        console.log("Got the channel Id for: ", clan);
        try {
          let rrData = await API.getRiverRaceLog(clanDb.clantag);
          if (rrData) {
            let firstItem = rrData.items[0];
            warWeek = `Week ${firstItem.seasonId}-${firstItem.sectionIndex + 1}`;
          }
        } catch (error) {
          console.log("No rr data");
        }
        let embedForPlayers = new EmbedBuilder()
          .setTitle(`${clanDb.clanName}`)
          .setColor("Purple")
          .setDescription(description)
          .setFooter({ text: warWeek });

        try {
          const playerChannel = await interaction.client.channels.fetch(channelId);
          await playerChannel.send({ embeds: [embedForPlayers] });
          if (memberMentions.length > 0) {
            await playerChannel.send(`Congratulations to the following members for earning new roles:\n${memberMentions.join('\n')}`);
          }
        } catch (error) {
          console.log("Couldn't send new roles to player channel");
        }

        // Update embed showing in leader channel
        updatedEmbed = new EmbedBuilder(embed).setFooter({ text: `${embed.footer.text.split('|')[0].trim()} | Sent!` })
        // Edit the message with the updated embed
        await message.edit({ embeds: [updatedEmbed], components: [] });
      }


      else if (action === 'confirmRoles' && clan === "colo") {

        const colosseumRoles = [
          { id: '1361870679364075621', threshold: 3600 }, // My server 3600
          { id: '1361870471515082772', threshold: 3500 }, // My server 3500
          { id: '1361870889980788756', threshold: 3400 }, // My server 3400

          // { id: '1214408787306348594', threshold: 3600 },
          // { id: '1214408358204022805', threshold: 3500 },
          // { id: '1214198156460429363', threshold: 3400 },
        ];

        let confirmationData = await db.get(`confirmationData.coloRoles`) || { count: 0, users: [] };
        if (!confirmationData.users.includes(interaction.user.id)) {
          confirmationData.count += 1;
          confirmationData.users.push(interaction.user.id);
          await db.set(`confirmationData.coloRoles`, confirmationData);
          // fetch og message
          const message = await interaction.channel.messages.fetch(interaction.message.id);
          const embed = message.embeds[0];

          let updatedEmbed = new EmbedBuilder(embed).setFooter({ text: `${embed.footer.text.split('|')[0].trim()} | (${confirmationData.count}/2)` })
          // Edit the message with the updated embed
          await message.edit({ embeds: [updatedEmbed] });
        }
        if (confirmationData.count < 2) { // TODO
          return;
        }

        const message = await interaction.channel.messages.fetch(interaction.message.id);
        const embed = message.embeds[0];

        let updatedEmbed = new EmbedBuilder(embed).setFooter({ text: `${embed.footer.text.split('|')[0].trim()} | Sending...` })
        // Edit the message with the updated embed
        await message.edit({ embeds: [updatedEmbed], components: [] });


        const roleGroups = await db.get(`roleAssignments.coloRoles`);
        if (!roleGroups) {
          console.log("No role Groups");
          return;
        }


        let memberMentions = [];


        for (const [roleId, players] of Object.entries(roleGroups)) {
          for (const player of players) {
            try {
              let member = await interaction.guild.members.fetch(player.discordId);
              // Check if the member has a higher role
              let hasHigherRole = colosseumRoles.some(role => member.roles.cache.has(role.id) && role.threshold > player.lastRaceScore);
              if (!hasHigherRole) {
                // Remove lower roles
                for (const role of colosseumRoles) {
                  if (role.threshold < player.lastRaceScore && member.roles.cache.has(role.id)) {
                    await member.roles.remove(role.id);
                    // console.log("Removed role because has higher");
                  }
                }

                // add role
                if (!member.roles.cache.has(roleId)) {
                  await member.roles.add(roleId);

                  // Find the threshold for the earned role
                  const earnedRole = colosseumRoles.find(role => role.id === roleId);

                  memberMentions.push(`<@${player.discordId}> ${earnedRole.threshold}`);
                  console.log(`Assigned role ${roleId} to ${player.playerName}`);
                }
              }
            }
            catch (error) {
              console.log(`Error adding / removing roles`, error);
            }
          }
        }

        // Send the embed to the channels available to the normal players
        let description = "";
        for (const [roleId, players] of Object.entries(roleGroups)) {
          if (players.length > 0) {
            // sort by fame
            players.sort((a, b) => b.lastRaceScore - a.lastRaceScore);
            description += `<@&${roleId}>\n${players.map(player => `<@${player.discordId}> (${player.playerName})`).join(`\n`)}\n\n`;
          }
        }

        if (!description) {
          description += "No new roles earned.";
        }
        // const clans = await db.get(`clans`) || {};
        // const clantag = Object.keys(clans).find(tag => clans[tag].abbreviation === clan);

        let generalChatChannelId = "783029863442415665"; // General chat to send to TODO TAO's gen chat : 783029863442415665
        try {
          let rrData = await API.getRiverRaceLog("#9U82JJ0Y");
          if (rrData) {
            let firstItem = rrData.items[0];
            warWeek = `Week ${firstItem.seasonId}-${firstItem.sectionIndex + 1}`;
          }
        } catch (error) {
          console.log("No rr data");
        }
        let embedForPlayers = new EmbedBuilder()
          .setTitle(`5k Colosseum Roles`)
          .setColor("Purple")
          .setDescription(description)
          .setFooter({ text: `Colosseum ${warWeek}` });

        try {
          const playerChannel = await interaction.client.channels.fetch(generalChatChannelId);
          await playerChannel.send({ embeds: [embedForPlayers] });
          if (memberMentions.length > 0) {
            await playerChannel.send(`Congratulations to the following members for earning new 5k colosseum roles! <:giantready:1361883518333878424>\n${memberMentions.join('\n')}`);
          }
        } catch (error) {
          console.log("Couldn't send new roles to player channel");
        }

        // Update embed showing in leader channel
        updatedEmbed = new EmbedBuilder(embed).setFooter({ text: `${embed.footer.text.split('|')[0].trim()} | Sent!` })
        // Edit the message with the updated embed
        await message.edit({ embeds: [updatedEmbed], components: [] });


      }
    }



    if (interaction.customId.startsWith(`confirmDeleteChannel`)) {
      await interaction.deferUpdate();
      const member = await interaction.guild.members.fetch(interaction.user.id);
      if (!member.permissions.has([PermissionsBitField.Flags.MuteMembers])) {
        await interaction.followUp({ content: `You cannot use this button, it's only allowed for coleaders.`, ephemeral: true });
        return;
      }
      const dbPath = API.findFileUpwards(__dirname, `guildData/${interaction.guild.id}.sqlite`);
      const db = new QuickDB({ filePath: dbPath });
      const [action, channelId] = interaction.customId.split(`_`);
      if (action === 'confirmDeleteChannel') {
        let confirmDeleteChannel = await db.get(`massLinkChannels.${channelId}`);
        let numberOfVotes = confirmDeleteChannel.deleteCounts || 0;

        if (!confirmDeleteChannel.users.includes(interaction.user.id)) {
          confirmDeleteChannel.deleteCounts = numberOfVotes + 1;
          confirmDeleteChannel.users.push(interaction.user.id);
          await db.set(`massLinkChannels.${channelId}`, confirmDeleteChannel);
          const message = await interaction.channel.messages.fetch(interaction.message.id);
          const embed = message.embeds[0];
          const updatedEmbed = new EmbedBuilder(embed).setFooter({ text: `${numberOfVotes + 1}/2 needed` });
          await message.edit({ embeds: [updatedEmbed] });
        }
        if (confirmDeleteChannel.deleteCounts >= 2) { // change this number for amount of people needed to delete
          const message = await interaction.channel.messages.fetch(interaction.message.id);
          const embed = message.embeds[0];
          const updatedEmbed = new EmbedBuilder(embed).setFooter({ text: `Deleting in 5 seconds!` });
          await message.edit({ embeds: [updatedEmbed], components: [] });

          setTimeout(async function () {
            try {
              let channelId = interaction.channel.id;
              const channel = await interaction.client.channels.fetch(channelId);
              await channel.delete();
              await db.delete(`massLinkChannels.${channelId}`);
            } catch (error) {
              console.log("Channel is gone, can't delete", error);
            }
          }, 5000);
        }
      }

    }
  }
}