// ./commands/playtimetop.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Rcon } = require('rcon-client');

const PLAYTIME_COMMAND = process.env.PLAYTIME_COMMAND || 'cmi playtimetop';
const RCON_TIMEOUT_MS = parseInt(process.env.RCON_TIMEOUT_MS || '2000', 10);

async function fetchTop() {
  const rcon = await Rcon.connect({
    host: process.env.MC_HOST,
    port: parseInt(process.env.RCON_PORT, 10),
    password: process.env.RCON_PASSWORD,
    timeout: RCON_TIMEOUT_MS
  });
  const res = await rcon.send(PLAYTIME_COMMAND); // sin "/"
  await rcon.end();
  return res;
}

function parseTop(text) {
  // quitar códigos de color (§x) y ANSI
  const clean = text
    .replace(/\u00A7[0-9A-FK-OR]/gi, '')
    .replace(/\x1b\[[0-9;]*m/g, '');
  const lines = clean.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  // buscar líneas con formato tipo "1. Nombre - 5d 3h" (flexible)
  const rows = [];
  for (const line of lines) {
    const m = line.match(/^#?\s*(\d{1,2})[).:-]?\s+([A-Za-z0-9_]+)\s*[-–:]\s*(.+)$/);
    if (m) rows.push({ rank: parseInt(m[1], 10), name: m[2], time: m[3] });
  }

  if (rows.length >= 3) {
    return rows.sort((a,b) => a.rank - b.rank).slice(0, 10)
      .map(r => `**#${r.rank}** — \`${r.name}\` • ${r.time}`);
  }

  // fallback: primeras 10 líneas sin header
  const header = lines.findIndex(l => /playtime|top/i.test(l));
  const body = header >= 0 ? lines.slice(header + 1) : lines;
  return body.slice(0, 10).map((l, i) => `**#${i+1}** — ${l}`);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('playtimetop')
    .setDescription('Muestra el Top 10 de tiempo jugado (consulta por RCON).')
    .addBooleanOption(o => o
      .setName('live')
      .setDescription('Actualizar automáticamente por 30s')
      .setRequired(false)
    ),
  async execute(interaction) {
    await interaction.deferReply(); // público en el canal

    const live = interaction.options.getBoolean('live') ?? false;

    const updateOnce = async () => {
      let raw;
      try {
        raw = await fetchTop();
      } catch (e) {
        await interaction.editReply({ content: `❌ No pude obtener el top vía RCON: ${e.message}` });
        return false;
      }
      const list = parseTop(raw);
      const embed = new EmbedBuilder()
        .setColor('#4cadd0')
        .setTitle('Top 10 — PlayTime')
        .setDescription(list.join('\n'))
        .setFooter({ text: live ? 'Actualizando…' : 'Consulta en vivo (RCON)' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed], content: '' });
      return true;
    };

    const ok = await updateOnce();
    if (!ok || !live) return;

    // Auto-refresh: 30s total, cada 5s
    const start = Date.now();
    while (Date.now() - start < 30_000) {
      await new Promise(r => setTimeout(r, 5000));
      try { await updateOnce(); } catch {}
    }
  }
};
