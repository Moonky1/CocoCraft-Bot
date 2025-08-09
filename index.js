// index.js
require('dotenv').config();

const express = require('express');
const path = require('path');
const { Rcon } = require('rcon-client');
const {
  Client,
  GatewayIntentBits,
  ActivityType,
  Events,
  Collection
} = require('discord.js');
const { createCanvas, loadImage } = require('canvas');
const { status } = require('minecraft-server-util');

// ─── Keep-Alive HTTP Server ─────────────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (_req, res) => res.send('🤖 Bot alive'));
app.listen(PORT, () => console.log(`🌐 Healthcheck on port ${PORT}`));

// ─── Discord Client ─────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Carga de slash commands desde ./commands
client.commands = new Collection();
try {
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
  } else {
    console.log('⚠️ Carpeta ./commands no encontrada (se omitió carga de comandos).');
  }
} catch (e) {
  console.error('⚠️ Error cargando comandos:', e);
}

// Handler de slash commands
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const cmd = client.commands.get(interaction.commandName);
  if (!cmd) {
    return interaction.reply({ content: '❌ Comando no encontrado.', ephemeral: true });
  }
  try {
    await cmd.execute(interaction);
  } catch (err) {
    console.error(err);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply('❌ Ocurrió un error ejecutando el comando.');
    } else {
      await interaction.reply({ content: '❌ Ocurrió un error ejecutando el comando.', ephemeral: true });
    }
  }
});

// ─── Helper: revisar whitelist por RCON ─────────────────────────────────────────
async function isWhitelistEnabledViaRcon() {
  const r = new Rcon({
    host: process.env.RCON_HOST || process.env.MC_HOST,
    port: Number(process.env.RCON_PORT || 25575),
    password: process.env.RCON_PASSWORD,
    timeout: 2500
  });

  try {
    await r.connect();

    // 1) Preferimos "whitelist status" (Paper/Spigot modernos)
    let resp = null;
    try { resp = await r.send('whitelist status'); } catch {}

    // 2) Si falla, probamos "whitelist" a secas (Paper/Spigot viejos)
    if (!resp) {
      try { resp = await r.send('whitelist'); } catch {}
    }

    // 3) Si aún no hay respuesta, intentamos "whitelist list" sólo para confirmar vida
    if (!resp) {
      try { resp = await r.send('whitelist list'); } catch {}
    }

    const raw = (resp || '').toString();
    console.log('🔎 RCON whitelist raw:', raw);

    const t = raw.toLowerCase();
    const enabledTokens  = ['enabled', 'on', 'true', 'activada', 'encendida'];
    const disabledTokens = ['disabled', 'off', 'false', 'desactivada', 'apagada'];

    if (enabledTokens.some(s => t.includes(s)))  return true;   // whitelist ON
    if (disabledTokens.some(s => t.includes(s))) return false;  // whitelist OFF
    return null; // no se pudo inferir, pero el server sí respondió
  } catch (e) {
    console.warn('RCON error:', e.message);
    return null; // rcon falló
  } finally {
    try { await r.end(); } catch {}
  }
}

// ─── Update “Status” & “Server” Channel Names ────────────────────────────────────
async function updateChannelNames() {
  console.log('🔧 ENV',
    'GUILD_ID=', process.env.GUILD_ID,
    'STATUS_ID=', process.env.CHANNEL_STATUS_ID,
    'SERVER_ID=', process.env.CHANNEL_SERVER_ID
  );

  const guild = client.guilds.cache.get(process.env.GUILD_ID);
  if (!guild) return console.error('❌ Guild not found');
  await guild.channels.fetch();

  const statusChan = guild.channels.cache.get(process.env.CHANNEL_STATUS_ID);
  const serverChan = guild.channels.cache.get(process.env.CHANNEL_SERVER_ID);
  if (!statusChan || !serverChan) {
    return console.error('❌ One or both channels not found');
  }

  // Estado por defecto: 🔴 (offline)
  let statusEmoji = '🔴';
  let mcCount = 0;

  try {
    // Si el query responde, el server está online
    const mcStatus = await status(
      process.env.MC_HOST,
      parseInt(process.env.MC_PORT, 10),
      { timeout: 1500 }
    );
    mcCount = mcStatus.players?.online ?? 0;

    // Consultamos whitelist por RCON
    const wl = await isWhitelistEnabledViaRcon();
    if (wl === true) {
      statusEmoji = '🟠'; // Mantenimiento/whitelist
    } else {
      statusEmoji = '🟢'; // Online normal (wl === false o null)
    }
  } catch (err) {
    console.warn('⚠️ MC query failed:', err.message);
    statusEmoji = '🔴'; // Sin respuesta: offline
  }

  // Renombrar canales
  try {
    await statusChan.setName(`📊 Status: ${statusEmoji}`);
    await serverChan.setName(`👥 Server: ${mcCount}`);
    console.log('✔ Channels updated');
  } catch (err) {
    console.error('⚠️ Error renaming channels:', err);
  }
}

// ─── On Ready ───────────────────────────────────────────────────────────────────
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  client.user.setPresence({
    status: 'online',
    activities: [{ name: 'CocoCraft', type: ActivityType.Playing }]
  });

  await updateChannelNames();
  setInterval(updateChannelNames, 60 * 1000);
});

// ─── Welcome Handler sin embed, 1 solo mensaje (texto + imagen) ───────────────
// ─── Welcome Handler con imagen normal + Canvas ───────────────────────────────
client.removeAllListeners('guildMemberAdd');

async function buildWelcomeCard(member) {
  const width = 1024;
  const height = 512;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // 1) Fondo
  const bgPath = path.resolve(__dirname, 'assets', 'images', 'welcome-bg.png');
  const bg = await loadImage(bgPath);
  ctx.drawImage(bg, 0, 0, width, height);

  // 2) Avatar circular
  const avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 512 });
  const avatar = await loadImage(avatarUrl);
  const r = 128;                 // radio del círculo
  const cx = width / 2;          // centro X
  const cy = height / 2 - 20;    // centro Y (un pelín arriba)

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(avatar, cx - r, cy - r, r * 2, r * 2);
  ctx.restore();

  // 3) Nombre
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = 'bold 56px sans-serif';
  ctx.fillText(member.user.username, width / 2, height - 50);

  return canvas.toBuffer('image/png');
}

client.on('guildMemberAdd', async (member) => {
  console.log('🔔 New member:', member.user.tag);

  const canal = member.guild.channels.cache.get(process.env.WELCOME_CHANNEL_ID);
  if (!canal) return console.error('❌ Welcome channel not found');

  // Texto arriba (no embed)
  await canal.send(
    `🍪 ¡Bienvenido ${member} a **${member.guild.name}**!\n` +
    `Lee las 📜 <#${process.env.RULES_CHANNEL_ID}> y visita 🌈 <#${process.env.ROLES_CHANNEL_ID}>`
  );

  // Imagen grande debajo
  try {
    const buffer = await buildWelcomeCard(member);
    await canal.send({ files: [{ attachment: buffer, name: `welcome-${member.id}.png` }] });
  } catch (err) {
    console.error('⚠️ Error generando/mandando la imagen de bienvenida:', err);
  }
});

// ─── Auto-limpieza & verificación en canal de verificación ──────────────────────
const VERIFY_CHANNEL_ID = process.env.VERIFY_CHANNEL_ID;

async function tempMsg(channel, content, ms = 7000) {
  const m = await channel.send({ content });
  setTimeout(() => m.delete().catch(() => {}), ms);
  return m;
}

// Simula verificación (reemplaza por tu API/DB)
async function verifyWithServer(discordId, code) {
  await new Promise(r => setTimeout(r, 400));
  return /^\d{4,8}$/.test(code);
}

client.on(Events.MessageCreate, async msg => {
  if (!msg.guild || msg.author.bot) return;
  if (!VERIFY_CHANNEL_ID || msg.channelId !== VERIFY_CHANNEL_ID) return;

  try { await msg.delete(); } catch {}

  const match = msg.content.match(/\b\d{4,8}\b/);
  if (!match) {
    return tempMsg(
      msg.channel,
      `❌ ${msg.member} envía **solo tu código** generado con \`/discord link\` en el servidor.`,
      7000
    );
  }

  const code = match[0];
  try {
    const ok = await verifyWithServer(msg.author.id, code);
    if (ok) {
      await tempMsg(
        msg.channel,
        `✅ ${msg.member} ¡ya has vinculado tu cuenta! Tus roles se sincronizarán en unos segundos.`,
        7000
      );
      // Ejemplo:
      // const role = msg.guild.roles.cache.get('ROL_ID');
      // if (role) await msg.member.roles.add(role).catch(()=>{});
    } else {
      await tempMsg(
        msg.channel,
        `❌ ${msg.member} el código **${code}** no es válido o expiró. Vuelve a ejecutar \`/discord link\`.`,
        7000
      );
    }
  } catch (e) {
    console.error('verify error', e);
    await tempMsg(
      msg.channel,
      `⚠️ ${msg.member} hubo un error procesando tu código. Intenta nuevamente en 1–2 minutos.`,
      7000
    );
  }
});

// ─── Login ──────────────────────────────────────────────────────────────────────
client.login(process.env.DISCORD_TOKEN)
  .catch(err => console.error('❌ Login error:', err));
