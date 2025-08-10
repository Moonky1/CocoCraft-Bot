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

// ── Boost detector ────────────────────────────────────────────────────────────
const BOOST_CHANNEL_ID  = process.env.BOOST_CHANNEL_ID  || '1404007396988289065'; // #boosts
const TICKETS_CHANNEL_ID = process.env.TICKETS_CHANNEL_ID || '1399207405602082816'; // #tickets

// anti-duplicado por si Discord emite varios updates seguidos del mismo user
const recentBoosters = new Map(); // userId -> timestamp

client.on('guildMemberUpdate', async (oldMember, newMember) => {
  try {
    // empezó a boostear (antes no tenía premiumSince y ahora sí)
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

    const msg =
      `**¡Gracias por el boost ${newMember}!** Con este ya sumamos **${totalBoosts}** boosts. Canjea tus premios en <#${TICKETS_CHANNEL_ID}>.`;

    await ch.send(msg);
  } catch (err) {
    console.error('boost announce error:', err);
  }
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
  const hasText = m.content?.includes('🍪 ¡Bienvenido') && m.content?.includes(`<@${memberId}>`);
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

    // Si otra instancia lo acaba de saludar, no dupliques
    if (wasWelcomedRecently(member.id)) return;
    if (await alreadyInChannel(canal, member, 90)) { markWelcomed(member.id); return; }

    // Limpia restos anteriores (si quedaron)
    await cleanWelcomeDuplicates(canal, member, 600);

    // Imagen + texto (esto define "V2")
    const buffer = await drawWelcome(member);
    const file = new AttachmentBuilder(buffer, { name: 'bienvenida.png' });

    const content =
      `🍪 ¡Bienvenido <@${member.id}> a **${member.guild.name}**! Lee las 📜 <#${process.env.RULES_CHANNEL_ID}> y visita 🌈 <#${process.env.ROLES_CHANNEL_ID}>`;

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

// ───────────────────────────────────────────────────────────────────────
// Tickets: abrir/cerrar + transcript
// Requiere en .env:
//  TICKETS_CHANNEL_ID=1399207405602082816
//  SUPPORT_CATEGORY_ID=1399207365886345246
//  LOGS_CHANNEL_ID=1404021560997707856
//  SUPPORT_ROLE_IDS=ID1,ID2 (opcional, roles con acceso a los tickets)

const path = require('path');

// helpers de permisos
function buildOverwrites(guild, openerId) {
  const overwrites = [
    { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
    {
      id: openerId,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.AttachFiles,
      ],
    },
  ];

  const raw = (process.env.SUPPORT_ROLE_IDS || '').trim();
  if (raw) {
    const ids = raw.split(',').map(s => s.trim()).filter(Boolean);
    for (const id of ids) {
      overwrites.push({
        id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.ManageMessages,
        ],
      });
    }
  }
  return overwrites;
}

// busca si el usuario ya tiene un ticket (marcamos el topic con su ID)
function findExistingTicket(guild, userId) {
  return guild.channels.cache.find(ch =>
    ch.type === ChannelType.GuildText &&
    ch.parentId === process.env.SUPPORT_CATEGORY_ID &&
    ch.topic === userId
  );
}

// transcript simple (TXT) de un canal
async function makeTranscriptTXT(channel, limit = 1000) {
  let lastId;
  const all = [];

  while (all.length < limit) {
    const options = { limit: 100 };
    if (lastId) options.before = lastId;
    const batch = await channel.messages.fetch(options);
    if (!batch.size) break;
    all.push(...batch.values());
    lastId = batch.last().id;
    if (batch.size < 100) break;
  }

  // ascendente (viejo → nuevo)
  all.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  const lines = all.map(m => {
    const time = new Date(m.createdTimestamp).toISOString().replace('T', ' ').slice(0, 19);
    const author = `${m.author.tag} (${m.author.id})`;
    const content = m.cleanContent || '';
    const attachments = [...m.attachments.values()].map(a => a.url).join(' ');
    return `[${time}] ${author}: ${content}${attachments ? ` ${attachments}` : ''}`;
  });

  return Buffer.from(lines.join('\n'), 'utf8');
}

// handler de botones
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;

  // ABRIR TICKET
  if (interaction.customId === 'ticket_open') {
    try {
      const guild = interaction.guild;
      const opener = interaction.user;

      // ¿ya tiene uno?
      const existing = findExistingTicket(guild, opener.id);
      if (existing) {
        return interaction.reply({
          content: `🔎 Ya tienes un ticket abierto: <#${existing.id}>`,
          ephemeral: true,
        });
      }

      // crea el canal
      const safeName = opener.username
        .toLowerCase()
        .replaceAll(' ', '-')
        .replace(/[^a-z0-9-_]/g, '');
      const channel = await guild.channels.create({
        name: `👤│${safeName}`,
        type: ChannelType.GuildText,
        parent: process.env.SUPPORT_CATEGORY_ID || null,
        topic: opener.id, // nos sirve para identificar al dueño
        permissionOverwrites: buildOverwrites(guild, opener.id),
      });

      // mensaje inicial + botón cerrar
      const embed = new EmbedBuilder()
        .setColor(0x2b2d31)
        .setDescription([
          `Gracias por abrir tu ticket, ${opener}.`,
          'Cuéntanos tu caso con detalle y adjunta la info necesaria.',
          'Para cerrar el ticket, usa el botón **Cerrar ticket**.',
        ].join('\n'));

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('ticket_close')
          .setLabel('Cerrar ticket')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🗑️')
      );

      await channel.send({ content: `<@${opener.id}>`, embeds: [embed], components: [row] });

      await interaction.reply({
        content: `✅ Ticket creado: <#${channel.id}>`,
        ephemeral: true,
      });
    } catch (e) {
      console.error('ticket_open error', e);
      if (!interaction.replied) {
        await interaction.reply({ content: '❌ No pude crear tu ticket.', ephemeral: true });
      }
    }
    return;
  }

  // CERRAR TICKET
  if (interaction.customId === 'ticket_close') {
    try {
      const channel = interaction.channel;
      const guild = interaction.guild;

      // solo staff (ManageChannels) o el dueño del ticket (topic) puede cerrar
      const isOwner = channel.topic === interaction.user.id;
      const isStaff = interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels);
      if (!isOwner && !isStaff) {
        return interaction.reply({ content: '⛔ No puedes cerrar este ticket.', ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });

      // transcript
      const txt = await makeTranscriptTXT(channel, 1000);
      const file = new AttachmentBuilder(txt, { name: `transcript-${channel.name}.txt` });

      // al canal de logs
      const logs = guild.channels.cache.get(process.env.LOGS_CHANNEL_ID);
      if (logs) {
        const embed = new EmbedBuilder()
          .setColor(0xff4d4d)
          .setTitle('Ticket cerrado')
          .setDescription([
            `Canal: ${channel.name} (${channel.id})`,
            `Dueño: <@${channel.topic || 'desconocido'}>`,
            `Cerrado por: ${interaction.user.tag}`,
          ].join('\n'))
          .setTimestamp();

        await logs.send({ embeds: [embed], files: [file] });
      }

      await interaction.editReply({ content: '📁 Transcript enviado a logs. Cerrando canal…' });

      setTimeout(() => channel.delete().catch(() => {}), 2000);
    } catch (e) {
      console.error('ticket_close error', e);
      if (!interaction.replied) {
        await interaction.reply({ content: '❌ No pude cerrar el ticket.', ephemeral: true });
      }
    }
    return;
  }
});
