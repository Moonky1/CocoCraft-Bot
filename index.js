// index.js
require('dotenv').config();

const express = require('express');
const path = require('path');
const { Client, GatewayIntentBits, ActivityType, Events, Collection, AttachmentBuilder } = require('discord.js');
const { registerFont, createCanvas, loadImage } = require('canvas');
const { Rcon } = require('rcon-client');
const { status } = require('minecraft-server-util');

// ───────────────────────────────────────────────────────────────────────────────
// Keep-Alive HTTP (Railway)
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (_req, res) => res.send('🤖 Bot alive'));
app.listen(PORT, () => console.log(`🌐 Healthcheck on port ${PORT}`));

// ───────────────────────────────────────────────────────────────────────────────
// Discord Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Carga de slash /commands
client.commands = new Collection();
const fs = require('fs');
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

// Handler de slash
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const cmd = client.commands.get(interaction.commandName);
  if (!cmd) return interaction.reply({ content: '❌ Comando no encontrado.', ephemeral: true });
  try {
    await cmd.execute(interaction);
  } catch (err) {
    console.error(err);
    const msg = { content: '❌ Ocurrió un error ejecutando el comando.', ephemeral: true };
    if (interaction.deferred || interaction.replied) await interaction.editReply(msg.content);
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
// Verificación: canal que borra mensajes y procesa códigos
const VERIFY_CHANNEL_ID = process.env.VERIFY_CHANNEL_ID;
async function tempMsg(channel, content, ms = 7000) {
  const m = await channel.send({ content });
  setTimeout(() => m.delete().catch(() => {}), ms);
  return m;
}
async function verifyWithServer(discordId, code) {
  await new Promise(r => setTimeout(r, 300));
  return /^\d{4,8}$/.test(code);
}
client.on(Events.MessageCreate, async msg => {
  if (!msg.guild || msg.author.bot) return;
  if (!VERIFY_CHANNEL_ID || msg.channelId !== VERIFY_CHANNEL_ID) return;

  try { await msg.delete(); } catch {}

  const match = msg.content.match(/\b\d{4,8}\b/);
  if (!match) {
    return tempMsg(msg.channel, `❌ ${msg.member} envía **solo tu código** generado con \`/discord link\`.`, 7000);
  }
  const code = match[0];

  try {
    const ok = await verifyWithServer(msg.author.id, code);
    if (ok) {
      await tempMsg(msg.channel, `✅ ${msg.member} ¡ya has vinculado tu cuenta! Tus roles se sincronizarán en unos segundos.`, 7000);
    } else {
      await tempMsg(msg.channel, `❌ ${msg.member} el código **${code}** no es válido o expiró. Vuelve a ejecutar \`/discord link\`.`, 7000);
    }
  } catch (e) {
    console.error('verify error', e);
    await tempMsg(msg.channel, `⚠️ ${msg.member} hubo un error procesando tu código. Intenta nuevamente en 1–2 minutos.`, 7000);
  }
});

// ───────────────────────────────────────────────────────────────────────────────
// Bienvenida con Canvas  (fuente + fondo + avatar)
const { AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage, registerFont } = require('canvas');
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

  // Avatar: más grande y más centrado
  const centerX = W / 2;
  const centerY = 260;            // un poco más al centro vertical
  const avatarR   = 120;          // ↑ tamaño del avatar
  const ringInner = avatarR + 14; // anillo interior
  const ringOuter = ringInner + 16; // anillo exterior

  // Anillo exterior
  ctx.beginPath();
  ctx.arc(centerX, centerY, ringOuter, 0, Math.PI * 2);
  ctx.fillStyle = '#F58BC7';
  ctx.fill();

  // Anillo interior
  ctx.beginPath();
  ctx.arc(centerX, centerY, ringInner, 0, Math.PI * 2);
  ctx.fillStyle = '#FFB6E6';
  ctx.fill();

  // Avatar recortado
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
  ctx.fillText(name, W / 2, 520); // solo el nombre

  ctx.shadowBlur = 0;
  return canvas.toBuffer('image/png');
}

// ───────────────────────────────────────────────────────────────────────────────
// Anti-duplicados
const recentWelcomes = new Map();         // memberId -> expiresAt
const WELCOME_TTL_MS = 20_000;            // 20s

function wasWelcomedRecently(id) {
  const t = recentWelcomes.get(id);
  if (!t) return false;
  if (Date.now() > t) { recentWelcomes.delete(id); return false; }
  return true;
}
function markWelcomed(id) {
  recentWelcomes.set(id, Date.now() + WELCOME_TTL_MS);
}

// ¿Ya hay un mensaje reciente del bot para este miembro?
async function alreadyInChannel(channel, member, windowSec = 45) {
  const now = Date.now();
  const msgs = await channel.messages.fetch({ limit: 25 }).catch(() => null);
  if (!msgs) return false;

  const hit = msgs.find(m =>
    m.author.id === client.user.id &&
    (m.content.includes(`<@${member.id}>`) || m.attachments.size > 0) &&
    (now - m.createdTimestamp) <= windowSec * 1000
  );
  return Boolean(hit);
}

// Limpieza de duplicados: deja el más nuevo de este bot para ese miembro
async function cleanWelcomeDuplicates(channel, member, windowSec = 600) {
  const now = Date.now();
  const msgs = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  if (!msgs) return;

  const mine = [...msgs.values()].filter(m =>
    m.author.id === client.user.id &&
    (m.content.includes(`<@${member.id}>`) || m.attachments.size > 0) &&
    (now - m.createdTimestamp) <= windowSec * 1000
  );

  if (mine.length <= 1) return;
  // Ordena por fecha DESC y elimina del índice 1 en adelante
  mine.sort((a, b) => b.createdTimestamp - a.createdTimestamp);
  for (let i = 1; i < mine.length; i++) {
    await mine[i].delete().catch(() => {});
  }
}

// Evita múltiples listeners si recargas
client.removeAllListeners('guildMemberAdd');
client.on('guildMemberAdd', async member => {
  try {
    const canal = member.guild.channels.cache.get(process.env.WELCOME_CHANNEL_ID);
    if (!canal) return console.error('❌ Welcome channel not found');

    // si otra instancia lo acaba de saludar, no dupliques
    if (wasWelcomedRecently(member.id)) return;
    if (await alreadyInChannel(canal, member, 45)) { markWelcomed(member.id); return; }

    // Construye la imagen
    const buffer = await drawWelcome(member);
    const file = new AttachmentBuilder(buffer, { name: 'bienvenida.png' });

    // Publica **un solo** mensaje (texto + imagen)
    const content =
      `🍪 ¡Bienvenido ${member} a **${member.guild.name}**! Lee las 📜 <#${process.env.RULES_CHANNEL_ID}> y visita 🌈 <#${process.env.ROLES_CHANNEL_ID}>`;

    await canal.send({ content, files: [file] });

    // Marca en memoria y limpia posibles duplicados viejos
    markWelcomed(member.id);
    await cleanWelcomeDuplicates(canal, member, 600); // 10 min

  } catch (e) {
    console.error('welcome error', e);
  }
});

// ───────────────────────────────────────────────────────────────────────────────
// READY
client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  client.user.setPresence({
    status: 'online',
    activities: [{ name: 'CocoCraft', type: ActivityType.Playing }]
  });

  // Bucle robusto
  const tick = async () => {
    try {
      await updateChannelNames();
    } catch (e) {
      console.error('❌ updateChannelNames failed:', e);
    }
  };

  // corre al iniciar y luego cada 60s
  tick();
  setInterval(tick, 60_000);
});

// ───────────────────────────────────────────────────────────────────────────────
// LOGIN
client.login(process.env.DISCORD_TOKEN).catch(err => console.error('❌ Login error:', err));
