// commands/user.js
const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder, time } = require('discord.js');
const { Rcon } = require('rcon-client');
const fs = require('fs');
const path = require('path');

// Vars RCON (acepta tus nombres antiguos y nuevos)
const RCON_HOST = process.env.MC_RCON_HOST || process.env.MC_HOST;
const RCON_PORT = Number(process.env.MC_RCON_PORT || process.env.RCON_PORT || 25575);
const RCON_PASS = process.env.MC_RCON_PASSWORD || process.env.MC_PASSWORD;
const DEBUG = process.env.DEBUG_PAPI === '1';

const LINKS_PATH = path.join(process.cwd(), 'links.json');

const isMcName = s => /^[A-Za-z0-9_]{3,16}$/.test(s || '');
const strip = s => String(s ?? '')
  .replace(/§[0-9A-FK-ORa-fk-or]/g, '')
  .replace(/&[0-9A-FK-ORa-fk-or]/g, '')
  .trim();

function toEpochSeconds(nLike){
  const n = Number(String(nLike).trim().replace(/[, ]/g,''));
  if (!isFinite(n) || n <= 0) return null;
  return n > 1e10 ? Math.floor(n/1000) : Math.floor(n);
}

function guessMcNameFromMember(m){
  if (m?.nickname && isMcName(m.nickname)) return m.nickname;
  try {
    if (fs.existsSync(LINKS_PATH)) {
      const map = JSON.parse(fs.readFileSync(LINKS_PATH,'utf8')||'{}');
      if (map[m.id] && isMcName(map[m.id])) return map[m.id];
    }
  } catch {}
  if (m?.user?.username && isMcName(m.user.username)) return m.user.username; // fallback
  return null;
}

async function withRcon(fn){
  if (!RCON_HOST || !RCON_PASS) throw new Error('RCON no configurado (MC_RCON_HOST/PORT/PASSWORD o MC_HOST/RCON_PORT/MC_PASSWORD)');
  const r = await Rcon.connect({ host:RCON_HOST, port:RCON_PORT, password:RCON_PASS });
  try { return await fn(r); } finally { try{ r.end(); }catch{} }
}

// ---------- PAPI (multi-variantes + separador | o /) ----------
async function fetchViaPapi(player){
  const ph = [
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
  const raw = await withRcon(r => r.send(`papi parse ${player} ${ph.join('|')}`));
  if (DEBUG) console.log('[PAPI RAW]', raw);

  const last = String(raw||'').trim().split('\n').pop();
  const p = last.split(/[|/]/g).map(x => strip(x));

  const firstPlayed = toEpochSeconds(p[0]) || toEpochSeconds(p[8]);
  const lastPlayed  = toEpochSeconds(p[1]) || toEpochSeconds(p[9]);

  const pick = arr => (arr.find(v => v && !v.includes('%')) || '').trim();
  const town  = pick([p[2], p[4], p[5], p[7]]);
  const about = pick([p[3], p[6]]);
  return { firstPlayed, lastPlayed, town, about };
}

// ---------- Fallback /resident (ES/EN, tokens en cualquier parte) ----------
async function fetchViaResident(player){
  const cmds = [`resident ${player}`, `res ${player}`, `towny:resident ${player}`];
  let out = '';
  await withRcon(async r => {
    for (const c of cmds){
      const resp = await r.send(c);
      if (DEBUG) console.log('[RES RAW]', c, resp);
      if (resp && !/Unknown command|Type .help|No such resident|No player by the name/i.test(resp)) { out = resp; break; }
    }
  });
  const txt = strip(out);

  const townMatch  = txt.match(/(?:^|\n|\s)(?:Town|Ciudad)\s*:\s*([^\n]+)/i);
  const aboutMatch = txt.match(/(?:^|\n|\s)(?:About|Acerca de)\s*:\s*([^\n]+)/i);
  const regMatch   = txt.match(/(?:^|\n|\s)(?:Registered|Registrado)\s*:\s*([^\n]+)/i);
  const lastMatch  = txt.match(/(?:^|\n|\s)(?:Last\s*online|Última\s*conexión)\s*:\s*([^\n]+)/i);

  let about = aboutMatch ? aboutMatch[1].trim() : '';
  if (/\/res\s+set\s+about/i.test(about)) about = '';

  const parseLoose = s => {
    if (!s) return null;
    const ms = Date.parse(s.replace('@','').replace(/ +/g,' ').trim());
    return isFinite(ms) ? Math.floor(ms/1000) : null;
  };

  return {
    town: townMatch ? townMatch[1].trim() : '',
    about,
    firstPlayed: parseLoose(regMatch?.[1]),
    lastPlayed : parseLoose(lastMatch?.[1]),
  };
}

// ---------- Resolver skin (SkinsRestorer) ----------
async function resolveSkinHandle(mcName) {
  const raw = await withRcon(r =>
    r.send(`papi parse ${mcName} %skinsrestorer_skin%|%skinsrestorer_skin_owner%|%skinsrestorer_skinuuid%`)
  );
  if (DEBUG) console.log('[SKIN RAW]', raw);
  const last = String(raw || '').trim().split('\n').pop();
  const [skin, owner, uuid] = last.split(/[|/]/g).map(s => strip(s));

  const nameCandidate = [skin, owner].find(v => v && !v.includes('%')) || mcName;
  const uuidCandidate = uuid && !uuid.includes('%') ? uuid : null;
  return { name: nameCandidate, uuid: uuidCandidate };
}

async function fetchMcProfile(mcName){
  let data = {};
  try { data = await fetchViaPapi(mcName); } catch (e) { if (DEBUG) console.error('[PAPI ERROR]', e); }
  if (!data.town || !data.about || data.firstPlayed == null || data.lastPlayed == null) {
    try {
      const fb = await fetchViaResident(mcName);
      data.firstPlayed = data.firstPlayed ?? fb.firstPlayed;
      data.lastPlayed  = data.lastPlayed  ?? fb.lastPlayed;
      data.town  = data.town  || fb.town;
      data.about = data.about || fb.about;
    } catch (e) { if (DEBUG) console.error('[RES ERROR]', e); }
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
    .addUserOption(o => o
      .setName('usuario')
      .setDescription('Usuario de Discord (opcional: por defecto tú)')
    ),

  async execute(interaction){
    try {
      await interaction.deferReply({ ephemeral: true });

      const chosen = interaction.options.getUser('usuario') || interaction.user;
      const member = interaction.guild.members.cache.get(chosen.id)
        || await interaction.guild.members.fetch(chosen.id).catch(() => null);

      // Datos MC inicializados (¡evita ReferenceError!)
      let mc = { firstPlayed: null, lastPlayed: null, town: '', about: '', skinThumb: '' };

      const mcName = member ? guessMcNameFromMember(member) : null;

      if (mcName) {
        try {
          const prof = await fetchMcProfile(mcName);
          mc = { ...mc, ...prof };
        } catch (e) { if (DEBUG) console.error('[PROFILE ERROR]', e); }

        try {
          const skin = await resolveSkinHandle(mcName);
          mc.skinThumb = skin.uuid
            ? `https://crafatar.com/avatars/${skin.uuid}?overlay`
            : `https://minotar.net/avatar/${encodeURIComponent(skin.name)}/128`;
        } catch {
          mc.skinThumb = `https://minotar.net/avatar/${encodeURIComponent(mcName)}/128`;
        }
      }

      const title = mcName ? `👤 ${mcName}` : `👤 ${chosen.username}`;
      const thumb = mc.skinThumb || chosen.displayAvatarURL({ extension: 'png', size: 128 });

      const embed = new EmbedBuilder()
        .setAuthor({ name: 'CocoCraft🥥 | Minecraft Server', iconURL: interaction.guild.iconURL({ size: 64 }) || undefined })
        .setTitle(title)
        .setColor(0xD3D3D3)
        .setThumbnail(thumb)
        .addFields(
          { name: '📅 Registrado',      value: mc.firstPlayed ? time(mc.firstPlayed, 'F') : '—', inline: true },
          { name: '🕒 Última conexión', value: mc.lastPlayed  ? time(mc.lastPlayed,  'F') : '—', inline: true },
          { name: '🏙️ Ciudad',         value: mc.town  || '—', inline: false },
          { name: '📝 Acerca de',       value: (mc.about || '—').slice(0, 512), inline: false },
        )
        .setFooter({ text: 'CocoCraft🥥 | Minecraft Server' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error('[/user ERROR]', err);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: '⚠️ Ocurrió un error al consultar tus datos. Revisa que estés vinculado y que el servidor tenga PAPI (player/statistic/towny o townyadvanced) y SkinsRestorer.' }).catch(()=>{});
      } else {
        await interaction.reply({ content: '⚠️ Ocurrió un error al consultar tus datos.', ephemeral: true }).catch(()=>{});
      }
    }
  },
};
