// commands/reglas.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

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
        .addBooleanOption(o =>
          o.setName('pin')
            .setDescription('Fijar el mensaje (por defecto: sí)')
        )
    ),

  async execute(interaction) {
    if (interaction.options.getSubcommand() !== 'inicio') return;
    await interaction.deferReply({ ephemeral: true });

    const channel = await interaction.client.channels.fetch(RULES_CHANNEL_ID).catch(() => null);
    if (!channel) return interaction.editReply('❌ No pude encontrar el canal de reglas. Revisa el ID.');

    const banner = interaction.options.getAttachment('banner');
    const shouldPin = interaction.options.getBoolean('pin');
    const files = [];

    if (banner) files.push({ attachment: banner.url, name: banner.name || 'banner.png' });

    const embed = new EmbedBuilder()
      .setColor(DARK_GRAY)
      .setDescription([
        '¡Bienvenid@ a **CocoCraft**!',
        'Antes de comenzar tu aventura en nuestras modalidades — **Towny (ciudades y economía)**, **Survival**, y **Minijuegos** — te pedimos leer y respetar nuestro **Código de Conducta de CocoCraft**.',
        'Buscamos un ambiente **seguro, respetuoso y divertido** para tod@s.',
        'A continuación verás las reglas publicadas por secciones. Si ya eres parte de la comunidad, tómate un minuto para repasarlas; si eres nuevo, este es tu punto de partida.',
        '— *Staff de CocoCraft*'
      ].join('\n'))
      .setTimestamp();

    const sent = await channel.send({ files, embeds: [embed], allowedMentions: { parse: [] } });

    if (shouldPin !== false) { // por defecto, fijar
      await sent.pin().catch(() => {});
    }

    await interaction.editReply(`✅ Publicado${(shouldPin !== false) ? ' y fijado' : ''} en <#${RULES_CHANNEL_ID}>. ${sent.url}`);
  }
};
