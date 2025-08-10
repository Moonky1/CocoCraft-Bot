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

// ⬇ Canvas + fuente
const { createCanvas, loadImage, registerFont } = require('canvas');
registerFont(
  path.join(__dirname, 'assets', 'fonts', 'DMSans-Bold.ttf'),
  { family: 'DMSans', weight: '800' }
);

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

// ─── Carga de slash-commands (./commands) ───────────────────────────────────────
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

// ─── Handler de slash-commands ──────────────────────────────────────────────────
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

// ─── Update “Status” & “Server” Channel Names ────────────────────────────────────
// (Dejé tu lógica general; si ya usas RCON/otro método, puedes sustituir dentro)
async function updateChannelNames() {
  console.log(
    '🔧 ENV',
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

  // Estado por defecto (naranja)
  let statusEmoji = '🟠';
  let mcCount = 0;

  try {
    const mcStatus = await status(
      process.env.MC_HOST,
      parseInt(process.env.MC_PORT, 10),
      { timeout: 1500 }
    );
    mcCount = mcStatus.players.online ?? 0;
    statusEmoji = '🟢'; // online
  } catch (err) {
    console.warn('⚠️ MC query failed:', err.message);
    statusEmoji = '🔴'; // caído
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

// ─── Welcome Handler with Canvas ────────────────────────────────────────────────
client.removeAllListeners('guildMemberAdd');
client.on('guildMemberAdd', async member => {
  console.log('🔔 New member:', member.user.tag);

  const canal = member.guild.channels.cache.get(process.env.WELCOME_CHANNEL_ID);
  if (!canal) return console.error('❌ Welcome channel not found');

  // Mensaje de texto
  await canal.send(
    `🍪 ¡Bienvenido ${member} a **${member.guild.name}**! Lee las 📜 <#${process.env.RULES_CHANNEL_ID}> y visita 🌈 <#${process.env.ROLES_CHANNEL_ID}>`
  );

  // Imagen de bienvenida (DMSans + avatar centrado, sin subtítulo)
  try {
    const width = 1280, height = 720;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Fondo
    const bgPath = path.join(__dirname, 'assets', 'images', 'welcome-bg.png');
    const bg = await loadImage(bgPath);
    ctx.drawImage(bg, 0, 0, width, height);

    // Helper: encajar texto a un ancho máximo
    const fitText = (text, maxW, start = 86, min = 40, weight = 800) => {
      let size = start;
      do {
        ctx.font = `${weight} ${size}px DMSans, Arial`;
        size -= 2;
      } while (ctx.measureText(text).width > maxW && size > min);
      return size;
    };

    // Avatar circular (más centrado)
    const avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 512 });
    const res = await fetch(avatarUrl);
    const avatarBuf = Buffer.from(await res.arrayBuffer());
    const avatarImg = await loadImage(avatarBuf);

    const cx = width / 2;
    const cy = Math.round(height * 0.38); // centrado vertical un poco más abajo
    const r  = 140;

    // Aro
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r + 16, 0, Math.PI * 2);
    ctx.closePath();
    ctx.lineWidth = 18;
    ctx.strokeStyle = 'rgba(255, 105, 180, 0.9)'; // rosa
    ctx.stroke();
    ctx.restore();

    // Avatar recortado
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatarImg, cx - r, cy - r, r * 2, r * 2);
    ctx.restore();

    // SOLO el nombre grande
    const name = member.displayName || member.user.username;
    const maxNameWidth = width - 240;
    const nameSize = fitText(name, maxNameWidth, 86, 40, 800);

    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.98)';
    ctx.shadowColor = 'rgba(0,0,0,0.65)';
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 2;

    ctx.font = `800 ${nameSize}px DMSans, Arial`;
    ctx.fillText(name, width / 2, height - 90);

    const buffer = canvas.toBuffer('image/png');
    await canal.send({ files: [{ attachment: buffer, name: 'bienvenida.png' }] });
  } catch (err) {
    console.error('⚠️ Canvas error:', err);
  }
});

// ─── Auto-limpieza & verificación (canal de verificación) ──────────────────────
const VERIFY_CHANNEL_ID = process.env.VERIFY_CHANNEL_ID;

async function tempMsg(channel, content, ms = 7000) {
  const m = await channel.send({ content });
  setTimeout(() => m.delete().catch(() => {}), ms);
  return m;
}

// Simulación de verificación (sustituye por tu API/DB)
async function verifyWithServer(discordId, code) {
  await new Promise(r => setTimeout(r, 400)); // latencia simulada
  return /^\d{4,8}$/.test(code);              // demo: acepta 4–8 dígitos
}

client.on(Events.MessageCreate, async msg => {
  if (!msg.guild || msg.author.bot) return;
  if (!VERIFY_CHANNEL_ID || msg.channelId !== VERIFY_CHANNEL_ID) return;

  // borra SIEMPRE el mensaje del usuario para mantener el canal limpio
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
      // Aquí puedes asignar roles devueltos por tu verificación
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
