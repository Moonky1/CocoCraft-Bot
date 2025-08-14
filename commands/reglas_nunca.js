const { SlashCommandBuilder } = require('discord.js');
const path = require('node:path');
const helperPath = path.resolve(__dirname, '..', 'helpers', 'rulesHelper.js');
console.log('Helper path ->', helperPath); // Te aparecerá en los Deploy Logs
const { postRules } = require(helperPath);


const RED = 0xef4444;
const CROSS = '<:nunca:1405075040600588338>'; // ← emoji del server

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reglas_nunca')
    .setDescription('Publica la sección "Nunca"')
    .addAttachmentOption(o =>
      o.setName('banner').setDescription('Imagen superior opcional (sale por fuera del embed).')
    ),

  async postRules(interaction) {
    const banner = interaction.options.getAttachment('banner');
    const lines = [
      `${CROSS} **No spam/flood/ads.** Nada de enlaces maliciosos o autopromoción no autorizada.`,
      `${CROSS} **No lenguaje de odio.** Prohibido contenido racista, sexista u ofensivo.`,
      `${CROSS} **No suplantación.** No te hagas pasar por staff u otros jugadores.`,
      `${CROSS} **No exploits/dupe.** Aprovechar fallos o glitches está prohibido.`,
      `${CROSS} **No doxxing.** No publiques información privada de nadie.`
    ];
    await postRules(interaction, { color: RED, lines, banner });
  }
};
