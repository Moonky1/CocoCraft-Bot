// index.js (inicio ordenado)
require('dotenv').config();

// ── Core deps: deben ir ANTES de usarse
const fs   = require('fs');
const path = require('path');
const express = require('express');
const { TRANSCRIPT_DIR } = require('./helpers/path');

// ── Discord / otras libs
const {
  Client, GatewayIntentBits, ActivityType, Events, Collection, AttachmentBuilder
} = require('discord.js');
const { registerFont, createCanvas, loadImage } = require('canvas');
const { Rcon } = require('rcon-client');
const { status } = require('minecraft-server-util');

const ticketPanel = require('./commands/tickets.js'); // panel de tickets

// ───────────────────────────────────────────────────────────────
// Keep-Alive HTTP (Railway) + archivos de transcripts
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (_req, res) => res.send('🤖 Bot alive'));

app.get('/_transcripts', (_req, res) => {
  fs.readdir(TRANSCRIPT_DIR, (err, files) => {
    res.json({ dir: TRANSCRIPT_DIR, files, err: err ? String(err) : null });
  });
});

// Sirve https://TU-DOMINIO/transcripts/archivo.html
app.use('/transcripts', express.static(TRANSCRIPT_DIR, {
  // cache largo; no borra nada, solo headers
  maxAge: '1y',
  setHeaders(res) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  },
}));
console.log('TRANSCRIPT_DIR =', TRANSCRIPT_DIR);
app.listen(PORT, () => console.log(`🌐 Healthcheck on port ${PORT}`));

// ───────────────────────────────────────────────────────────────
// Discord Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Cargar el listener del canal de verificación (espera ~15s y DM)
require('./events/verify-code-listener')(client);

// ── Boost detector ────────────────────────────────────────────
const BOOST_CHANNEL_ID   = process.env.BOOST_CHANNEL_ID   || '1404007396988289065'; // #boosts
const TICKETS_CHANNEL_ID = process.env.TICKETS_CHANNEL_ID || '1399207405602082816'; // #tickets

// anti-duplicado por si Discord emite varios updates seguidos del mismo user
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

// ───────────────────────────────────────────────────────────────
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

// ───────────────────────────────────────────────────────────────
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

// ───────────────────────────────────────────────────────────────────────────────
// Estado (vía RCON/Status) → renombra canales
async function updateChannelNames() {
  const guild = client.guilds.cache.get(process.env.GUILD_ID);
  if (!guild) return console.error('❌ Guild not found');
  await guild.channels.fetch();

  const statusChan = guild.channels.cache.get(process.env.CHANNEL_STATUS_ID);
  const serverChan = guild.channels.cache.get(process.env.CHANNEL_SERVER_ID);
  if (!statusChan || !serverChan) return console.error('❌ One or both channels not found');

  // Default: rojo (apagado)
  let statusEmoji = '🔴';
  let mcCount = 0;

  // 1) Intento RCON para saber si está encendido y si hay whitelist, etc.
  try {
    const rcon = await Rcon.connect({
      host: process.env.MC_HOST,
      port: parseInt(process.env.RCON_PORT, 10),
      password: process.env.RCON_PASSWORD,
      timeout: 1500
    });
    // si conectó RCON, el server está up
    statusEmoji = '🟢';
    try {
      const list = await rcon.send('list'); // "There are X of a max of Y players online: ..."
      const m = list.match(/There are\s+(\d+)\s+of/i);
      if (m) mcCount = parseInt(m[1], 10);
    } catch {}
    await rcon.end();
  } catch {
    // 2) Fallback rápido al ping del server (por si el RCON falla)
    try {
      const s = await status(process.env.MC_HOST, parseInt(process.env.MC_PORT, 10), { timeout: 1500 });
      statusEmoji = '🟢';
      mcCount = s.players.online;
    } catch {
      statusEmoji = '🔴';
      mcCount = 0;
    }
  }

  try {
    await statusChan.setName(`📊 Status: ${statusEmoji}`);
    await serverChan.setName(`👥 Server: ${mcCount}`);
  } catch (err) {
    console.error('⚠️ Error renaming channels:', err);
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Bienvenida con Canvas  (fuente + fondo + avatar)
const FONT_PATH = path.join(__dirname, 'assets', 'fonts', 'DMSans-Bold.ttf');
try { registerFont(FONT_PATH, { family: 'DMSansBold' }); }
catch (e) { console.warn('⚠️ No pude registrar la fuente:', e.message); }

async function drawWelcome(member) {
  const W = 1280;
  const H = 720;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Fondo
  const bg = await loadImage(path.join(__dirname, 'assets', 'images', 'welcome-bg.png'));
  ctx.drawImage(bg, 0, 0, W, H);

  // Avatar SIN borde y más grande
  const centerX = W / 2;
  const centerY = 260;
  const avatarR = 150; // ↑ antes 120

  const avatarURL = member.user.displayAvatarURL({ extension: 'png', forceStatic: true, size: 512 });
  const avatarImg = await loadImage(avatarURL);

  ctx.save();
  ctx.beginPath();
  ctx.arc(centerX, centerY, avatarR, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(avatarImg, centerX - avatarR, centerY - avatarR, avatarR * 2, avatarR * 2);
  ctx.restore();

  // Nombre grande
  const name = member.displayName || member.user.username;
  ctx.font = 'bold 96px DMSansBold, sans-serif';
  ctx.textAlign = 'center';
  ctx.lineJoin = 'round';
  ctx.fillStyle = '#FFFFFF';
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 22;
  ctx.fillText(name, W / 2, 520);

  ctx.shadowBlur = 0;
  return canvas.toBuffer('image/png');
}

// ───────────────────────────────────────────────────────────────────────────────
// Anti-duplicados en memoria (solo evita spam dentro de 20s)
const recentWelcomes = new Map();         // memberId -> expiresAt
const WELCOME_TTL_MS = 20_000;

function wasWelcomedRecently(id) {
  const t = recentWelcomes.get(id);
  if (!t) return false;
  if (Date.now() > t) { recentWelcomes.delete(id); return false; }
  return true;
}
function markWelcomed(id) {
  recentWelcomes.set(id, Date.now() + WELCOME_TTL_MS);
}

// ¿Ya hay un mensaje reciente del bot para ESTE miembro?
async function alreadyInChannel(channel, member, windowSec = 90) {
  const now = Date.now();
  const msgs = await channel.messages.fetch({ limit: 30 }).catch(() => null);
  if (!msgs) return false;

  const hit = [...msgs.values()].find(m =>
    m.author.id === client.user.id &&
    (m.content?.includes(`<@${member.id}>`) || m.attachments.size > 0) &&
    (now - m.createdTimestamp) <= windowSec * 1000
  );
  return Boolean(hit);
}

// Marca si el mensaje es de nuestro "formato nuevo": texto + imagen 'bienvenida.png'
function isV2Welcome(m, memberId) {
  const hasText = m.content?.includes('¡Bienvenido') && m.content?.includes(`<@${memberId}>`);
  const hasImage = m.attachments.size > 0 && [...m.attachments.values()].some(a => a.name?.toLowerCase() === 'bienvenida.png');
  return hasText && hasImage;
}

// Limpieza de duplicados: conserva preferentemente la versión nueva (texto+imagen)
// Si no hay V2, conserva el más reciente.
async function cleanWelcomeDuplicates(channel, member, windowSec = 600) {
  const now = Date.now();
  const msgs = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  if (!msgs) return;

  const mine = [...msgs.values()].filter(m =>
    m.author.id === client.user.id &&
    (m.content?.includes(`<@${member.id}>`) || m.attachments.size > 0) &&
    (now - m.createdTimestamp) <= windowSec * 1000
  );
  if (mine.length <= 1) return;

  // Ordena nuevo → viejo
  mine.sort((a, b) => b.createdTimestamp - a.createdTimestamp);

  // Intenta localizar la versión V2 más reciente
  const keepIndex = mine.findIndex(m => isV2Welcome(m, member.id));
  const indexToKeep = keepIndex >= 0 ? keepIndex : 0; // si no hay V2, conserva el más nuevo

  for (let i = 0; i < mine.length; i++) {
    if (i === indexToKeep) continue;
    await mine[i].delete().catch(() => {});
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Evita múltiples listeners si recargas
client.removeAllListeners('guildMemberAdd');
client.on('guildMemberAdd', async (member) => {
  try {
    const canal = member.guild.channels.cache.get(process.env.WELCOME_CHANNEL_ID);
    if (!canal) return console.error('❌ Welcome channel not found');

    // ───────────────────────────────────────────────────────────────
// ROLES AL ENTRAR (con soporte para bots)
const ROLE_BOT        = '1145358895414517800'; // Bot
const ROLE_MEMBER     = '1404003165313040534'; // Member
const ROLE_UNVERIFIED = '1406124792070934639'; // Unverified
const ROLE_VERIFIED   = '1406241979217612931'; // Verified (ya lo usabas antes)

if (member.user.bot) {
  // 👉 Es un BOT: asigna rol Bot y quita roles de humanos si los tiene
  const ops = [];
  if (!member.roles.cache.has(ROLE_BOT)) {
    ops.push(member.roles.add(ROLE_BOT, 'Assign Bot role on join'));
  }
  const toRemove = [ROLE_MEMBER, ROLE_UNVERIFIED].filter(r => member.roles.cache.has(r));
  if (toRemove.length) {
    ops.push(member.roles.remove(toRemove, 'Bots should not have Member/Unverified'));
  }
  await Promise.allSettled(ops);

  // Opcional: no enviar mensaje de bienvenida a bots
  return;
}

// 👉 Es una persona: lógica normal (Member + Unverified si no es Verified)
const hasVerified   = member.roles.cache.has(ROLE_VERIFIED);
const hasMember     = member.roles.cache.has(ROLE_MEMBER);
const hasUnverified = member.roles.cache.has(ROLE_UNVERIFIED);

if (hasVerified) {
  if (hasUnverified) await member.roles.remove(ROLE_UNVERIFIED, 'Verified member rejoined');
  if (!hasMember)    await member.roles.add(ROLE_MEMBER, 'Baseline Member on join');
} else {
  const toAdd = [];
  if (!hasMember)     toAdd.push(ROLE_MEMBER);
  if (!hasUnverified) toAdd.push(ROLE_UNVERIFIED);
  if (toAdd.length)   await member.roles.add(toAdd, 'Baseline roles on join');
}
// ───────────────────────────────────────────────────────────────


    // Si otra instancia lo acaba de saludar, no dupliques
    if (wasWelcomedRecently(member.id)) return;
    if (await alreadyInChannel(canal, member, 90)) { markWelcomed(member.id); return; }

    // Limpia restos anteriores (si quedaron)
    await cleanWelcomeDuplicates(canal, member, 600);

    // Imagen + texto (esto define "V2")
    const buffer = await drawWelcome(member);
    const file = new AttachmentBuilder(buffer, { name: 'bienvenida.png' });

    const content =
      `¡Bienvenido <@${member.id}> a **${member.guild.name}**! Lee las 📜 <#${process.env.RULES_CHANNEL_ID}> y visita 🌈 <#${process.env.ROLES_CHANNEL_ID}>`;

    await canal.send({ content, files: [file] });

    // Marca y, unos segundos después, limpia duplicados conservando V2 si aparece otra
    markWelcomed(member.id);
    setTimeout(() => cleanWelcomeDuplicates(canal, member, 600).catch(() => {}), 3500);

  } catch (e) {
    console.error('welcome error', e);
  }
});


// ───────────────────────────────────────────────────────────────────────────────
// READY
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  // Presencia
  client.user.setPresence({
    status: 'online',
    activities: [{ name: 'CocoCraft', type: ActivityType.Playing }]
  });

  // ---- AUTO-SYNC de slash commands (guild) ----
  const syncSlash = async () => {
    try {
      // Asegúrate de tener la guild en caché
      await client.guilds.fetch().catch(() => {});
      const guild = client.guilds.cache.get(process.env.GUILD_ID);

      // Lista de comandos (agrega aquí los que tengas)
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
        // require('./commands/otro').data.toJSON(),
      ];

      const commandsPath = path.join(__dirname, 'commands');
      const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

      await guild.commands.set(commands);

      if (guild) {
        // Registrar como GUILD commands (aparecen al instante y son más estables)
        await guild.commands.set(commands);
        console.log('✅ Slash sincronizado en la guild.');
      } else {
        // Fallback: global (tarda en propagarse, pero sirve si no hay GUILD_ID)
        await client.application.commands.set(commands);
        console.log('✅ Slash global actualizado.');
      }
    } catch (e) {
      console.error('slash sync error', e);
    }
  };

  // sincroniza ya y luego cada 6 horas
  await syncSlash();
  setInterval(syncSlash, 6 * 60 * 60 * 1000);

  // ---- tus tareas recurrentes (ya las tenías) ----
  try {
    await updateChannelNames();
  } catch (e) { console.error('updateChannelNames on boot', e); }
  setInterval(async () => {
    try { await updateChannelNames(); } catch (e) { console.error('update tick', e); }
  }, 60_000);
});

// ───────────────────────────────────────────────────────────────────────────────
// LOGIN
client.login(process.env.DISCORD_TOKEN).catch(err => console.error('❌ Login error:', err));