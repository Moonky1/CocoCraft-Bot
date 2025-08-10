// commands/suggest.js
const {
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const path = require('path');

// Canal fijo de sugerencias
const SUGGEST_CHANNEL_ID = '1399206595128463521';

// Emojis custom (los tuyos)
const EMOJI_APPROVE = 'a:check:1403993546901684265';
const EMOJI_NEUTRAL = 'jum:1403993593579835422';
const EMOJI_DENY    = 'a:denied:1403993575439728783';

// Cuánto tiempo mostrar el OK efímero antes de borrarlo
const CONFIRM_TTL_MS = Number(process.env.SUGGEST_CONFIRM_TTL_MS || 3500);

// Helper: reacciona con fallback unicode si falla el custom
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

    // Canal destino
    const canal = interaction.guild.channels.cache.get(SUGGEST_CHANNEL_ID);
    if (!canal) {
      return interaction.reply({
        content: '❌ No encontré el canal de sugerencias. Revisa el ID.',
        ephemeral: true,
      });
    }

    // Permisos en el canal destino
    const me = interaction.guild.members.me;
    const perms = canal.permissionsFor(me);
    if (!perms?.has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AddReactions])) {
      return interaction.reply({
        content: '❌ No tengo permisos para enviar embeds o añadir reacciones en #sugerencias.',
        ephemeral: true,
      });
    }

    // Thumbnail local
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

    // Respuesta efímera (se borrará luego)
    await interaction.deferReply({ ephemeral: true });

    // Publica en #sugerencias
    let msg;
    try {
      msg = await canal.send({ embeds: [embed], files: [file] });
    } catch (err) {
      console.error('suggest send error:', err);
      return interaction.editReply('❌ No pude publicar tu sugerencia en #sugerencias.');
    }

    // Reacciones para votar
    await reactTry(msg, EMOJI_APPROVE, '✅');
    await reactTry(msg, EMOJI_NEUTRAL, '🟨');
    await reactTry(msg, EMOJI_DENY, '❌');

    // OK efímero + autodestruir
    await interaction.editReply(`✅ ¡Sugerencia enviada en <#${SUGGEST_CHANNEL_ID}>!`);
    setTimeout(() => interaction.deleteReply().catch(() => {}), CONFIRM_TTL_MS);
  },
};
