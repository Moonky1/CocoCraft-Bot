// index.js
require('dotenv').config();

const express = require('express');
const path = require('path');
const {
  Client,
  GatewayIntentBits,
  ActivityType,
  Events,
  Collection,
  AttachmentBuilder,
} = require('discord.js');
const {
  createCanvas,
  loadImage,
  registerFont,
} = require('canvas');
const { status } = require('minecraft-server-util');

// ───────────────────────────────────────────────────────────────────────────────
// Keep-Alive (Railway)
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (_req, res) => res.send('🤖 Bot alive'));
app.listen(PORT, () => console.log(`🌐 Healthcheck on port ${PORT}`));

// ───────────────────────────────────────────────────────────────────────────────
// Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// ───────────────────────────────────────────────────────────────────────────────
// Carga de slash commands (./commands/*.js)
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
    console.log('⚠️ Carpeta ./commands no encontrada.');
  }
} catch (e) {
  console.error('⚠️ Error cargando comandos:', e);
}

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

// ───────────────────────────────────────────────────────────────────────────────
// Actualizar nombres de canales "Status" y "Server"
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

  let statusEmoji = '🟢';
  let mcCount = 0;

  try {
    const mcStatus = await status(
      process.env.MC_HOST,
      parseInt(process.env.MC_PORT, 10),
      { timeout: 1500 }
    );
    mcCount = mcStatus.players.online ?? 0;
  } catch (err) {
    console.warn('⚠️ MC query failed:', err.message);
    statusEmoji = '🔴';
  }

  try {
    await statusChan.setName(`📊 Status: ${statusEmoji}`);
    await serverChan.setName(`👥 Server: ${mcCount}`);
    console.log('✔ Channels updated');
  } catch (err) {
    console.error('⚠️ Error renaming channels:', err);
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Ready
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  client.user.setPresence({
    status: 'online',
    activities: [{ name: 'CocoCraft', type: ActivityType.Playing }],
  });

  await updateChannelNames();
  setInterval(updateChannelNames, 60 * 1000);
});

// ───────────────────────────────────────────────────────────────────────────────
// Herramientas generales
async function tempMsg(channel, content, ms = 7000) {
  const m = await channel.send({ content });
  setTimeout(() => m.delete().catch(() => {}), ms);
  return m;
}

// ───────────────────────────────────────────────────────────────────────────────
// Verificación (limpieza del canal y feedback)
const VERIFY_CHANNEL_ID = process.env.VERIFY_CHANNEL_ID;
async function verifyWithServer(discordId, code) {
  // TODO: Sustituir por tu verificación real
  await new Promise(r => setTimeout(r, 300));
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

// ───────────────────────────────────────────────────────────────────────────────
// Bienvenida con Canvas (sin RUN_WELCOME y con anti-duplicado a nivel canal)
const FONT_PATH = path.join(__dirname, 'assets', 'fonts', 'DMSans-Bold.ttf');
try { registerFont(FONT_PATH, { family: 'DMSans' }); } catch (e) {}

async function drawWelcome(member) {
  const width = 1280, height = 720;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Fondo
  const bg = await loadImage(path.join(__dirname, 'assets', 'images', 'welcome-bg.png'));
  ctx.drawImage(bg, 0, 0, width, height);

  // Avatar centrado
  const AVATAR_R = 120;
  const AVATAR_X = width / 2;
  const AVATAR_Y = 190;

  // Borde rosado
  ctx.beginPath();
  ctx.arc(AVATAR_X, AVATAR_Y, AVATAR_R + 18, 0, Math.PI * 2);
  ctx.fillStyle = '#ff6fa9';
  ctx.fill();

  // Avatar
  const avatarURL = member.user.displayAvatarURL({ extension: 'png', size: 256 });
  const avatarImg = await loadImage(avatarURL);
  ctx.save();
  ctx.beginPath();
  ctx.arc(AVATAR_X, AVATAR_Y, AVATAR_R, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(avatarImg, AVATAR_X - AVATAR_R, AVATAR_Y - AVATAR_R, AVATAR_R * 2, AVATAR_R * 2);
  ctx.restore();

  // Nombre grande
  const name = member.displayName || member.user.username;
  ctx.fillStyle = 'white';
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 16;
  ctx.textAlign = 'center';
  ctx.font = '84px DMSans';
  ctx.fillText(name, width / 2, 430);

  return canvas.toBuffer('image/png');
}

/**
 * ¿Ya publicamos bienvenida para este user hace poco?
 * Revisa los últimos mensajes del canal (cross-instancia).
 */
async function alreadyWelcomed(channel, member, windowSec = 45) {
  const now = Date.now();
  const msgs = await channel.messages.fetch({ limit: 40 }).catch(() => null);
  if (!msgs) return false;

  for (const m of msgs.values()) {
    if (m.author.id !== client.user.id) continue;
    // Si el mensaje menciona al usuario o tiene imagen nuestra
    const mentionsUser = m.content?.includes(`<@${member.id}>`);
    const isRecent = now - m.createdTimestamp < windowSec * 1000;
    if (!isRecent) continue;
    if (mentionsUser || m.attachments.size > 0) return true;
  }
  return false;
}

/** Limpia duplicados si se coló más de uno por condiciones de carrera. */
async function cleanWelcomeDuplicates(channel, member, windowSec = 120) {
  const msgs = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  if (!msgs) return;
  const mine = [];
  const now = Date.now();

  for (const m of msgs.values()) {
    if (m.author.id !== client.user.id) continue;
    const isRecent = now - m.createdTimestamp < windowSec * 1000;
    if (!isRecent) continue;
    if (m.content?.includes(`<@${member.id}>`) || m.attachments.size > 0) {
      mine.push(m);
    }
  }
  // Ordenar por más antiguo primero, dejar el primero y borrar el resto
  mine.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  for (let i = 1; i < mine.length; i++) {
    mine[i].delete().catch(() => {});
  }
}

client.removeAllListeners('guildMemberAdd');
client.on('guildMemberAdd', async (member) => {
  const canal = member.guild.channels.cache.get(process.env.WELCOME_CHANNEL_ID);
  if (!canal) return console.error('❌ Welcome channel not found');

  // Guard cross-instancia: si ya hay bienvenida reciente, no publiques.
  if (await alreadyWelcomed(canal, member)) return;

  // Texto
  await canal.send(
    `🍪 ¡Bienvenido ${member} a **${member.guild.name}**! Lee las 📜 <#${process.env.RULES_CHANNEL_ID}> y visita 🌈 <#${process.env.ROLES_CHANNEL_ID}>`
  );

  // Imagen
  try {
    const buffer = await drawWelcome(member);
    const file = new AttachmentBuilder(buffer, { name: 'bienvenida.png' });
    await canal.send({ files: [file] });
  } catch (err) {
    console.error('⚠️ Canvas error:', err);
  }

  // Limpieza de duplicados (si otra instancia llegó casi a la vez)
  setTimeout(() => cleanWelcomeDuplicates(canal, member).catch(() => {}), 6000);
});

// ───────────────────────────────────────────────────────────────────────────────
// Login
client.login(process.env.DISCORD_TOKEN)
  .catch(err => console.error('❌ Login error:', err));
