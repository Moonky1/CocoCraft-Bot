// commands/suggest.js
const {
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder,
} = require('discord.js');
const path = require('path');

// Canal donde se publican las sugerencias
const SUGGEST_CHANNEL_ID = process.env.SUGGEST_CHANNEL_ID || 'PON_AQUI_TU_CANAL_ID';

// Emojis (los tuyos, con fallback a .env si los pones allí)
const EMOJI_APPROVE = process.env.SUGGEST_EMOJI_APPROVE || 'a:check:1403993546901684265';   // animado
const EMOJI_NEUTRAL = process.env.SUGGEST_EMOJI_NEUTRAL || 'jum:1403993593579835422';       // estático
const EMOJI_DENY    = process.env.SUGGEST_EMOJI_DENY    || 'a:denied:1403993575439728783';  // animado

// Pequeña ayuda para reaccionar con fallback si el emoji custom falla
async function reactTry(message, emoji, fallback) {
  try {
    await message.react(emoji);            // p.ej. 'a:check:ID' o 'name:ID'
  } catch {
    try { await message.react(fallback); } // p.ej. '✅', '🟨', '❌'
    catch { /* ignorar */ }
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('suggest')
    .setDescription('Envía una sugerencia a la comunidad')
    .addStringOption(opt =>
      opt.setName('mensaje')
        .setDescription('Tu sugerencia')
        .setRequired(true)
    ),

  async execute(interaction) {
    const mensaje = interaction.options.getString('mensaje', true).slice(0, 2000);

    // Verifica canal de sugerencias
    const canal = interaction.guild.channels.cache.get(SUGGEST_CHANNEL_ID);
    if (!canal) {
      return interaction.reply({
        content: '❌ No se encontró el canal de sugerencias. Revisa `SUGGEST_CHANNEL_ID`.',
        ephemeral: true,
      });
    }

    // Obliga a usar el comando en ese canal
    if (interaction.channelId !== canal.id) {
      return interaction.reply({
        content: `❗ Usa este comando en <#${canal.id}>.`,
        ephemeral: true,
      });
    }

    // Prepara el thumbnail local (assets/images/suggest-thumb.png)
    // Nota: este archivo debe existir en el repo.
    const file = new AttachmentBuilder(
      path.join(__dirname, '..', 'assets', 'images', 'suggest-thumb.png'),
    ).setName('suggest-thumb.png');

    // Embed
    const embed = new EmbedBuilder()
      .setColor(0xd18be3)
      .setAuthor({
        name: `${interaction.user.username}'s suggestion`,
        iconURL: interaction.user.displayAvatarURL({ extension: 'png', size: 128 }),
      })
      .setDescription(mensaje)
      .setThumbnail('attachment://suggest-thumb.png'); // usa el adjunto local

    await interaction.deferReply({ ephemeral: true });

    // Publica en el canal
    let msg;
    try {
      msg = await canal.send({ embeds: [embed], files: [file] });
    } catch (err) {
      console.error('suggest send error:', err);
      return interaction.editReply('❌ No pude publicar tu sugerencia. Revisa permisos del bot en el canal.');
    }

    await interaction.editReply('✅ ¡Sugerencia enviada!');
  },
};
