require('dotenv').config();

const fs   = require('fs');
const path = require('path');
const express = require('express');
const { TRANSCRIPT_DIR } = require('./helpers/path');

//Discord
const {
  Client, GatewayIntentBits, ActivityType, Events, Collection, AttachmentBuilder
} = require('discord.js');
const { registerFont, createCanvas, loadImage } = require('canvas');
const { Rcon } = require('rcon-client');
const { status } = require('minecraft-server-util');

const ticketPanel = require('./commands/tickets.js'); // panel de tickets

// Keep-Alive HTTP (Railway)
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (_req, res) => res.send('🤖 Bot alive'));

app.get('/_transcripts', (_req, res) => {
  fs.readdir(TRANSCRIPT_DIR, (err, files) => {
    res.json({ dir: TRANSCRIPT_DIR, files, err: err ? String(err) : null });
  });
});

app.use('/transcripts', express.static(TRANSCRIPT_DIR, {
  maxAge: '1y',
  setHeaders(res) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  },
}));
console.log('TRANSCRIPT_DIR =', TRANSCRIPT_DIR);
app.listen(PORT, () => console.log(`🌐 Healthcheck on port ${PORT}`));

// Discord Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  rest: { timeout: 30_000, retryLimit: 3 }
});

// Listener
require('./events/verify-code-listener')(client);

// ── Boost detector ────────────────────────────────────────────
const BOOST_CHANNEL_ID   = process.env.BOOST_CHANNEL_ID   || '1404007396988289065'; // #boosts
const TICKETS_CHANNEL_ID = process.env.TICKETS_CHANNEL_ID || '1399207405602082816'; // #tickets

// anti-duplicado
const recentBoosters = new Map(); // userId -> timestamp

client.on('guildMemberUpdate', async (oldMember, newMember) => {
  try {
    const startedBoost =
      (!oldMember.premiumSince && !!newMember.premiumSince) ||
      (!oldMember.premiumSinceTimestamp && !!newMember.premiumSinceTimestamp);
    if (!startedBoost) return;

    // Debounce 60s por usuario
    const last = recentBoosters.get(newMember.id);
    if (last && Date.now() - last < 60_000) return;
    recentBoosters.set(newMember.id, Date.now());

    // Asegurar conteo fresco
    await newMember.guild.fetch();
    const totalBoosts = newMember.guild.premiumSubscriptionCount ?? 0;

    const ch = newMember.guild.channels.cache.get(BOOST_CHANNEL_ID);
    if (!ch) {
      console.warn('⚠️ Canal de boosts no encontrado:', BOOST_CHANNEL_ID);
      return;
    }

    const msg = `**¡Gracias por el boost ${newMember}!** Con este ya sumamos **${totalBoosts}** boosts. `
              + `Canjea tus premios en <#${TICKETS_CHANNEL_ID}>.`;

    await ch.send(msg);
  } catch (err) {
    console.error('boost announce error:', err);
  }
});

// Carga de slash /commands
client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
  const files = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
  for (const file of files) {
    const cmd = require(path.join(commandsPath, file));
    if (cmd?.data?.name && typeof cmd.execute === 'function') {
      client.commands.set(cmd.data.name, cmd);
    }
  }
  console.log(`✅ Cargados ${client.commands.size} comandos.`);
}

// Handler de interacciones
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // 1) Slash commands
    if (interaction.isChatInputCommand()) {
      const cmd = client.commands.get(interaction.commandName);
      if (!cmd) {
        return interaction.reply({ content: '❌ Comando no encontrado.', ephemeral: true });
      }
      return await cmd.execute(interaction);
    }

    // 2) Botones del panel de tickets
    if (interaction.isButton() && interaction.customId.startsWith('ticket:')) {
      return await ticketPanel.handleButton(interaction);
    }

    // 3) Envío del modal de tickets
    if (interaction.isModalSubmit() && interaction.customId.startsWith('ticketModal:')) {
      return await ticketPanel.handleModal(interaction);
    }

    // (aquí puedes enrutar otros tipos si quieres)
  } catch (err) {
    console.error(err);
    const msg = { content: '⚠️ Ocurrió un error ejecutando la interacción.', ephemeral: true };
    if (interaction.deferred || interaction.replied) await interaction.editReply(msg);
    else await interaction.reply(msg);
  }
});


// Helpers NUEVOS

// Renombre seguro con reintento si hubo timeout
async function safeSetName(channel, desired) {
  if (!channel) return;
  if (channel.name === desired) return; // evita llamadas innecesarias
  try {
    await channel.setName(desired);
  } catch (e) {
    const code = e?.code || e?.name || '';
    if (String(code).includes('UND_ERR_CONNECT_TIMEOUT')) {
      console.warn(`⏳ Rename timeout en ${channel.id}. Reintento en 10s...`);
      setTimeout(() => {
        if (channel.name !== desired) channel.setName(desired).catch(() => {});
      }, 10_000);
    } else if (code === 50013) {
      console.error('❌ Missing Permissions al renombrar canal', channel.id);
    } else {
      console.error('⚠️ Error renombrando canal', channel.id, e);
    }
  }
}

// Helpers de roles que respetan jerarquía (evita 50013)
function canAssignRole(guild, roleId) {
  const role = guild.roles.cache.get(roleId);
  const me = guild.members.me;
  if (!role || !me) return false;
  return me.roles.highest.comparePositionTo(role) > 0; // mi rol más alto > rol objetivo
}

async function tryAddRole(member, roleId, reason) {
  const guild = member.guild;
  const role = guild.roles.cache.get(roleId);
  if (!role) return console.warn('⚠️ Role no existe:', roleId);
  if (!canAssignRole(guild, roleId)) {
    return console.warn(`⚠️ No puedo asignar ${role.name} (${roleId}). Sube el rol del bot por encima.`);
  }
  try { await member.roles.add(roleId, reason); }
  catch (e) { console.error('❌ add role error', roleId, e.code || e.message); }
}

async function tryRemoveRole(member, roleId, reason) {
  const guild = member.guild;
  const role = guild.roles.cache.get(roleId);
  if (!role) return;
  if (!canAssignRole(guild, roleId)) {
    return console.warn(`⚠️ No puedo quitar ${role.name} (${roleId}). Sube el rol del bot por encima.`);
  }
  try { await member.roles.remove(roleId, reason); }
  catch (e) { console.error('❌ remove role error', roleId, e.code || e.message); }
}


// ───────────────────────────────────────────────────────────────────────────────
// Estado (vía RCON + ping Java) → renombra canales (robusto)
async function updateChannelNames() {
  const guild = client.guilds.cache.get(process.env.GUILD_ID);
  if (!guild) return console.error('❌ Guild not found');
  await guild.channels.fetch();

  const statusChan = guild.channels.cache.get(process.env.CHANNEL_STATUS_ID);
  const serverChan = guild.channels.cache.get(process.env.CHANNEL_SERVER_ID);
  if (!statusChan || !serverChan) return console.error('❌ One or both channels not found');

  // Config/env con defaults seguros
  const HOST        = process.env.MC_HOST;
  const JAVA_PORT   = parseInt(process.env.MC_PORT || '25565', 10);
  const RCON_PORT   = parseInt(process.env.RCON_PORT || '25575', 10);
  const RCON_PASS   = process.env.RCON_PASSWORD || '';
  const TIMEOUT_MS  = parseInt(process.env.MC_TIMEOUT || '2000', 10);
  const DEBUG       = (process.env.SERVER_DEBUG || '0') === '1';

  // Helpers
  const parsePlayersFromList = (text) => {
    if (!text) return null;
    let m =
      text.match(/(?:There are|Hay)\s+(\d+)\s+(?:of|de)\s+/i) ||
      text.match(/(\d+)\s+players?\s+online/i) ||
      text.match(/online:\s*(\d+)\s*\/\s*\d+/i);
    return m ? parseInt(m[1], 10) : null;
  };

  const getRconInfo = async () => {
    try {
      const rcon = await Rcon.connect({
        host: HOST,
        port: RCON_PORT,
        password: RCON_PASS,
        timeout: TIMEOUT_MS,
      });
      const reply = await rcon.send('list');
      await rcon.end();
      const count = parsePlayersFromList(reply);
      if (DEBUG) console.log('[RCON] reply:', reply, '=> count:', count);
      return { online: true, players: count };
    } catch (e) {
      if (DEBUG) console.log('[RCON] fail:', e.message);
      return { online: false, players: null };
    }
  };

  const getPingInfo = async () => {
    try {
      const s = await status(HOST, JAVA_PORT, { timeout: TIMEOUT_MS });
    const count = s?.players?.online ?? 0;
      if (DEBUG) console.log('[PING] ok players:', count);
      return { online: true, players: count };
    } catch (e) {
      if (DEBUG) console.log('[PING] fail:', e.message);
      return { online: false, players: 0 };
    }
  };

  const [rconRes, pingRes] = await Promise.all([getRconInfo(), getPingInfo()]);
  const isOnline = rconRes.online || pingRes.online;

  let mcCount = 0;
  if (Number.isInteger(rconRes.players)) mcCount = rconRes.players;
  else if (Number.isInteger(pingRes.players)) mcCount = pingRes.players;

  const statusEmoji = isOnline ? '🟢' : '🔴';

  try {
    await safeSetName(statusChan, `📊 Status: ${statusEmoji}`); // <─ usa helper
    await safeSetName(serverChan, `👥 Server: ${mcCount}`);     // <─ usa helper
  } catch (err) {
    console.error('⚠️ Error renaming channels:', err);
  }
}

// Bienvenida

const WELCOME = {
  CHANNEL_ID: process.env.WELCOME_CHANNEL_ID || '1399202129377234954',
  RULES_CHANNEL_ID: process.env.RULES_CHANNEL_ID || '',
  ROLES_CHANNEL_ID: process.env.ROLES_CHANNEL_ID || '',
  ROLE_BOT_ID: process.env.ROLE_BOT_ID || '',
  ROLE_MEMBER_ID: process.env.ROLE_MEMBER_ID || '1404003165313040534',
  ROLE_UNVERIFIED_ID: process.env.ROLE_UNVERIFIED_ID || '1406124792070934639',
  ROLE_VERIFIED_ID: process.env.ROLE_VERIFIED_ID || '1406241979217612931',
  COLOR: '#4cadd0',
};

// Fuente para canvas
try {
  const FONT_PATH = path.join(__dirname, 'assets', 'fonts', 'DMSans-Bold.ttf');
  registerFont(FONT_PATH, { family: 'DMSansBold' });
} catch (e) {
  console.warn('⚠️ No pude registrar la fuente:', e.message);
}

// Imagen
async function drawWelcome(member) {
  const W = 1280, H = 720;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const bg = await loadImage(path.join(__dirname, 'assets', 'images', 'welcome-bg.png'));
  ctx.drawImage(bg, 0, 0, W, H);

  const cx = W / 2, cy = 260, r = 150;
  const avatarURL = member.user.displayAvatarURL({ extension: 'png', forceStatic: true, size: 512 });
  const avatar = await loadImage(avatarURL);
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
  ctx.drawImage(avatar, cx - r, cy - r, r * 2, r * 2); ctx.restore();

  const name = member.displayName || member.user.username;
  ctx.font = 'bold 96px DMSansBold, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 22;
  ctx.fillText(name, W / 2, 520); ctx.shadowBlur = 0;

  return canvas.toBuffer('image/png');
}

// Anti-duplicados en memoria
const recentWelcomes = new Map(); // id -> expiresAt
const WELCOME_TTL_MS = 20_000;
const wasWelcomedRecently = (id) => {
  const t = recentWelcomes.get(id);
  if (!t) return false;
  if (Date.now() > t) { recentWelcomes.delete(id); return false; }
  return true;
};
const markWelcomed = (id) => recentWelcomes.set(id, Date.now() + WELCOME_TTL_MS);

async function alreadyInChannel(channel, member, secs = 90) {
  const now = Date.now();
  const msgs = await channel.messages.fetch({ limit: 30 }).catch(() => null);
  if (!msgs) return false;
  return [...msgs.values()].some(m =>
    m.author.id === channel.client.user.id &&
    (m.content?.includes(`<@${member.id}>`) || m.attachments.size > 0) &&
    (now - m.createdTimestamp) <= secs * 1000
  );
}
const isV2Welcome = (m, id) =>
  m.content?.includes('¡Bienvenido') && m.content?.includes(`<@${id}>`) &&
  m.attachments.size > 0 && [...m.attachments.values()].some(a => a.name?.toLowerCase() === 'bienvenida.png');

async function cleanWelcomeDuplicates(channel, member, secs = 600) {
  const now = Date.now();
  const msgs = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  if (!msgs) return;

  const mine = [...msgs.values()].filter(m =>
    m.author.id === channel.client.user.id &&
    (m.content?.includes(`<@${member.id}>`) || m.attachments.size > 0) &&
    (now - m.createdTimestamp) <= secs * 1000
  );
  if (mine.length <= 1) return;

  mine.sort((a, b) => b.createdTimestamp - a.createdTimestamp);
  const keepIndex = mine.findIndex(m => isV2Welcome(m, member.id));
  const indexToKeep = keepIndex >= 0 ? keepIndex : 0;

  for (let i = 0; i < mine.length; i++) {
    if (i === indexToKeep) continue;
    await mine[i].delete().catch(() => {});
  }
}

// Listener (sin ChannelType)
client.removeAllListeners(Events.GuildMemberAdd);
client.on(Events.GuildMemberAdd, async (member) => {
  try {
    if (member.id === member.guild.ownerId) return; // no tocar owner

    // Buscar canal (fetch y cache)
    let channel = null;
    try { channel = await client.channels.fetch(WELCOME.CHANNEL_ID); } catch {}
    if (!channel) channel = member.guild.channels.cache.get(WELCOME.CHANNEL_ID);
    if (!channel || !channel.isTextBased()) {
      console.error('❌ Welcome channel not found / not text:', WELCOME.CHANNEL_ID);
      return;
    }

    // Roles
    if (member.user.bot && WELCOME.ROLE_BOT_ID) {
      await tryAddRole(member, WELCOME.ROLE_BOT_ID, 'Assign Bot role on join');
    }

    const hasVerified   = member.roles.cache.has(WELCOME.ROLE_VERIFIED_ID);
    const hasMember     = member.roles.cache.has(WELCOME.ROLE_MEMBER_ID);
    const hasUnverified = member.roles.cache.has(WELCOME.ROLE_UNVERIFIED_ID);

    if (hasVerified) {
      if (hasUnverified) await tryRemoveRole(member, WELCOME.ROLE_UNVERIFIED_ID, 'Remove unverified');
      if (!hasMember)    await tryAddRole(member, WELCOME.ROLE_MEMBER_ID, 'Add member');
    } else {
      if (!hasMember)     await tryAddRole(member, WELCOME.ROLE_MEMBER_ID, 'Baseline roles on join');
      if (!hasUnverified) await tryAddRole(member, WELCOME.ROLE_UNVERIFIED_ID, 'Baseline roles on join');
    }

    // Anti-doble bienvenida entre instancias
    if (wasWelcomedRecently(member.id)) return;
    if (await alreadyInChannel(channel, member, 90)) { markWelcomed(member.id); return; }

    await cleanWelcomeDuplicates(channel, member, 600);

    // Mensaje (con fallback si Canvas falla)
    let file = null;
    try {
      const buf = await drawWelcome(member);
      file = new AttachmentBuilder(buf, { name: 'bienvenida.png' });
    } catch (err) {
      console.warn('⚠️ Canvas falló, se envía sin imagen:', err.message);
    }

    const rulesMention = WELCOME.RULES_CHANNEL_ID ? `<#${WELCOME.RULES_CHANNEL_ID}>` : '#reglas';
    const rolesMention = WELCOME.ROLES_CHANNEL_ID ? `<#${WELCOME.ROLES_CHANNEL_ID}>` : '#roles';

    const content = [
      `¡Bienvenido <@${member.id}> a **${member.guild.name}**! Lee las 📜 ${rulesMention} y visita 🌈 ${rolesMention}.`,
    ].join('\n');

    await channel.send({ content, files: file ? [file] : [] });
    markWelcomed(member.id);
    setTimeout(() => cleanWelcomeDuplicates(channel, member, 600).catch(() => {}), 3500);

  } catch (e) {
    console.error('❌ welcome error:', e);
  }
});

// READY
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  // Presencia
  client.user.setPresence({
    status: 'online',
    activities: [{ name: 'CocoCraft', type: ActivityType.Playing }]
  });

  //AUTO-SYNC de slash commands (guild)
  const syncSlash = async () => {
    try {
      await client.guilds.fetch().catch(() => {});
      const guild = client.guilds.cache.get(process.env.GUILD_ID);

      const commands = [
        require('./commands/suggest').data.toJSON(),
        require('./commands/reglas_inicio').data.toJSON(),
        require('./commands/reglas_siempre').data.toJSON(),
        require('./commands/reglas_nunca').data.toJSON(),
        require('./commands/reglas_consecuencias').data.toJSON(),
        require('./commands/ip').data.toJSON(),
        require('./commands/test-boost').data.toJSON(),
        require('./commands/coco').data.toJSON(),
        require('./commands/user').data.toJSON(),
        require('./commands/playtimetop').data.toJSON(),
      ];

      const commandsPath = path.join(__dirname, 'commands');
      const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

      await guild.commands.set(commands);

      if (guild) {
        // Registrar como GUILD commands
        await guild.commands.set(commands);
        console.log('✅ Slash sincronizado en la guild.');
      } else {
        // Fallback: global 
        await client.application.commands.set(commands);
        console.log('✅ Slash global actualizado.');
      }
    } catch (e) {
      console.error('slash sync error', e);
    }
  };

  await syncSlash();
  setInterval(syncSlash, 6 * 60 * 60 * 1000);

  try {
    await updateChannelNames();
  } catch (e) { console.error('updateChannelNames on boot', e); }
  setInterval(async () => {
    try { await updateChannelNames(); } catch (e) { console.error('update tick', e); }
  }, 60_000);
});

// LOGIN
client.login(process.env.DISCORD_TOKEN).catch(err => console.error('❌ Login error:', err));
