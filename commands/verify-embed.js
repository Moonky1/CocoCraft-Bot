// commands/verify-embed.js
const {
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require('discord.js');
const path = require('path');
const fs = require('fs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verify-embed')
    .setDescription('Publica el embed de verificación')
    .addSubcommand((sc) =>
      sc
        .setName('publicar')
        .setDescription('Publicar en el canal de verificación')
        .addChannelOption((opt) =>
          opt
            .setName('canal')
            .setDescription('Canal destino (opcional, usa VERIFY_CHANNEL_ID si no)')
            .addChannelTypes(ChannelType.GuildText) // solo canales de texto del servidor
            .setRequired(false)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    try {
      const sub = interaction.options.getSubcommand(true);
      if (sub !== 'publicar') {
        return interaction.reply({ content: '❌ Subcomando no válido.', ephemeral: true });
      }

      // Canal: opción del comando o por .env
      const providedChannel = interaction.options.getChannel('canal') || null;
      const envId = process.env.VERIFY_CHANNEL_ID;
      const envChannel =
        envId && interaction.guild.channels.cache.get(envId)
          ? interaction.guild.channels.cache.get(envId)
          : null;

      const channel = providedChannel ?? envChannel;

      if (!channel) {
        return interaction.reply({
          content: '⚠️ VERIFY_CHANNEL_ID no apunta a un canal válido y no se proporcionó uno.',
          ephemeral: true,
        });
      }

      // Validaciones de envío
      if (!channel.isTextBased?.() || channel.type !== ChannelType.GuildText) {
        return interaction.reply({
          content: '⚠️ El canal seleccionado no es un canal de texto del servidor.',
          ephemeral: true,
        });
      }

      const me = interaction.guild.members.me;
      const canSend =
        channel
          .permissionsFor(me)
          ?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]) ?? false;

      if (!canSend) {
        return interaction.reply({
          content: '⚠️ No tengo permisos para enviar mensajes en ese canal (ViewChannel/SendMessages).',
          ephemeral: true,
        });
      }

      // Construcción del embed
      const canalMencion = `<#${channel.id}>`;
      const delaySec = Math.max(5, Math.floor((Number(process.env.VERIFY_DELETE_DELAY_MS || 15000)) / 1000));

      const embed = new EmbedBuilder()
        .setColor(0x000000)
        .setTitle('✅ Verificación de rangos')
        .setDescription([
          '### ¿Cómo me verifico?',
          '• Entra al servidor y escribe **/discord link**',
          '• Copia el **código** que te entrega el juego (ej. **8323**).',
          `• Vuelve a ${canalMencion} y pega **solo el número**. El bot lo borrará en ~${delaySec}s y te confirmará por **DM**.`,
          '',
          '### ¿Debo hacerlo por cada modalidad?',
          'Sí, manejamos rangos por **modalidad**, así que la verificación es por cada modo.',
          '',
          '### ¿Qué gano al verificar?',
          'Sincronizamos tus compras/rangos con tus **roles de Discord** y obtienes la etiqueta **verificado**.',
          '',
          '### ¿Ya estabas vinculado?',
          'Si compraste rangos nuevos o recibiste boosters, vuelve a verificar para actualizar tus roles.',
          '',
          '> ℹ️ Si no recibes DM, habilita **Allow direct messages from server members** en la configuración de privacidad del servidor.',
        ].join('\n'));

      // Banner (fuera del embed) si existe
      const bannerPath = path.join(__dirname, '../assets/images/verify-banner.png');
      const files = [];
      try {
        if (fs.existsSync(bannerPath)) {
          files.push(new AttachmentBuilder(bannerPath, { name: 'verify-banner.png' }));
        }
      } catch (err) {
        console.warn('[verify-embed] No se pudo leer el banner:', err?.message || err);
      }

      // Envío (primero banner si hay, luego embed)
      if (files.length) await channel.send({ files });
      await channel.send({ embeds: [embed] });

      return interaction.reply({ content: '✅ Publicado.', ephemeral: true });
    } catch (err) {
      console.error('[verify-embed] Error:', err);
      if (interaction.deferred || interaction.replied) {
        return interaction.editReply('❌ Ocurrió un error publicando el embed.');
      }
      return interaction.reply({ content: '❌ Ocurrió un error publicando el embed.', ephemeral: true });
    }
  },
};
