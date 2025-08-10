// commands/tickets.js
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionsBitField,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tickets')
    .setDescription('Panel de soporte / tickets')
    .addSubcommand(sub =>
      sub
        .setName('publicar')
        .setDescription('Publica el panel de tickets en este canal o en el canal configurado')
        .addChannelOption(o =>
          o.setName('canal')
            .setDescription('Canal donde publicar el panel (opcional)')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
    ),

  async execute(interaction) {
    if (interaction.options.getSubcommand() !== 'publicar') return;

    // el panel debe ir al canal que elijas o al configurado en .env
    const fromOption = interaction.options.getChannel('canal');
    const channelId = (fromOption?.id) || process.env.TICKETS_CHANNEL_ID;
    const channel = interaction.guild.channels.cache.get(channelId);

    if (!channel) {
      return interaction.reply({
        content: `❌ No encuentro el canal de tickets. Revisa **TICKETS_CHANNEL_ID** o el canal elegido.`,
        ephemeral: true,
      });
    }

    // embed + botón "Abrir ticket"
    const embed = new EmbedBuilder()
      .setColor(0x5ed1da)
      .setAuthor({ name: 'Soporte • Tickets' })
      .setDescription([
        '¿Necesitas ayuda del staff? Abre un ticket para que podamos atenderte de forma privada.',
        ' ',
        '• Explica tu caso con el mayor detalle posible.',
        '• Incluye capturas, IDs o cualquier dato útil.',
        '• Sé respetuoso y paciente mientras te respondemos 🙏',
      ].join('\n'))
      .setFooter({ text: 'Tiempo de respuesta estimado: 1–2 horas' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_open')
        .setLabel('Abrir ticket')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📩')
    );

    const msg = await channel.send({ embeds: [embed], components: [row] });
    // fíjalo para que siempre quede arriba
    try { await msg.pin(); } catch {}

    await interaction.reply({ content: '✅ Panel publicado y fijado.', ephemeral: true });
  },
};
