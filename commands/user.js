// commands/user.js
const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder, time } = require('discord.js');
const { Rcon } = require('rcon-client');
const fs = require('fs');
const path = require('path');

const RCON_HOST = process.env.MC_RCON_HOST;
const RCON_PORT = Number(process.env.MC_RCON_PORT || 25575);
const RCON_PASS = process.env.MC_RCON_PASSWORD;

// (Opcional) mapa manual DiscordID -> Nick de Minecraft si no usas nickname sincronizado
const LINKS_PATH = path.join(process.cwd(), 'links.json');

function isLikelyMcName(str) {
  return /^[A-Za-z0-9_]{3,16}$/.test(str || '');
}

function cleanColors(s) {
  if (!s) return s;
  // quita códigos §x y &x
  return String(s).replace(/§[0-9A-FK-ORa-fk-or]/g, '').replace(/&[0-9A-FK-ORa-fk-or]/g, '').trim();
}

function firstNonEmpty(...vals) {
  for (const v of vals) {
    const t = String(v ?? '').trim();
    if (t && !/^null|none|n\/a|desconocido$/i.test(t)) return t;
  }
  return '';
}

function toEpochSeconds(msOrSecLike) {
  const n = Number(msOrSecLike);
  if (!isFinite(n) || n <= 0) return null;
  // Player placeholders suelen ser ms → convierto
  return n > 1e10 ? Math.floor(n / 1000) : Math.floor(n);
}

async function withRcon(fn) {
  if (!RCON_HOST || !RCON_PASS) throw new Error('RCON no configurado');
  const rcon = await Rcon.connect({ host: RCON_HOST, port: RCON_PORT, password: RCON_PASS });
  try {
    return await fn(rcon);
  } finally {
    try { rcon.end(); } catch {}
  }
}

function guessMcNameFromMember(member) {
  if (member?.nickname && isLikelyMcName(member.nickname)) return member.nickname;
  try {
    if (fs.existsSync(LINKS_PATH)) {
      const map = JSON.parse(fs.readFileSync(LINKS_PATH, 'utf8') || '{}');
      if (map[member.id] && isLikelyMcName(map[member.id])) return map[member.id];
    }
  } catch {}
  return null;
}

async function fetchViaPapi(playerName) {
  // Intentamos varios placeholders (Towny puede ser Towny o TownyAdvanced según expansión)
  const toParse = [
    '%player_first_played%',
    '%player_last_played%',
    '%townyadvanced_town%',
    '%towny_town%',
    '%townyadvanced_resident_about%',
    '%towny_resident_about%',
  ].join('|');

  const raw = await withRcon(r => r.send(`papi parse ${playerName} ${toParse}`));
  const line = String(raw || '').trim().split('\n').pop(); // última línea útil
  const parts = line.split('|').map(x => cleanColors(x));

  const firstPlayed = toEpochSeconds(parts[0]);
  const lastPlayed  = toEpochSeconds(parts[1]);
  const town        = firstNonEmpty(parts[2], parts[3]);
  const about       = firstNonEmpty(parts[4], parts[5]);

  return { firstPlayed, lastPlayed, town, about };
}

async function fetchViaResidentCommand(playerName) {
  const out = await withRcon(r => r.send(`resident ${playerName}`));
  const lines = String(out || '').split('\n').map(l => cleanColors(l));

  const townLine  = lines.find(l => /^(Town:|Ciudad:)/i.test(l));
  const aboutLine = lines.find(l => /^(About:|Acerca de:)/i.test(l));

  const town  = townLine  ? townLine.split(':').slice(1).join(':').trim()  : '';
  const about = aboutLine ? aboutLine.split(':').slice(1).join(':').trim() : '';

  // Resident no trae fechas; devolvemos solo town/about
  return { town, about };
}

async function fetchMcProfile(mcName) {
  // 1) PAPI
  let data = {};
  try { data = await fetchViaPapi(mcName); } catch {}

  // 2) Fallback para town/about si están vacíos
  if (!data.town || !data.about) {
    try {
      const fb = await fetchViaResidentCommand(mcName);
      data.town  = data.town  || fb.town;
      data.about = data.about || fb.about;
    } catch {}
  }

  return {
    firstPlayed: data.firstPlayed || null,
    lastPlayed : data.lastPlayed  || null,
    town       : data.town || '',
    about      : data.about || '',
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('user')
    .setDescription('Muestra fecha de registro, última conexión, ciudad y “acerca de” del jugador')
    .addUserOption(opt =>
      opt.setName('usuario')
        .setDescription('Usuario de Discord (opcional, por defecto tú)')
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const chosen = interaction.options.getUser('usuario') || interaction.user;
    const member = interaction.guild.members.cache.get(chosen.id)
      || await interaction.guild.members.fetch(chosen.id).catch(() => null);

    // Detectar nick de Minecraft
    const mcName = member ? guessMcNameFromMember(member) : null;

    // Miniatura por defecto (avatar de Discord)
    let thumb = chosen.displayAvatarURL({ extension: 'png', size: 128 });

    // Datos de Minecraft
    let firstPlayed = null;
    let lastPlayed  = null;
    let town        = '';
    let about       = '';

    if (mcName) {
      try {
        const mc = await fetchMcProfile(mcName);
        firstPlayed = mc.firstPlayed;
        lastPlayed  = mc.lastPlayed;
        town        = mc.town;
        about       = mc.about;

        // Cara de la skin
        thumb = `https://minotar.net/avatar/${encodeURIComponent(mcName)}/128`;
      } catch {
        // si falla, dejamos valores por defecto
      }
    }

    // Título: mostramos el nick de MC si lo tenemos; si no, el username de Discord
    const titleText = mcName ? `👤 ${mcName}` : `👤 ${chosen.username}`;

    // Limitar “acerca de” a 512 chars para ir sobrado del límite de Discord
    const aboutShort = (about || '—').slice(0, 512);

    const embed = new EmbedBuilder()
      .setAuthor({
        name: 'CocoCraft🥥 | Minecraft Server',
        iconURL: interaction.guild.iconURL({ size: 64 }) || undefined
      })
      .setTitle(titleText)
      .setColor(0xD3D3D3) // gris claro
      .setThumbnail(thumb)
      .addFields(
        {
          name: '📅 Registrado',
          value: firstPlayed ? time(firstPlayed, 'F') : '—',
          inline: true
        },
        {
          name: '🕒 Última conexión',
          value: lastPlayed ? time(lastPlayed, 'F') : '—',
          inline: true
        },
        {
          name: '🏙️ Ciudad',
          value: town || '—',
          inline: false
        },
        {
          name: '📝 Acerca de',
          value: aboutShort,
          inline: false
        },
      )
      .setFooter({ text: 'CocoCraft🥥 | Minecraft Server' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed], ephemeral: true });
  },
};
