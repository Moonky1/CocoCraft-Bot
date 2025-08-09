// commands/verify-embed.js
const {
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const path = require('path');
const fs = require('fs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verify-embed')
    .setDescription('Publica el embed de verificación')
    .addSubcommand(sc =>
      sc
        .setName('publicar')
        .setDescription('Publicar en el canal de verificación')
        .addChannelOption(opt =>
          opt
            .setName('canal')
            .setDescription('Canal donde publicar (opcional, usa VERIFY_CHANNEL_ID si no)')
            .setRequired(false),
        ),
    )
    // que solo admins/gestores del server lo puedan usar
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    try {
      // Canal objetivo: parámetro o .env
      const providedChannel = interaction.options.getChannel('canal');
      const envChannel =
        interaction.guild.channels.cache.get(process.env.VERIFY_CHANNEL_ID);
      const targetChannel = providedChannel ?? envChannel;

      if (!targetChannel) {
        return interaction.reply({
          content: '⚠️ VERIFY_CHANNEL_ID no apunta a un canal válido y no se proporcionó uno.',
          ephemeral: true,
        });
      }

      // — Embed (texto)
      const canal = `<#${targetChannel.id}>`;
      const embed = new EmbedBuilder()
        .setColor(0x00ff77)
        .setTitle('✅  Verificación de rangos')
        .setDescription(
          [
            '### ¿Cómo me verifico?',
            '• Entra al servidor y escribe **/discord link**',
            '• Copia el **código** que te entrega el juego (ej. **8323**).',
            `• Vuelve a ${canal} y pega **solo el número**. El bot lo borrará y te confirmará.`,
            '',
            '### ¿Debo hacerlo por cada modalidad?',
            'Sí, manejamos rangos por **modalidad**, así que la verificación es por cada modo.',
            '',
            '### ¿Qué gano al verificar?',
            'Sincronizamos tus compras/rangos con tus **roles de Discord** y obtienes la etiqueta **verificado**.',
            '',
            '### ¿Ya estaba vinculado?',
            'Si compraste rangos nuevos o recibiste boosters, vuelve a verificar para actualizar tus roles.',
          ].join('\n'),
        )
        .setFooter({ text: 'SC_VERIFY_V1 • Spawn Club' });

      // — Banner por fuera del embed (adjunto)
      // Coloca la imagen en: ./assets/images/verify-banner.png
      const bannerPath = path.join(__dirname, '../assets/images/verify-banner.png');
      let files = [];

      try {
        if (fs.existsSync(bannerPath)) {
          const file = new AttachmentBuilder(bannerPath, { name: 'verify-banner.png' });
          files = [file];
        } else {
          console.warn('[verify-embed] No se encontró el banner en', bannerPath);
        }
      } catch (err) {
        console.warn('[verify-embed] Error leyendo banner:', err);
      }

      // — Enviar: si hay banner, se verá “arriba”; el embed va en el mismo mensaje
      await targetChannel.send(files.length ? { files, embeds: [embed] } : { embeds: [embed] });

      return interaction.reply({ content: '✅ Publicado.', ephemeral: true });
    } catch (err) {
      console.error('[verify-embed] Error:', err);
      if (interaction.deferred || interaction.replied) {
        return interaction.editReply('❌ Ocurrió un error publicando el embed.');
      }
      return interaction.reply({
        content: '❌ Ocurrió un error publicando el embed.',
        ephemeral: true,
      });
    }
  },
};


