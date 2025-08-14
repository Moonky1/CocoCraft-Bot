// commands/reglas_inicio.js
const { SlashCommandBuilder } = require('discord.js');
const path = require('node:path');
const { postRules } = require(path.resolve(__dirname, '..', 'helpers', 'rulesHelper.js'));

const DARK_GRAY = 0x2b2d31; // gris oscuro

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reglas_inicio')
    .setDescription('Publica la introducción de las reglas (sin título)')
    .addAttachmentOption(o =>
      o.setName('banner')
        .setDescription('Imagen superior (opcional). Sale por fuera del embed.')
    ),

  async execute(interaction) {
    const banner = interaction.options.getAttachment('banner');

    const SPACE = '\u200B';
    const lines = [
      'Antes de seguir explorando **CocoCraft**, aceptas los [Términos](https://discord.com/terms) y las [Directrices](https://discord.com/guidelines) de Discord, además de nuestro **Código de Conducta**.',
      SPACE,
      'A continuación verás las reglas por secciones:',
    ];

    await postRules(interaction, { color: DARK_GRAY, lines, banner });
  }
};
