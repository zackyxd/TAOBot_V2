const { registerFont, loadImage, createCanvas } = require("canvas")
// const { dateStr } = require("./functions")
const fs = require("fs")
const path = require("path")

const fontPath = path.resolve(__dirname, "../../../20WinsContent/fonts/Supercell-Magic.ttf");
registerFont(fontPath, {
  family: "Supercell-Magic",
})

const dirPath = path.resolve(__dirname, "../../../20WinsContent/cards")

const addedCards = fs.readdirSync(dirPath).map((card) => card)

const getCardPath = (card) => {
  console.log(card);
  let path = "../../../20WinsContent/cards"

  const cardName = `${card.name
    .toLowerCase()
    .replaceAll(" ", "-")
    .replaceAll(".", "")}${card.evolutionLevel ? "-evo" : ""}.png`

  // check if card exists
  const cardExists = addedCards.includes(cardName)
  if (!cardExists) return "../../../20WinsContent/cards/unknown.png"

  return (path += "/" + cardName)
}

const createMatchImg = async (match, wins) => {
  const overlay = await loadImage("./20WinsContent/overlay.png")
  const canvas = createCanvas(overlay.width, overlay.height)
  const context = canvas.getContext("2d")
  context.drawImage(overlay, 0, 0, canvas.width, canvas.height)
  match.type = '20 Win Challenge'
  //1v1 Battle
  //add title
  context.font = `50px Supercell-Magic`
  context.fillStyle = "white"

  const tX = (overlay.width - context.measureText(match.type).width) / 2 //center title horizontally
  const tY = 90
  context.fillText(match.type, tX, tY)

  //add underline
  context.fillRect(tX, tY + 10, context.measureText(match.type).width, 8)

  //add match icon
  const matchIcon = await loadImage(
    `./20WinsContent/matchIcons/crlIcon.png`
  )
  const tiX = (overlay.width - 250) / 2 //center title horizontally
  const tiY = tY + 20 + 10
  context.drawImage(matchIcon, tiX, tiY, 250, 250)

  //add player
  //name
  context.font = `42px Supercell-Magic`
  const pX = 100
  const pY = tiY + 96 + 60
  context.fillText(match.team[0].name, pX, pY, 480)
  //clan
  context.font = `32px Supercell-Magic`
  context.fillStyle = "gray"
  const pcX = 100
  const pcY = pY + 42 + 7
  context.fillText(match.team[0].clan?.name || "No Clan", pcX, pcY, 480)
  //trophies
  context.fillStyle = "white"
  // const ptX = 100
  // const ptY = pcY + 32 + 18
  // const trophyIcon = await loadImage(
  //   "./20WinsContent/matchIcons/trophy.png"
  // )
  // context.drawImage(trophyIcon, ptX, ptY - 30, 32, 32)
  // context.fillText(match.team[0].trophies, ptX + 32 + 8, ptY)
  //cards
  let cX = 100
  let cY = pcY + 40
  for (let i = 0; i < match.team[0].cards.length; i++) {
    if (i === 4) {
      cX = 100
      cY += 180
    }

    const c = match.team[0].cards[i]
    const lvl = 14 - (c.maxLevel - c.level) || "?"
    const cardImg = await loadImage(
      `./20WinsContent/cards/${c.name
        .toLowerCase()
        .replaceAll(" ", "-")
        .replaceAll(".", "")}${c.evolutionLevel ? "-evo" : ""}.png`
    )
    context.drawImage(cardImg, cX, cY, 125, 150)
    context.font = `22px Supercell-Magic`
    context.fillText(
      lvl,
      cX + (125 - context.measureText(lvl).width) / 2,
      cY + 150 + 23
    )

    cX += 125 + 31
  }

  // //add opponent
  // //name
  // Function to dynamically calculate the mirrored X position
  const mirrorXPadding = (text, offset = 100) =>
    canvas.width - context.measureText(text).width - offset;

  context.font = `70px Supercell-Magic`;
  context.fillStyle = "white";

  // Canvas dimensions
  const canvasWidth = canvas.width;
  const canvasHeight = canvas.height;

  // Mid points
  const midX = canvasWidth / 2;
  const rightMidX = (canvasWidth + midX) / 2;

  // Add text dynamically on the right side, split in half and half again
  // const wins = 17; // Example value
  const winsText = `${wins}`;
  const labelText = "Wins";

  // Text positions
  const winsX = rightMidX - context.measureText(winsText).width / 2;
  const winsY = canvasHeight / 2 + 50; // Example vertical position

  context.fillText(winsText, winsX, winsY, 480);

  // Position the "Wins" text directly beneath the number
  const labelX = rightMidX - context.measureText(labelText).width / 2;
  const labelY = winsY + 100; // Adjust to position the label directly beneath the number

  context.fillText(labelText, labelX, labelY, 480);

  // const ocX =
  //   context.measureText(match.opponent.clanName).width >= 480
  //     ? overlay.width - 480 - 100
  //     : mirrorXPadding(match.opponent.clanName)
  // const ocY = pcY
  // context.fillText(match.opponent.clanName, ocX, ocY, 490)
  // //trophies
  // context.fillStyle = "white"
  // const otX = mirrorXPadding(match.opponent.trophies) - 32 - 8
  // const otY = ptY
  // context.drawImage(trophyIcon, otX, otY - 30, 32, 32)
  // context.fillText(match.opponent.trophies, otX + 32 + 8, otY)
  // //cards
  // let cX2 = overlay.width - 100 - 125 * 4 - 31 * 3
  // let cY2 = otY + 40
  // for (let i = 0; i < match.opponent.cards.length; i++) {
  //   if (i === 4) {
  //     cX2 = overlay.width - 100 - 125 * 4 - 31 * 3
  //     cY2 += 180
  //   }

  //   const c = match.opponent.cards[i]
  //   const lvl = 14 - (c.maxLevel - c.level) || "?"
  //   const cardImg = await loadImage(getCardPath(c))

  //   context.drawImage(cardImg, cX2, cY2, 125, 150)
  //   context.font = `22px Supercell-Magic`
  //   context.fillText(
  //     lvl,
  //     cX2 + (125 - context.measureText(lvl).width) / 2,
  //     cY2 + 150 + 23
  //   )

  //   cX2 += 125 + 31
  // }

  //add crowns
  //minus sign
  // context.fillRect(overlay.width / 2 - 16, tiY + 96 + 93, 32, 8)
  // //team crowns
  // const blueCrown = await loadImage(
  //   "./20WinsContent/matchIcons/crown-blue.png"
  // )
  // context.drawImage(
  //   blueCrown,
  //   overlay.width / 2 - 16 - 160,
  //   tiY + 96 + 70,
  //   60,
  //   49
  // )
  // context.font = `35px Supercell-Magic`
  // context.fillText(
  //   match.team[0].crowns,
  //   (100 - context.measureText(match.team[0].crowns).width) / 2 +
  //   (overlay.width / 2 - 16 - 100),
  //   tiY + 96 + 110
  // )
  // //opponent crowns
  // const redCrown = await loadImage(
  //   "./src/static/images/matchIcons/crown-red.png"
  // )
  // context.drawImage(
  //   redCrown,
  //   overlay.width / 2 + 16 + 100,
  //   tiY + 96 + 70,
  //   60,
  //   49
  // )
  // context.fillText(
  //   match.opponent.crowns,
  //   overlay.width / 2 +
  //   16 +
  //   (100 - context.measureText(match.opponent.crowns).width) / 2,
  //   tiY + 96 + 110
  // )

  // //add relative time stamp
  // context.font = `20px Supercell-Magic`
  // context.fillText(dateStr(match.timestamp), 100, overlay.height - 50)
  return canvas.toBuffer()
}



module.exports = createMatchImg
