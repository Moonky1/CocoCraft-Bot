// commands/suggest.js
const {
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const path = require('path');

// Canal fijo de sugerencias (publica SIEMPRE ahí)
const SUGGEST_CHANNEL_ID = '1399206595128463521';

// Tus emojis (custom)
const EMOJI_APPROVE = 'a:check:1403993546901684265';   // animado
const EMOJI_NEUTRAL = 'jum:1403993593579835422';       // estático
const EMOJI_DENY    = 'a:denied:1403993575439728783';  // animado

// Helper: intenta reaccionar con custom, si falla usa unicode
async function reactTry(message, emoji, fallback) {
  try { await message.react(emoji); }
  catch { try { await message.react(fallback); } catch {} }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('suggest')
    .setDescription('Envía una sugerencia para el servidor')
    .addStringOption(opt =>
      opt.setName('mensaje')
        .setDescription('Tu sugerencia')
        .setRequired(true)
    ),

  async execute(interaction) {
    const mensaje = interaction.options.getString('mensaje', true).slice(0, 2000);

    // Busca el canal de sugerencias
    const canal = interaction.guild.channels.cache.get(SUGGEST_CHANNEL_ID);
    if (!canal) {
      return interaction.reply({
        content: '❌ No encontré el canal de sugerencias. Revisa el ID.',
        ephemeral: true,
      });
    }

    // Permisos mínimos en el canal destino
    const me = interaction.guild.members.me;
    const perms = canal.permissionsFor(me);
    if (!perms?.has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AddReactions])) {
      return interaction.reply({
        content: '❌ No tengo permisos para enviar embeds o añadir reacciones en #sugerencias.',
        ephemeral: true,
      });
    }

    // Thumbnail local: assets/images/suggest-thumb.png
    const file = new AttachmentBuilder(
      path.join(__dirname, '..', 'assets', 'images', 'suggest-thumb.png')
    ).setName('suggest-thumb.png');

    const embed = new EmbedBuilder()
      .setColor(0xd18be3)
      .setAuthor({
        name: `${interaction.user.username}'s suggestion`,
        iconURL: interaction.user.displayAvatarURL({ extension: 'png', size: 128 }),
      })
      .setDescription(mensaje)
      .setThumbnail('attachment://suggest-thumb.png');

    // Respuesta ephem mientras publicamos
    await interaction.deferReply({ ephemeral: true });

    let msg;
    try {
      msg = await canal.send({ embeds: [embed], files: [file] });
    } catch (err) {
      console.error('suggest send error:', err);
      return interaction.editReply('❌ No pude publicar tu sugerencia en #sugerencias.');
    }

    // Aviso ephem con link al mensaje publicado
    await interaction.editReply(`✅ ¡Sugerencia enviada en <#${SUGGEST_CHANNEL_ID}>! ${msg.url}`);
  },
};
