// index.js
require('dotenv').config();

const express = require('express');
const path = require('path');
const { Client, GatewayIntentBits, ActivityType } = require('discord.js');
const { createCanvas, loadImage } = require('canvas');
const { status } = require('minecraft-server-util');

// ─── Keep-Alive HTTP Server ─────────────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (_req, res) => res.send('🤖 Bot alive'));
app.listen(PORT, () => console.log(`🌐 Healthcheck on port ${PORT}`));

// ─── Discord Client ─────────────────────────────────────────────────────────────
const client = new Client({
  intents: [ GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers ]
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

  // 1) Base emoji: green if Discord ping <200ms, orange otherwise
  let statusEmoji = client.ws.ping < 200 ? '🟢' : '🟠';

  // 2) Try to fetch Minecraft status
  let mcCount = 0;
  try {
    const mcStatus = await status(
      process.env.MC_HOST,
      parseInt(process.env.MC_PORT, 10),
      { timeout: 1500 }
    );
    mcCount = mcStatus.players.online;
  } catch (err) {
    console.warn('⚠️ MC query failed:', err.message);
    statusEmoji = '🔴';  // mark red if MC is unreachable
  }

  // 3) Rename channels
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

  // initial presence
  client.user.setPresence({
    status: 'online',
    activities: [{ name: 'Spawn Club', type: ActivityType.Playing }]
  });

  // run immediately and then every 60s
  await updateChannelNames();
  setInterval(updateChannelNames, 60 * 1000);
});

// ─── Welcome Handler with Canvas ────────────────────────────────────────────────
client.removeAllListeners('guildMemberAdd');
client.on('guildMemberAdd', async member => {
  console.log('🔔 New member:', member.user.tag);

  const canal = member.guild.channels.cache.get(process.env.WELCOME_CHANNEL_ID);
  if (!canal) return console.error('❌ Welcome channel not found');

  // text welcome
  await canal.send(
    `🍪 ¡Bienvenido ${member} a **${member.guild.name}**!\n` +
    `Lee las 📜 <#${process.env.RULES_CHANNEL_ID}> y visita 🌈 <#${process.env.ROLES_CHANNEL_ID}>`
  );

  // canvas image
  try {
    const width = 1280, height = 720;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const bg = await loadImage(path.join(__dirname, 'bienvenida.png'));
    ctx.drawImage(bg, 0, 0, width, height);

    ctx.font = 'bold 60px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(member.user.username, width / 2, 620);

    ctx.font = 'bold 40px sans-serif';
    ctx.fillText(`Bienvenido a ${member.guild.name}`, width / 2, 670);

    const buffer = canvas.toBuffer();
    await canal.send({ files: [{ attachment: buffer, name: 'bienvenida.png' }] });
  } catch (err) {
    console.error('⚠️ Canvas error:', err);
  }
});

// ─── Login ──────────────────────────────────────────────────────────────────────
client.login(process.env.DISCORD_TOKEN)
  .catch(err => console.error('❌ Login error:', err));
