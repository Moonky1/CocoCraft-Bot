// commands/verify-embed.js
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verify-embed')
    .setDescription('Publica o limpia el panel de verificación')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sc =>
      sc.setName('publicar')
        .setDescription('Publica el panel en el canal configurado y lo fija'))
    .addSubcommand(sc =>
      sc.setName('limpiar')
        .setDescription('Borra TODOS los mensajes del bot en el canal de verificación')),

  async execute(interaction) {
    const verifyChannelId = process.env.VERIFY_CHANNEL_ID;
    const channel = interaction.guild.channels.cache.get(verifyChannelId);

    if (!channel) {
      return interaction.reply({ content: '⚠️ VERIFY_CHANNEL_ID no apunta a un canal válido.', ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'publicar') {
      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setAuthor({ name: 'Spawn Club | Sincronización', iconURL: interaction.client.user.displayAvatarURL() })
        .setTitle('✅ Verifica tu cuenta')
        .setDescription(
          [
            '• Entra al **servidor** y usa **`/discord link`** para obtener un **código** (ej: `8323`).',
            '• **Copia** ese código y **pégalo** en este canal. ',
            '• El bot validará el código, **sincronizará tus roles** y borrará tu mensaje automáticamente.',
            '',
            '👉 Si compras nuevos rangos, repite la verificación para re-sincronizarlos.',
          ].join('\n')
        )
        .setImage(process.env.VERIFY_BANNER || null)
        .setFooter({ text: 'Spawn Club • Seguridad y sincronización de rangos' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('¿Cómo obtengo mi código?')
          .setStyle(ButtonStyle.Link)
          .setURL('https://tu-enlace-de-ayuda-o-wiki') // cambia o quita si no lo usas
      );

      const msg = await channel.send({ embeds: [embed], components: [row] });
      try { await msg.pin(); } catch {}
      return interaction.reply({ content: `📌 Panel publicado en <#${verifyChannelId}> y fijado.`, ephemeral: true });
    }

    if (sub === 'limpiar') {
      const messages = await channel.messages.fetch({ limit: 100 });
      const mine = messages.filter(m => m.author.id === interaction.client.user.id);
      await channel.bulkDelete(mine, true).catch(() => {});
      return interaction.reply({ content: '🧹 Paneles del bot eliminados.', ephemeral: true });
    }
  },
};
