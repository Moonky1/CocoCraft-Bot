// commands/user.js
const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder, time } = require('discord.js');
const { Rcon } = require('rcon-client');
const fs = require('fs');
const path = require('path');

// Acepta tus nombres de variables antiguos y los nuevos:
const RCON_HOST = process.env.MC_RCON_HOST || process.env.MC_HOST;
const RCON_PORT = Number(process.env.MC_RCON_PORT || process.env.RCON_PORT || 25575);
const RCON_PASS = process.env.MC_RCON_PASSWORD || process.env.MC_PASSWORD;

const LINKS_PATH = path.join(process.cwd(), 'links.json');

function isLikelyMcName(str) { return /^[A-Za-z0-9_]{3,16}$/.test(str || ''); }
function stripColors(s) {
  return String(s ?? '')
    .replace(/§[0-9A-FK-ORa-fk-or]/g, '')
    .replace(/&[0-9A-FK-ORa-fk-or]/g, '')
    .trim();
}
function invalidPlaceholder(v){ return !v || String(v).includes('%'); }
function toEpochSeconds(nLike){
  const n = Number(String(nLike).trim());
  if (!isFinite(n) || n <= 0) return null;
  return n > 1e10 ? Math.floor(n/1000) : Math.floor(n);
}
function guessMcNameFromMember(m){
  if (m?.nickname && isLikelyMcName(m.nickname)) return m.nickname;
  try{
    if (fs.existsSync(LINKS_PATH)){
      const map = JSON.parse(fs.readFileSync(LINKS_PATH,'utf8')||'{}');
      if (map[m.id] && isLikelyMcName(map[m.id])) return map[m.id];
    }
  }catch{}
  return null;
}
async function withRcon(fn){
  if (!RCON_HOST || !RCON_PASS) throw new Error('RCON no configurado');
  const r = await Rcon.connect({ host:RCON_HOST, port:RCON_PORT, password:RCON_PASS });
  try { return await fn(r); } finally { try{ r.end(); }catch{} }
}

// ---------- PAPI ----------
async function fetchViaPapi(player){
  // Probamos múltiples variantes de Towny/TownyAdvanced
  const candidates = [
    '%player_first_played%',                 // 0
    '%player_last_played%',                  // 1
    '%towny_town%',                          // 2
    '%towny_resident_about%',                // 3
    '%towny_resident_town%',                 // 4
    '%townyadvanced_town%',                  // 5
    '%townyadvanced_resident_about%',        // 6
    '%townyadvanced_resident_town%',         // 7
    '%townyadvanced_resident_registered%',   // 8
    '%townyadvanced_resident_lastonline%'    // 9
  ];
  const raw = await withRcon(r => r.send(`papi parse ${player} ${candidates.join('|')}`));
  const line = String(raw||'').trim().split('\n').pop();
  const p = line.split('|').map(x => stripColors(x));

  const firstPlayed = toEpochSeconds(p[0]) || toEpochSeconds(p[8]);
  const lastPlayed  = toEpochSeconds(p[1]) || toEpochSeconds(p[9]);

  // elegir el primer town que no venga vacío ni con %
  const town = [p[2], p[4], p[5], p[7]].find(v => v && !v.includes('%')) || '';
  const about = [p[3], p[6]].find(v => v && !v.includes('%')) || '';

  return { firstPlayed, lastPlayed, town, about };
}


// ---------- Fallback /res (soporta ES/EN y varios comandos) ----------
async function fetchViaResident(player){
  const tryCmds = [
    `resident ${player}`,
    `res ${player}`,
    `towny:resident ${player}`
  ];
  let out = '';
  await withRcon(async r => {
    for (const cmd of tryCmds){
      const resp = await r.send(cmd);
      if (resp && !/Unknown command|Type .help|No such resident|No player by the name/i.test(resp)) {
        out = resp; break;
      }
    }
  });
  const lines = String(out||'').split('\n').map(stripColors);

  // Soporta español/inglés y distintas posiciones
  const getAfterColon = s => s.split(':').slice(1).join(':').trim();

  let town = '', about = '', firstTxt = '', lastTxt = '';
  for (const l of lines){
    const L = l.toLowerCase();
    if (!town     && (L.startsWith('town:')        || L.startsWith('ciudad:')))        town     = getAfterColon(l);
    if (!about    && (L.startsWith('about:')       || L.startsWith('acerca de:')))     about    = getAfterColon(l);
    if (!firstTxt && (L.startsWith('registered:')  || L.startsWith('registrado:')))    firstTxt = getAfterColon(l);
    if (!lastTxt  && (L.startsWith('last online:') || L.startsWith('última conexión:'))) lastTxt = getAfterColon(l);
  }
  // Si el about es el mensaje por defecto de ayuda, lo consideramos vacío
  if (/\/res\s+set\s+about/i.test(about)) about = '';

  const parseLoose = s => {
    if (!s) return null;
    const ms = Date.parse(s.replace('@','').trim());
    return isFinite(ms) ? Math.floor(ms/1000) : null;
  };

  return {
    firstPlayed: parseLoose(firstTxt),
    lastPlayed : parseLoose(lastTxt),
    town,
    about
  };
}


// ---------- Wrapper final ----------
async function fetchMcProfile(mcName){
  let data = {};
  try { data = await fetchViaPapi(mcName); } catch {}
  if ((!data.town && !data.about) || (data.firstPlayed==null && data.lastPlayed==null)) {
    try {
      const fb = await fetchViaResident(mcName);
      data.firstPlayed = data.firstPlayed ?? fb.firstPlayed;
      data.lastPlayed  = data.lastPlayed  ?? fb.lastPlayed;
      data.town  = data.town  || fb.town;
      data.about = data.about || fb.about;
    } catch {}
  }
  return {
    firstPlayed: data.firstPlayed ?? null,
    lastPlayed : data.lastPlayed  ?? null,
    town: data.town || '',
    about: data.about || ''
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('user')
    .setDescription('Muestra registro, última conexión, ciudad y “acerca de” del jugador vinculado')
    .addUserOption(o =>
      o.setName('usuario').setDescription('Usuario de Discord (opcional)')),

  async execute(interaction){
    await interaction.deferReply({ ephemeral: true });

    const chosen = interaction.options.getUser('usuario') || interaction.user;
    const member = interaction.guild.members.cache.get(chosen.id)
      || await interaction.guild.members.fetch(chosen.id).catch(() => null);

    const mcName = member ? guessMcNameFromMember(member) : null;

    // Miniatura: si tengo nick, SIEMPRE skin; si no, avatar de Discord
    const thumb = mcName
      ? `https://minotar.net/avatar/${encodeURIComponent(mcName)}/128`
      : chosen.displayAvatarURL({ extension: 'png', size: 128 });

    let firstPlayed=null, lastPlayed=null, town='', about='';
    if (mcName){
      try { ({ firstPlayed, lastPlayed, town, about } = await fetchMcProfile(mcName)); }
      catch {}
    }

    const title = mcName ? `👤 ${mcName}` : `👤 ${chosen.username}`;
    const embed = new EmbedBuilder()
      .setAuthor({ name: 'CocoCraft🥥 | Minecraft Server', iconURL: interaction.guild.iconURL({ size: 64 }) || undefined })
      .setTitle(title)
      .setColor(0xD3D3D3)
      .setThumbnail(thumb)
      .addFields(
        { name: '📅 Registrado',       value: firstPlayed ? time(firstPlayed, 'F') : '—', inline: true },
        { name: '🕒 Última conexión',  value: lastPlayed  ? time(lastPlayed,  'F') : '—', inline: true },
        { name: '🏙️ Ciudad',          value: town  || '—', inline: false },
        { name: '📝 Acerca de',        value: (about || '—').slice(0, 512), inline: false },
      )
      .setFooter({ text: 'CocoCraft🥥 | Minecraft Server' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed], ephemeral: true });
  }
};
