const path = require('node:path');
const { SlashCommandBuilder } = require('discord.js');
const { postRules } = require(path.resolve(__dirname, '..', 'helpers', 'rulesHelper.js'));

const GREEN = 0x22c55e;
const CHECK = '<:siempre:1405074502303481938>'; // ← reemplaza por tu emoji del server

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reglas_siempre')
    .setDescription('Publica la sección "Siempre"')
    .addAttachmentOption(o =>
      o.setName('banner').setDescription('Imagen superior opcional (sale por fuera del embed).')
    ),

  async execute(interaction) {
    const banner = interaction.options.getAttachment('banner');
    const lines = [
      `${CHECK} **Trata a todos con respeto.** Evita comentarios despectivos y mantén un tono cordial.

      ${CHECK} **Sé considerado.** El sarcasmo y las bromas pueden malinterpretarse; busca que el mensaje sea claro.

      ${CHECK} **Cuida tu privacidad.** No compartas datos personales, capturas o DMs sin permiso.

      ${CHECK} **Juega Limpio.** Sin ventajas externas, autoclickers, macros ni clientes modificados que den ventaja.

      ${CHECK} **Sigue al staff.** Sus indicaciones mantienen el orden del servidor.`,
    ];
    await postRules(interaction, { color: GREEN, lines, banner });
  }
};
