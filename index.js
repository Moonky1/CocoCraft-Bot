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

// ⬇️ ahora también importamos registerFont
const { createCanvas, loadImage, registerFont } = require('canvas');
const { status } = require('minecraft-server-util');

// ───────────────────────────────────────────────────────────────────────────────
// REGISTRO DE FUENTES (coloca los .ttf en assets/fonts/)
registerFont(path.join(__dirname, 'assets', 'fonts', 'Inter-Regular.ttf'), {
  family: 'Inter',
  weight: 'normal'
});
registerFont(path.join(__dirname, 'assets', 'fonts', 'Inter-Bold.ttf'), {
  family: 'Inter',
  weight: 'bold'
});
// ───────────────────────────────────────────────────────────────────────────────

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

  // ── ESTADO por RCON (sin latencia)
  let statusEmoji = '🟠'; // por defecto
  let mcCount = 0;

  try {
    // Seguimos usando query para el contador (si te funciona mejor con RCON, cámbialo)
    const mcStatus = await status(
      process.env.MC_HOST,
      parseInt(process.env.MC_PORT, 10),
      { timeout: 1500 }
    );
    mcCount = mcStatus.players.online;
  } catch (err) {
    console.warn('⚠️ MC query failed (contador):', err.message);
  }

  // Determinar estado con RCON
  try {
    const rcon = await Rcon.connect({
      host: process.env.MC_HOST,
      port: parseInt(process.env.RCON_PORT, 10),
      password: process.env.RCON_PASSWORD,
      timeout: 2000
    });

    // Si conecta, el server está "arriba"
    // ¿Whitelist on/off?
    let wl = 'off';
    try {
      const resp = await rcon.send('whitelist list');
      wl = /whitelist: on|enabled/i.test(resp) ? 'on' : 'off';
    } catch (_) {}

    await rcon.end();

    // Lógica de colores solo por estado
    statusEmoji = wl === 'on' ? '🟡' : '🟢'; // whitelist -> amarillo, sin whitelist -> verde
  } catch (err) {
    // No conectó RCON => server caído
    console.warn('⚠️ RCON no disponible:', err.message);
    statusEmoji = '🔴';
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
    activities: [{ name: 'Spawn Club', type: ActivityType.Playing }]
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

  // Texto de bienvenida
  await canal.send(
    `🍪 ¡Bienvenido ${member} a **${member.guild.name}**!\n` +
    `Lee las 📜 <#${process.env.RULES_CHANNEL_ID}> y visita 🌈 <#${process.env.ROLES_CHANNEL_ID}>`
  );

  // Imagen con canvas
  try {
    const width = 1280, height = 720;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const bg = await loadImage(path.join(__dirname, 'bienvenida.png'));
    ctx.drawImage(bg, 0, 0, width, height);

    // ⬇️ Usamos Inter (registrada arriba)
    ctx.font = 'bold 60px Inter';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(member.user.username, width / 2, 620);

    ctx.font = '40px Inter';
    ctx.fillText(`Bienvenido a ${member.guild.name}`, width / 2, 670);

    const buffer = canvas.toBuffer('image/png');
    await canal.send({ files: [{ attachment: buffer, name: 'bienvenida.png' }] });
  } catch (err) {
    console.error('⚠️ Canvas error:', err);
  }
});

// ─── Auto-limpieza & verificación en canal de verificación ─────────────────────
const VERIFY_CHANNEL_ID = process.env.VERIFY_CHANNEL_ID;

async function tempMsg(channel, content, ms = 7000) {
  const m = await channel.send({ content });
  setTimeout(() => m.delete().catch(() => {}), ms);
  return m;
}

// Demo de verificación (reemplaza por tu API/DB/Plugin)
async function verifyWithServer(discordId, code) {
  await new Promise(r => setTimeout(r, 400)); // simular latencia
  return /^\d{4,8}$/.test(code);              // acepta 4–8 dígitos
}

client.on(Events.MessageCreate, async msg => {
  if (!msg.guild || msg.author.bot) return;
  if (!VERIFY_CHANNEL_ID || msg.channelId !== VERIFY_CHANNEL_ID) return;

  // Borra SIEMPRE el mensaje del usuario
  try { await msg.delete(); } catch {}

  // Captura un código 4–8 dígitos
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
      // Ejemplo de asignar rol devuelto por tu verificación:
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