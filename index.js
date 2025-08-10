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
const { createCanvas, loadImage, registerFont } = require('canvas');
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

// ─── Carga de fonts (para la imagen de bienvenida) ──────────────────────────────
try {
  registerFont(
    path.join(__dirname, 'assets', 'fonts', 'DMSans-Bold.ttf'),
    { family: 'DMSans', weight: '700' }
  );
  console.log('🅰️  DMSans-Bold registrado');
} catch (e) {
  console.warn('⚠️ No se pudo registrar la fuente DMSans-Bold:', e.message);
}

// ─── Flags y anti-duplicados de bienvenida ──────────────────────────────────────
const RUN_WELCOME = (process.env.RUN_WELCOME || 'true').toLowerCase() === 'true';
console.log('RUN_WELCOME =', RUN_WELCOME, 'env from', process.env.RAILWAY_SERVICE_NAME || 'local');

// Pequeño dedupe en memoria (8s)
const recentWelcomes = new Set();
function shouldWelcomeOnce(key, ms = 8000) {
  if (recentWelcomes.has(key)) return false;
  recentWelcomes.add(key);
  setTimeout(() => recentWelcomes.delete(key), ms);
  return true;
}

// ─── Carga de slash commands desde ./commands ───────────────────────────────────
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

// ─── Handler de slash commands ──────────────────────────────────────────────────
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

// ─── Update “Status” & “Server” Channel Names ───────────────────────────────────
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

  // Emoji por disponibilidad MC (simple)
  let statusEmoji = '🟢';
  let mcCount = 0;

  try {
    const mcStatus = await status(
      process.env.MC_HOST,
      parseInt(process.env.MC_PORT, 10),
      { timeout: 1500 }
    );
    mcCount = mcStatus.players.online;
    statusEmoji = '🟢';
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

// ─── Welcome Handler con imagen y dedupe ────────────────────────────────────────
if (RUN_WELCOME) {
  client.removeAllListeners('guildMemberAdd');

  client.on('guildMemberAdd', async member => {
    // anti-duplicados
    const key = `${member.guild.id}:${member.id}`;
    if (!shouldWelcomeOnce(key)) return;

    console.log('🔔 New member:', member.user.tag);

    const canal = member.guild.channels.cache.get(process.env.WELCOME_CHANNEL_ID);
    if (!canal) return console.error('❌ Welcome channel not found');

    // 1) Mensaje de texto
    try {
      await canal.send(
        `🍪 ¡Bienvenido ${member} a **${member.guild.name}**! Lee las 📜 <#${process.env.RULES_CHANNEL_ID}> y visita 🌈 <#${process.env.ROLES_CHANNEL_ID}>`
      );
    } catch (e) {
      console.warn('⚠️ No se pudo enviar el texto de bienvenida:', e.message);
    }

    // 2) Imagen de bienvenida (fondo + avatar + nombre)
    try {
      const width = 1280, height = 720;
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');

      // Fondo
      const bgPath = path.join(__dirname, 'assets', 'images', 'welcome-bg.png');
      const bg = await loadImage(bgPath);
      ctx.drawImage(bg, 0, 0, width, height);

      // Avatar
      const avatarURL = member.user.displayAvatarURL({ extension: 'png', size: 256 });
      const avatarImg = await loadImage(avatarURL);
      const avatarSize = 230;
      const avatarX = width / 2 - avatarSize / 2;
      const avatarY = 110;

      // círculo de avatar con borde
      const borderRadius = (avatarSize / 2) + 18;
      const centerX = width / 2;
      const centerY = avatarY + avatarSize / 2;

      // borde
      ctx.beginPath();
      ctx.arc(centerX, centerY, borderRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#f06db3';
      ctx.fill();

      // máscara circular para el avatar
      ctx.save();
      ctx.beginPath();
      ctx.arc(centerX, centerY, avatarSize / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(avatarImg, avatarX, avatarY, avatarSize, avatarSize);
      ctx.restore();

      // Nombre grande (fuente DMSans)
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.font = 'bold 96px "DMSans"';
      ctx.fillText(member.displayName || member.user.username, width / 2, 560); // solo nombre

      const buffer = canvas.toBuffer('image/png');
      await canal.send({ files: [{ attachment: buffer, name: 'bienvenida.png' }] });
    } catch (err) {
      console.error('⚠️ Canvas error:', err);
    }
  });
} else {
  console.log('👋 Welcome deshabilitado (RUN_WELCOME=false)');
}

// ─── Auto-limpieza & verificación en canal de verificación ──────────────────────
const VERIFY_CHANNEL_ID = process.env.VERIFY_CHANNEL_ID;

async function tempMsg(channel, content, ms = 7000) {
  const m = await channel.send({ content });
  setTimeout(() => m.delete().catch(() => {}), ms);
  return m;
}

// Simulación de verificación (sustituye por tu API/DB/plugin)
async function verifyWithServer(discordId, code) {
  await new Promise(r => setTimeout(r, 400)); // latencia simulada
  return /^\d{4,8}$/.test(code);              // demo: acepta 4-8 dígitos
}

client.on(Events.MessageCreate, async msg => {
  if (!msg.guild || msg.author.bot) return;
  if (!VERIFY_CHANNEL_ID || msg.channelId !== VERIFY_CHANNEL_ID) return;

  // borra SIEMPRE el mensaje del usuario para mantener el canal limpio
  try { await msg.delete(); } catch {}

  // intenta capturar un código 4–8 dígitos
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
      // Aquí puedes asignar roles devueltos por tu verificación:
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
