// commands/reglas_consecuencias.js
const { SlashCommandBuilder } = require('discord.js');
const path = require('node:path');
const helperPath = path.resolve(__dirname, '..', 'helpers', 'rulesHelper.js');
console.log('Helper path ->', helperPath); // Te aparecerá en los Deploy Logs
const { postRules } = require(helperPath);

const PURPLE = 0x8b5cf6; // morado

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reglas_consecuencias')
    .setDescription('Publica la sección "Consecuencias"')
    .addAttachmentOption(o =>
      o.setName('banner')
        .setDescription('Imagen superior (opcional). Sale por fuera del embed.')
    ),

  async postRules(interaction) {
    const banner = interaction.options.getAttachment('banner');

    const lines = [
      'El **Código de Conducta de CocoCraft** existe para garantizar y mantener un entorno seguro y acogedor para toda la comunidad.',
      'Quienes incumplan estas directrices pueden ver restringido o suspendido su acceso al servicio correspondiente.',
      '**Quienes incumplen también pueden esperar:**',
      '> • Las sanciones pueden ampliarse o incluso volverse permanentes si se persiste en infringir el Código de Conducta.',
      '> • Un buen comportamiento sostenido con el tiempo puede reducir la duración de sanciones futuras.',
      'El equipo de moderación actuará con su propio criterio y caso por caso. __No__ se discutirán acciones de moderación en canales públicos ni por MDs.'
    ];

    await postRules(interaction, { color: PURPLE, lines, banner });
  }
};
