const { SlashCommandBuilder } = require('discord.js');
const path = require('node:path');
const helperPath = path.resolve(__dirname, '..', 'helpers', 'rulesHelper.js');
console.log('Helper path ->', helperPath); // Te aparecerá en los Deploy Logs
const { postRules } = require(helperPath);



const GREEN = 0x22c55e;
const CHECK = '<:siempre:1405074502303481938>'; // ← reemplaza por tu emoji del server

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reglas_siempre')
    .setDescription('Publica la sección "Siempre"')
    .addAttachmentOption(o =>
      o.setName('banner').setDescription('Imagen superior opcional (sale por fuera del embed).')
    ),

  async postRules(interaction) {
    const banner = interaction.options.getAttachment('banner');
    const lines = [
      `${CHECK} **Respeta a todos.** Nada de insultos, acoso, discriminación o lenguaje tóxico.`,
      `${CHECK} **Sé considerado.** El humor puede malinterpretarse; evita provocar o molestar.`,
      `${CHECK} **Protege tu privacidad.** No compartas datos personales tuyos ni de terceros.`,
      `${CHECK} **Sigue al staff.** Sus indicaciones mantienen el orden del servidor.`,
      `${CHECK} **Juega limpio.** Sin trampas, macros, exploits ni abuso de bugs; repórtalos.`,
      `${CHECK} **Usa el sentido común.** Si dudas, pregunta antes de actuar.`
    ];
    await postRules(interaction, { color: GREEN, lines, banner });
  }
};
