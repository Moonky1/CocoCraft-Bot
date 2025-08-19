// ./commands/playtimetop.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Rcon } = require('rcon-client');

// --- ENV / Config ---
const RCON_HOST = process.env.MC_HOST;
const RCON_PORT = Number(process.env.RCON_PORT || 25575);      // RCON, NO es MC_PORT
const RCON_PASSWORD = process.env.RCON_PASSWORD;
const RCON_TIMEOUT_MS = parseInt(process.env.RCON_TIMEOUT_MS || '2000', 10);
const PLAYTIME_COMMAND = (process.env.PLAYTIME_COMMAND || 'cmi playtimetop').trim(); // sin "/"

// --- Helpers ---
function assertConfig() {
  if (!RCON_HOST) throw new Error('MC_HOST no definido');
  if (!RCON_PASSWORD) throw new Error('RCON_PASSWORD no definido');
  if (!Number.isInteger(RCON_PORT) || RCON_PORT <= 0 || RCON_PORT >= 65536) {
    throw new Error(`RCON_PORT inválido: "${process.env.RCON_PORT}"`);
  }
}

async function rconSend(cmd) {
  assertConfig();
  const rcon = await Rcon.connect({
    host: RCON_HOST,
    port: RCON_PORT,
    password: RCON_PASSWORD,
    timeout: RCON_TIMEOUT_MS
  });
  try {
    const res = await rcon.send(cmd); // nunca con "/"
    return res;
  } finally {
    await rcon.end().catch(() => {});
  }
}

// Limpia códigos de color § y ANSI
function stripColors(s) {
  return s
    .replace(/\u00A7[0-9A-FK-OR]/gi, '')
    .replace(/\x1b\[[0-9;]*m/g, '')
    .trim();
}

// Intenta parsear varias formas comunes de salida (CMI y otros)
function parsePlaytimeTop(raw) {
  const lines = stripColors(raw).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const rows = [];

  // Formatos típicos: "1. Steve - 5d 3h", "#2 Alex: 12h 10m", "3) Player — 1d 2h"
  for (const line of lines) {
    const m = line.match(
      /^#?\s*(\d{1,2})[).:\-–]?\s+([A-Za-z0-9_]{1,16})\s*(?:[-–:>|]\s*)?(.+?)$/
    );
    if (m) {
      const rank = parseInt(m[1], 10);
      const name = m[2];
      const time = m[3].replace(/(seconds?|mins?|hours?|days?)/gi, (t) => t.toLowerCase()); // cosmetico
      if (!Number.isNaN(rank) && time && !/top|page|playtime/i.test(name)) {
        rows.push({ rank, name, time });
      }
    }
  }

  if (rows.length) {
    return rows
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 10)
      .map(r => `**#${r.rank}** — \`${r.name}\` • ${r.time}`);
  }

  // Fallback muy laxo: usa primeras 10 líneas que parezcan datos
  return lines
    .filter(l => !/playtime|top|page/i.test(l))
    .slice(0, 10)
    .map((l, i) => `**#${i + 1}** — ${l}`);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('playtimetop')
    .setDescription('Muestra el Top 10 de tiempo jugado (consulta en vivo por RCON).')
    .addBooleanOption(o =>
      o.setName('live')
       .setDescription('Actualizar automáticamente por 30s')
       .setRequired(false)
    ),

  async execute(interaction) {
    const live = interaction.options.getBoolean('live') ?? false;
    await interaction.deferReply(); // público

    const updateOnce = async () => {
      let raw;
      try {
        raw = await rconSend(PLAYTIME_COMMAND); // ej: "cmi playtimetop"
      } catch (e) {
        await interaction.editReply({
          content: `❌ No pude obtener el top vía RCON: ${e.message}`
        });
        return false;
      }

      const list = parsePlaytimeTop(raw);
      const embed = new EmbedBuilder()
        .setColor('#4cadd0')
        .setTitle('Top 10 — PlayTime')
        .setDescription(list.length ? list.join('\n') : 'No pude leer resultados.')
        .setFooter({ text: live ? 'Actualizando…' : 'Consulta en vivo (RCON)' })
        .setTimestamp();

      await interaction.editReply({ content: '', embeds: [embed] });
      return true;
    };

    const ok = await updateOnce();
    if (!ok || !live) return;

    // Auto-refresh 30s (cada 5s)
    const until = Date.now() + 30_000;
    while (Date.now() < until) {
      await new Promise(r => setTimeout(r, 5000));
      try { await updateOnce(); } catch {}
    }
  }
};
