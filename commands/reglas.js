// commands/reglas.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const path = require('node:path');
const { postRules } = require(path.resolve(__dirname, '..', 'helpers', 'rulesHelper.js'));

const RULES_CHANNEL_ID = '1399202510367096973';
const DARK_GRAY = 0x2b2d31; // gris oscuro

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reglas')
    .setDescription('Publica/actualiza las reglas por secciones')
    .addSubcommand(sc =>
      sc.setName('inicio')
        .setDescription('Publica el primer embed de introducción (sin título)')
        .addAttachmentOption(o =>
          o.setName('banner')
            .setDescription('Imagen superior (opcional). Sale por fuera del embed.')
        )
    ),

  async postRules(interaction) {
    if (interaction.options.getSubcommand() !== 'inicio') return;
    await interaction.deferReply({ ephemeral: true });

    const channel = await interaction.client.channels.fetch(RULES_CHANNEL_ID).catch(() => null);
    if (!channel) return interaction.editReply('❌ No pude encontrar el canal de reglas. Revisa el ID.');

    const banner = interaction.options.getAttachment('banner');
    const files = [];
    if (banner) files.push({ attachment: banner.url, name: banner.name || 'banner.png' });

    const embed = new EmbedBuilder()
      .setColor(DARK_GRAY)
      .setDescription(
        'Antes de seguir explorando **CocoCraft**, recuerda que tu participación implica cumplir los [Términos de Servicio](https://discord.com/terms) y las [Directrices de la Comunidad](https://discord.com/guidelines) de Discord, además de nuestro **Código de Conducta**.'
      );

    const sent = await channel.send({ files, embeds: [embed], allowedMentions: { parse: [] } });

    await interaction.editReply(`✅ Publicado en <#${RULES_CHANNEL_ID}>. ${sent.url}`);
  }
};
