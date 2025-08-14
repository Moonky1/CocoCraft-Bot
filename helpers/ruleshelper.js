// helpers/rulesHelper.js
const { EmbedBuilder } = require('discord.js');

// Puedes cambiarlo por ENV si quieres: process.env.RULES_CHANNEL_ID
const RULES_CHANNEL_ID = '1399202510367096973';

/**
 * Publica un embed de reglas en el canal de reglas.
 * @param {CommandInteraction} interaction
 * @param {Object} options
 * @param {number} options.color        - Color del embed (ej. 0x22c55e)
 * @param {string[]|string} options.lines - Texto del embed (array -> se une con \n)
 * @param {Attachment|null} options.banner - Adjuntar imagen arriba (opcional)
 * @param {string} [options.channelId]  - Canal alterno opcional; por defecto RULES_CHANNEL_ID
 */
async function postRules(interaction, { color, lines, banner, channelId = RULES_CHANNEL_ID } = {}) {
  await interaction.deferReply({ ephemeral: true });

  const channel = await interaction.client.channels.fetch(channelId).catch(() => null);
  if (!channel) {
    return interaction.editReply('❌ No pude encontrar el canal de reglas. Revisa el ID.');
  }

  const files = [];
  if (banner && banner.url) {
    files.push({ attachment: banner.url, name: banner.name || 'banner.png' }); // imagen “por fuera” del embed
  }

  const description =
    Array.isArray(lines) ? lines.filter(Boolean).join('\n') : String(lines || '');

  const embed = new EmbedBuilder()
    .setColor(color)
    .setDescription(description); // sin .setTimestamp()

  const msg = await channel.send({
    files,
    embeds: [embed],
    allowedMentions: { parse: [] },
  });

  await interaction.editReply(`✅ Publicado en <#${channel.id}>. ${msg.url}`);
  return msg;
}

module.exports = { postRules, RULES_CHANNEL_ID };
