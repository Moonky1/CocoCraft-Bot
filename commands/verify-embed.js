const {
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verify-embed')
    .setDescription('Gestiona el embed de verificación')
    .addSubcommand(sc =>
      sc
        .setName('publicar')
        .setDescription('Publica el embed de verificación en un canal')
        .addChannelOption(o =>
          o.setName('canal')
            .setDescription('Canal destino (deja vacío para usar VERIFY_CHANNEL_ID)')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const canalOpcion = interaction.options.getChannel('canal');
    const fallbackId = process.env.VERIFY_CHANNEL_ID;
    const canal = canalOpcion
      ?? interaction.guild.channels.cache.get(fallbackId)
      ?? (fallbackId ? await interaction.guild.channels.fetch(fallbackId).catch(() => null) : null);

    if (!canal) {
      return interaction.reply({
        content: '⚠️ `VERIFY_CHANNEL_ID` no apunta a un canal válido **y** no se indicó `canal`. Pasa un canal o corrige la variable.',
        ephemeral: true
      });
    }

    if (![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(canal.type)) {
      return interaction.reply({
        content: '⚠️ El canal indicado no es de **texto**. Elige un canal de texto normal.',
        ephemeral: true
      });
    }

    // ⚠️ Sustituye este embed por tu diseño
    const embed = new EmbedBuilder()
      .setColor(0x00ff7f)
      .setTitle('✅ Verifica tu cuenta')
      .setDescription(
        [
          '1) Entra al servidor y ejecuta **`/discord link`**',
          '2) Copia el **código** que te da el juego',
          `3) Pega **solo el código** en este canal (${canal})`,
          '',
          'El bot borrará tu mensaje y te confirmará si fue vinculado ✅'
        ].join('\n')
      )
      .setFooter({ text: 'Spawn Club' });

    await canal.send({ embeds: [embed] });

    return interaction.reply({
      content: `✅ Embed publicado en ${canal}`,
      ephemeral: true
    });
  }
};
