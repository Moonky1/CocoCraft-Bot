// helpers/rulesHelper.js
const { EmbedBuilder } = require('discord.js');

const RULES_CHANNEL_ID = '1399202510367096973';

async function postRules(interaction, { color, lines, banner }) {
  await interaction.deferReply({ ephemeral: true });

  const channel = await interaction.client.channels.fetch(RULES_CHANNEL_ID).catch(() => null);
  if (!channel) return interaction.editReply('❌ No pude encontrar el canal de reglas. Revisa el ID.');

  const files = [];
  if (banner) files.push({ attachment: banner.url, name: banner.name || 'banner.png' });

  const embed = new EmbedBuilder()
    .setColor(color)
    .setDescription(lines.join('\n')); // sin hora

  const sent = await channel.send({ files, embeds: [embed], allowedMentions: { parse: [] } });
  return interaction.editReply(`✅ Publicado en <#${RULES_CHANNEL_ID}>. ${sent.url}`);
}

module.exports = { RULES_CHANNEL_ID, postRules };
