// commands/verify-embed.js
const path = require('path');
const {
  SlashCommandBuilder,
  ChannelType,
  EmbedBuilder,
  AttachmentBuilder,
  PermissionFlagsBits
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verify-embed')
    .setDescription('Publica o repone el embed de verificación')
    .addSubcommand(sc =>
      sc
        .setName('publicar')
        .setDescription('Publica el embed en un canal')
        .addChannelOption(o =>
          o
            .setName('canal')
            .setDescription('Canal donde quedará el mensaje de verificación')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        ),
    )
    .addSubcommand(sc =>
      sc
        .setName('actualizar')
        .setDescription('Borra el embed anterior y lo vuelve a publicar en VERIFY_CHANNEL_ID (env)'),
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const sub = interaction.options.getSubcommand();
    const client = interaction.client;

    // helper: arma el payload con banner+embed
    const buildPayload = (channel) => {
      const bannerPath = path.join(__dirname, '..', 'assets', 'images', 'verify-banner.png');
      const banner = new AttachmentBuilder(bannerPath, { name: 'verify-banner.png' });

      const embed = new EmbedBuilder()
        .setColor(0x00ff77)
        .setTitle('✅ Verificación de rangos')
        .setDescription([
          '¿**Cómo me verifico**?',
          '• Entra al servidor y escribe **/discord link**',
          '• Copia el **código** que te entrega el juego (ej. **8323**)',
          `• Vuelve a ${channel} y pega **solo el número**. El bot lo borrará y te confirmará.`,
          '',
          '¿**Debo hacerlo por cada modalidad**?',
          'Sí; manejamos rangos por **modalidad**, así que la verificación es por cada modo.',
          '',
          '¿**Qué gano al verificar**?',
          'Sincronizamos tus compras/rangos con tus **roles de Discord** y obtienes la etiqueta **verificado**.',
          '',
          '¿**Ya estaba vinculado**?',
          'Si compraste rangos nuevos o recibiste boosters, vuelve a verificar para actualizar tus roles.',
        ].join('\n'))
        .setImage('attachment://verify-banner.png')
        .setFooter({ text: 'SC_VERIFY_V1 • Spawn Club' });

      return { embeds: [embed], files: [banner] };
    };

    // helper: valida canal y permisos
    const validateChannel = (channel) => {
      if (!channel?.isTextBased?.() || !channel.viewable) {
        return '⚠️ El canal no es de texto o no es visible para el bot.';
      }
      const me = channel.guild.members.me;
      const needed = [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AttachFiles,
      ];
      if (!channel.permissionsFor(me)?.has(needed)) {
        return '⚠️ Faltan permisos: ViewChannel, SendMessages, EmbedLinks, AttachFiles.';
      }
      return null;
    };

    try {
      if (sub === 'publicar') {
        const target = interaction.options.getChannel('canal');

        const err = validateChannel(target);
        if (err) return interaction.editReply(err);

        // borra embeds viejos del bot en ese canal
        const prev = await target.messages.fetch({ limit: 50 }).catch(() => null);
        if (prev) {
          const toDelete = prev.filter(
            m => m.author.id === client.user.id
              && m.embeds?.[0]?.title?.includes('Verificación de rangos')
          );
          for (const [, msg] of toDelete) {
            await msg.delete().catch(() => {});
          }
        }

        const payload = buildPayload(target);
        await target.send(payload);
        return interaction.editReply('✅ Embed publicado.');

      } else if (sub === 'actualizar') {
        const channelId = process.env.VERIFY_CHANNEL_ID;
        const target = interaction.guild.channels.cache.get(channelId);

        if (!target) return interaction.editReply('⚠️ VERIFY_CHANNEL_ID no apunta a un canal válido.');
        const err = validateChannel(target);
        if (err) return interaction.editReply(err);

        // borra el anterior y repone
        const prev = await target.messages.fetch({ limit: 50 }).catch(() => null);
        if (prev) {
          const toDelete = prev.filter(
            m => m.author.id === client.user.id
              && m.embeds?.[0]?.title?.includes('Verificación de rangos')
          );
          for (const [, msg] of toDelete) {
            await msg.delete().catch(() => {});
          }
        }

        const payload = buildPayload(target);
        await target.send(payload);
        return interaction.editReply('🔁 Embed repuesto.');

      } else {
        return interaction.editReply('Comando no soportado.');
      }

    } catch (err) {
      console.error('verify-embed error:', err);
      if (err?.rawError) {
        console.error('rawError:', err.rawError);
        try { console.error(JSON.stringify(err.rawError, null, 2)); } catch {}
      }
      return interaction.editReply('❌ Ocurrió un error ejecutando el comando.');
    }
  },
};

