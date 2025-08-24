// commands/user.js
const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder, time, userMention } = require('discord.js');
const { Rcon } = require('rcon-client');
const fs = require('fs');
const path = require('path');

const RCON_HOST = process.env.MC_RCON_HOST;
const RCON_PORT = Number(process.env.MC_RCON_PORT || 25575);
const RCON_PASS = process.env.MC_RCON_PASSWORD;

// (Opcional) archivo local para mapeos manuales DiscordID -> MinecraftName
// Útil si NO usas nickname sincronizado.
const LINKS_PATH = path.join(process.cwd(), 'links.json');

function isLikelyMcName(str) {
  return /^[A-Za-z0-9_]{3,16}$/.test(str || '');
}

function formatDuration(totalSeconds) {
  totalSeconds = Math.max(0, Math.floor(totalSeconds || 0));
  const d = Math.floor(totalSeconds / 86400);
  const h = Math.floor((totalSeconds % 86400) / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (s || parts.length === 0) parts.push(`${s}s`);
  return parts.join(' ');
}

/**
 * Convierte el valor bruto de playtime a segundos.
 * - Statistic suele devolver TICKS (20 ticks = 1s). A veces devuelve ms.
 */
function toSecondsFromUnknown(valueRaw) {
  const n = Number(String(valueRaw).trim());
  if (!isFinite(n) || n <= 0) return 0;

  // Heurística:
  // - Si es muy grande (>= 1e10), probablemente milisegundos -> s
  // - Si es > 3600*24*365 (más de 1 año en segundos), quizá son TICKS o ms; probemos TICKS.
  // - En la mayoría de expansiones de PAPI, "statistic_time_played" devuelve TICKS.
  if (n >= 1e10) return Math.floor(n / 1000); // ms -> s
  // asumimos ticks por defecto
  return Math.floor(n / 20); // ticks -> s
}

async function withRcon(fn) {
  if (!RCON_HOST || !RCON_PASS) throw new Error('RCON no configurado (.env)');
  const rcon = await Rcon.connect({ host: RCON_HOST, port: RCON_PORT, password: RCON_PASS });
  try {
    return await fn(rcon);
  } finally {
    try { rcon.end(); } catch {}
  }
}

/**
 * Intenta deducir el nick de Minecraft de un miembro de Discord.
 * 1) Si el nickname del miembro parece un nick de MC, lo usamos.
 * 2) Si existe links.json, buscamos por DiscordID.
 * 3) Si no, devolvemos null.
 */
function guessMcNameFromMember(member) {
  if (member?.nickname && isLikelyMcName(member.nickname)) {
    return member.nickname;
  }
  try {
    if (fs.existsSync(LINKS_PATH)) {
      const raw = fs.readFileSync(LINKS_PATH, 'utf8');
      const map = JSON.parse(raw || '{}');
      if (map[member.id] && isLikelyMcName(map[member.id])) return map[member.id];
    }
  } catch {}
  return null;
}

/**
 * Pide a PlaceholderAPI varios datos en una sola pasada, delimitados por "|".
 * Requiere expansiones: Player y Statistic
 */
async function fetchMcStatsFor(playerName) {
  // player_first_played -> epoch ms (suele ser ms)
  // player_last_played  -> epoch ms (suele ser ms)
  // statistic_time_played -> ticks (habitual)
  const toParse = '%player_first_played%|%player_last_played%|%statistic_time_played%';

  // Nota: al ejecutar desde consola, PAPI devuelve el texto tal cual parseado.
  const cmd = `papi parse ${playerName} ${toParse}`;
  const res = await withRcon(r => r.send(cmd));

  // Buscamos la línea con el resultado. En la mayoría de casos, res YA es el resultado.
  const line = String(res || '').trim();
  const parts = line.split('|').map(x => x.trim());

  if (parts.length < 3) {
    // Algunos servidores anteponen texto; intentamos extraer la última línea utilizable.
    const candidates = line.split('\n').map(s => s.trim()).filter(Boolean);
    const last = candidates[candidates.length - 1] || '';
    const p2 = last.split('|').map(x => x.trim());
    if (p2.length >= 3) return { firstMs: Number(p2[0]), lastMs: Number(p2[1]), rawPlay: p2[2] };
    return { firstMs: null, lastMs: null, rawPlay: null };
  }

  return {
    firstMs: Number(parts[0]),
    lastMs: Number(parts[1]),
    rawPlay: parts[2],
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('user')
    .setDescription('Muestra información de un usuario y sus datos vinculados de Minecraft')
    .addUserOption(opt =>
      opt.setName('usuario')
        .setDescription('Usuario de Discord (opcional, por defecto tú)')),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const chosen = interaction.options.getUser('usuario') || interaction.user;
    const member = interaction.guild.members.cache.get(chosen.id) || await interaction.guild.members.fetch(chosen.id).catch(() => null);

    // Detectar nick de Minecraft
    const mcName = member ? guessMcNameFromMember(member) : null;

    // Consultar datos de MC si tenemos nombre
    let firstJoin = null; // epoch seconds
    let lastSeen = null;  // epoch seconds
    let playtimeText = '—';
    let skinURL = chosen.displayAvatarURL({ extension: 'png', size: 128 });

    if (mcName) {
      try {
        const { firstMs, lastMs, rawPlay } = await fetchMcStatsFor(mcName);

        if (firstMs && Number.isFinite(firstMs)) firstJoin = Math.floor(firstMs / 1000);
        if (lastMs  && Number.isFinite(lastMs )) lastSeen  = Math.floor(lastMs  / 1000);

        if (rawPlay != null) {
          const secs = toSecondsFromUnknown(rawPlay);
          playtimeText = secs ? formatDuration(secs) : '0s';
        }

        // Miniatura con la skin del jugador (crafatar/minotar)
        skinURL = `https://minotar.net/avatar/${encodeURIComponent(mcName)}/128`;
      } catch (e) {
        // Si falla RCON/PAPI, dejamos los campos en —
      }
    }

    const embed = new EmbedBuilder()
      .setAuthor({
        name: interaction.guild.name,
        iconURL: interaction.guild.iconURL({ size: 64 }) || undefined
      })
      .setTitle(`👤 ${chosen.username}`)
      .setColor(0xD3D3D3) // gris claro (rallita del embed)
      .setThumbnail(skinURL)
      .addFields(
        {
          name: '🧷 Minecraft',
          value: mcName ? `**${mcName}**` : 'No vinculado',
          inline: true
        },
        {
          name: '📥 Primera vez en el servidor',
          value: firstJoin ? time(firstJoin, 'F') : '—',
          inline: true
        },
        {
          name: '⏱️ Playtime',
          value: playtimeText,
          inline: true
        },
        {
          name: '🕒 Última conexión',
          value: lastSeen ? time(lastSeen, 'R') : '—',
          inline: true
        },
        {
          name: '📅 Se unió al Discord',
          value: member?.joinedTimestamp ? time(Math.floor(member.joinedTimestamp / 1000), 'R') : 'Desconocido',
          inline: true
        },
        {
          name: '🏷️ Roles',
          value: member
            ? member.roles.cache
                .filter(r => r.id !== interaction.guild.id)
                .map(r => r.name)
                .join(', ') || '—'
            : '—',
          inline: false
        }
      )
      .setFooter({ text: 'CocoCraft | Minecraft Server' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed], ephemeral: true });
  },
};
