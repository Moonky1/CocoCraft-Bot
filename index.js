// index.js
require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
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

// ─── Carga de slash commands desde ./commands ───────────────────────────────────
client.commands = new Collection();
try {
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

  let statusEmoji = '🔴';
  let mcCount = 0;

  // 1) Intento con RCON (si hay credenciales)
  const hasRcon =
    process.env.RCON_HOST &&
    process.env.RCON_PORT &&
    process.env.RCON_PASSWORD;

  if (hasRcon) {
    try {
      const rcon = await Rcon.connect({
        host: process.env.RCON_HOST,
        port: Number(process.env.RCON_PORT),
        password: process.env.RCON_PASSWORD
      });

      // jugadores
      const list = await rcon.send('list'); // Paper/Spigot: "There are X of a max Y players online:"
      const m = list && list.match(/There are\s+(\d+)\s+of/i);
      if (m) mcCount = Number(m[1]) || 0;

      // whitelist (probar varios comandos, según la build)
      let wlOn = false;
      try {
        const w1 = await rcon.send('whitelist status'); // "Whitelist: true/false"
        wlOn = /true/i.test(w1);
      } catch (_) {
        try {
          const w2 = await rcon.send('whitelist list'); // algunos devuelven "Whitelist is enabled" o similar
          wlOn = /enabled|on|true/i.test(w2);
        } catch {}
      }

      statusEmoji = wlOn ? '🟡' : '🟢'; // 🟡 = whitelist, 🟢 online normal
      await rcon.end();
    } catch (e) {
      console.warn('⚠️ RCON no disponible:', e.message);
    }
  }

  // 2) Fallback a query si no hay RCON o falló
  if (statusEmoji === '🔴') {
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
  }

  // 3) Renombrar canales
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

// ─── Welcome Handler con Canvas ────────────────────────────────────────────────
const RUN_WELCOME = process.env.RUN_WELCOME !== 'false'; // pon RUN_WELCOME=false para evitar duplicados

client.removeAllListeners('guildMemberAdd');
client.on('guildMemberAdd', async member => {
  if (!RUN_WELCOME) return;

  console.log('🔔 New member:', member.user.tag);

  const canal = member.guild.channels.cache.get(process.env.WELCOME_CHANNEL_ID);
  if (!canal) return console.error('❌ Welcome channel not found');

  // Texto de bienvenida
  await canal.send(
    `🍪 ¡Bienvenido ${member} a **${member.guild.name}**!\n` +
    `Lee las 📜 <#${process.env.RULES_CHANNEL_ID}> y visita 🌈 <#${process.env.ROLES_CHANNEL_ID}>`
  );

  // Imagen de bienvenida
  try {
    // Registrar fuente opcional (si existe)
    const interPath = path.join(__dirname, 'assets', 'fonts', 'Inter-Regular.ttf');
    if (fs.existsSync(interPath)) {
      registerFont(interPath, { family: 'Inter' });
    }

    const width = 1280, height = 720;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // ✅ Fondo desde assets/images/welcome-bg.png
    const bgPath = path.join(__dirname, 'assets', 'images', 'welcome-bg.png');
    console.log('🖼️ welcome bg at:', bgPath, 'exists=', fs.existsSync(bgPath));
    if (!fs.existsSync(bgPath)) {
      throw new Error(`Background image not found at ${bgPath}`);
    }

    const bg = await loadImage(bgPath);
    ctx.drawImage(bg, 0, 0, width, height);

    // Títulos
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 60px ${fs.existsSync(interPath) ? 'Inter' : 'sans-serif'}`;
    ctx.fillText(member.user.username, width / 2, 620);

    ctx.font = `bold 40px ${fs.existsSync(interPath) ? 'Inter' : 'sans-serif'}`;
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

// Simulación verificación (reemplaza por tu lógica real/API)
async function verifyWithServer(discordId, code) {
  await new Promise(r => setTimeout(r, 400));
  return /^\d{4,8}$/.test(code);
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
