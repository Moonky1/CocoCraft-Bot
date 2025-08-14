// commands/boost_info.js
const { SlashCommandBuilder } = require('discord.js');
const path = require('node:path');
const { postRules } = require(path.resolve(__dirname, '..', 'helpers', 'rulesHelper.js'));

const BOOST_CHANNEL_ID = '1404007396988289065';
const BOOST_COLOR = 0xEB459E; // rosa/morado estilo Nitro


module.exports = {
  data: new SlashCommandBuilder()
    .setName('boost_info')
    .setDescription('Publica el embed de beneficios por boostear')
    .addAttachmentOption(o =>
      o.setName('banner').setDescription('Imagen superior (opcional). Sale por fuera del embed.')
    ),

  async execute(interaction) {
    const banner = interaction.options.getAttachment('banner');
    const SPACE = '\u200B';
    const lines = [
      'a:booster:1405477228317245450 **Recompensas por boostear**',
       SPACE,
      '_¡Obtén ventajas exclusivas al apoyar CocoCraft con un boost!_',
      '',
      '__Ventajas con un boost activo__',
      SPACE,
      'a:booster2:1405475991870111754 **Insignia Booster** en el tabulador del servidor.',
      SPACE,
      'cofre1:1405475458518355988**Tag Booster** visible en todas las modalidades.',
      SPACE,
      'cofre2:1405475467359813665**Rango VIP** global mientras tu boost esté activo.',
      SPACE,
      'cofre3:1405475473764515941**Acceso** al canal privado de boosters para charlas y avisos.',
      SPACE,
      SPACE,
      `_Para reclamar tus recompensas, verifica tu cuenta en <#1403353911808626799>. El sistema aplicará los beneficios automáticamente al boostear._`,
    ];

    await postRules(interaction, {
      color: BOOST_COLOR,
      lines,
      banner,
      channelId: BOOST_CHANNEL_ID
    });
  }
};
