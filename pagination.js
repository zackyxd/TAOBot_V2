const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, } = require("discord.js");
const { createSuccessEmbed, createExistEmbed, createErrorEmbed, createMaintenanceEmbed } = require('./src/utilities/embedUtility.js');
// https://www.youtube.com/watch?v=sDfjMzEnSZQ
async function paginate(interaction, pages, type, time = 90000) {

  // errors
  // console.log(type);

  //if (!interaction) throw new Error("Please provide an interaction argument");
  if (!pages) throw new Error("Please provide a page argument");
  if (!Array.isArray(pages)) throw new Error("Pages must be an array");

  if (typeof time !== "number") throw new Error("Time must be a number.");
  if (parseInt(time) < 30000) throw new Error("Time must be greater than 30 seconds");

  // no buttons if only one page
  if (pages.length === 1) {
    const page = await interaction.editReply({
      embeds: pages,
      components: [],
      fetchReply: true,
    });
    return page;
  }


  if (type === "playersList") {
    // await interaction.deferReply();


    const prev = new ButtonBuilder()
      .setCustomId("prev")
      .setEmoji("⬅️")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true);

    const home = new ButtonBuilder()
      .setCustomId("home")
      .setEmoji("🏠")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true);

    const next = new ButtonBuilder()
      .setCustomId("next")
      .setEmoji("➡️")
      .setStyle(ButtonStyle.Primary);


    const buttonRow = new ActionRowBuilder().addComponents(prev, home, next);
    let index = 0;

    const currentPage = await interaction.editReply({
      embeds: [pages[index]],
      components: [buttonRow],
      fetchReply: true,
    });

    const collector = await currentPage.createMessageComponentCollector({
      componentType: ComponentType.Button, time
    });

    collector.on("collect", async (i) => {
      if (i.user.id !== interaction.user.id) {
        return i.reply({
          embeds: [createErrorEmbed(`These aren't your buttons to use. Do \`/players\` for your own.`)],
          ephemeral: true,
        });
      }

      await i.deferUpdate();

      if (i.customId === "prev") {
        if (index > 0) index--;
      } else if (i.customId === "home") {
        index = 0;
      } else if (i.customId === "next") {
        if (index < pages.length - 1) index++;
      }

      prev.setDisabled(index === 0);
      home.setDisabled(index === 0);
      next.setDisabled(index === pages.length - 1);

      await currentPage.edit({
        embeds: [pages[index]],
        components: [buttonRow],
      });

      collector.resetTimer();
    });

    collector.on("end", async () => {
      await currentPage.edit({
        embeds: [pages[index]],
        components: [],
      });
    });

    return currentPage;
  }


  else if (type === "clans") {
    const prev = new ButtonBuilder()
      .setCustomId("prev")
      .setEmoji("⬅️")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true);

    const home = new ButtonBuilder()
      .setCustomId("home")
      .setEmoji("🏠")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true);

    const next = new ButtonBuilder()
      .setCustomId("next")
      .setEmoji("➡️")
      .setStyle(ButtonStyle.Primary);


    const buttonRow = new ActionRowBuilder().addComponents(prev, home, next);
    let index = 0;

    const currentPage = await interaction.editReply({
      embeds: [pages[index]],
      components: [buttonRow],
      fetchReply: true,
    });

    const collector = await currentPage.createMessageComponentCollector({
      componentType: ComponentType.Button, time
    });

    collector.on("collect", async (i) => {
      if (i.user.id !== interaction.user.id) {
        return i.reply({
          embeds: [createErrorEmbed(`These aren't your buttons to use. Do \`/info\` for your own.`)],
          ephemeral: true,
        });
      }

      await i.deferUpdate();

      if (i.customId === "prev") {
        if (index > 0) index--;
      } else if (i.customId === "home") {
        index = 0;
      } else if (i.customId === "next") {
        if (index < pages.length - 1) index++;
      }

      prev.setDisabled(index === 0);
      home.setDisabled(index === 0);
      next.setDisabled(index === pages.length - 1);

      await currentPage.edit({
        embeds: [pages[index]],
        components: [buttonRow],
      });

      collector.resetTimer();
    });

    collector.on("end", async () => {
      await currentPage.edit({
        embeds: [pages[index]],
        components: [],
      });
    });

    return currentPage;
  }
}


module.exports = { paginate };