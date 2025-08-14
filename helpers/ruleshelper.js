// helpers/rulesHelper.js
const { EmbedBuilder } = require('discord.js');
const RULES_CHANNEL_ID = '1399202510367096973';

async function postRules(interaction, { color, lines, banner, channelId = RULES_CHANNEL_ID } = {}) {
  await interaction.deferReply({ ephemeral: true });

  const channel = await interaction.client.channels.fetch(channelId).catch(() => null);
  if (!channel) return interaction.editReply('❌ No pude encontrar el canal de reglas. Revisa el ID.');

  const files = [];
  if (banner?.url) files.push({ attachment: banner.url, name: banner.name || 'banner.png' });

  const embed = new EmbedBuilder()
    .setColor(color)
    .setDescription((Array.isArray(lines) ? lines : [lines]).filter(Boolean).join('\n'));

  const msg = await channel.send({ files, embeds: [embed], allowedMentions: { parse: [] } });
  await interaction.editReply(`✅ Publicado en <#${channel.id}>. ${msg.url}`);
  return msg;
}

module.exports = { postRules, RULES_CHANNEL_ID };
