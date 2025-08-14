const path = require('node:path');
const { SlashCommandBuilder } = require('discord.js');
const { postRules } = require(path.resolve(__dirname, '..', 'helpers', 'rulesHelper.js'));

const RED = 0xef4444;
const CROSS = '<:nunca:1405075040600588338>'; // ← emoji del server

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reglas_nunca')
    .setDescription('Publica la sección "Nunca"')
    .addAttachmentOption(o =>
      o.setName('banner').setDescription('Imagen superior opcional (sale por fuera del embed).')
    ),

  async execute(interaction) {
    const banner = interaction.options.getAttachment('banner');
    const SPACE = '\u200B';
    const lines = [
      `${CROSS} **No spam/flood/ads.** Evita repetir mensajes, abusar de mayúsculas o pings innecesarios.`,
      SPACE,
      `${CROSS} **Sin discurso de odio.** Prohibidos mensajes racistas, sexistas o degradantes.`,
      SPACE,
      `${CROSS} **No suplantación.** No te presentes como staff ni como otra persona.`,
      SPACE,
      `${CROSS} **No exploits/dupe.** Está prohibido aprovechar fallos o glitches; repórtalos.`,
      SPACE,
      `${CROSS} **Sin doxxeo.** No difundas datos personales ni contenido privado de nadie.`
      
    ];
    await postRules(interaction, { color: RED, lines, banner });
  }
};
