// index.js
require('dotenv').config();

const express = require('express');
const path = require('path');
const { Client, GatewayIntentBits, ActivityType } = require('discord.js');
const { createCanvas, loadImage } = require('canvas');

// ─── Keep-Alive HTTP Server ─────────────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (_req, res) => res.send('🤖 Bot alive'));
app.listen(PORT, () => console.log(`🌐 Healthcheck on port ${PORT}`));

// ─── Discord Client ─────────────────────────────────────────────────────────────
const client = new Client({
  intents: [ GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers ]
});

// ─── Update Channel Names Every Minute ──────────────────────────────────────────
async function updateChannelNames() {
  const guild = client.guilds.cache.get(process.env.GUILD_ID);
  if (!guild) return console.error('❌ Guild not found');

  try {
    // 1) Discord member count
    const discordCount = guild.memberCount;

    // 2) Bot status indicator
    const statusEmoji = client.ws.ping < 200 ? '🟢' : '🟠';

    // 3) Minecraft player count (replace with real data or API call)
    const mcCount = 0;

    // Rename channels
    await guild.channels.cache.get(process.env.CHANNEL_DISCORD_ID)
      ?.setName(`❤️ Discord: ${discordCount}`);
    await guild.channels.cache.get(process.env.CHANNEL_STATUS_ID)
      ?.setName(`📊 Status: ${statusEmoji}`);
    await guild.channels.cache.get(process.env.CHANNEL_SERVER_ID)
      ?.setName(`👥 Server: ${mcCount}`);

    console.log('🔄 Channels updated');
  } catch (err) {
    console.error('⚠️ Error updating channels:', err);
  }
}

// ─── On Ready ───────────────────────────────────────────────────────────────────
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  // Set initial presence
  client.user.setPresence({
    status: 'online',
    activities: [{ name: 'Spawn Club', type: ActivityType.Playing }]
  });

  // Update channels immediately, then every minute
  await updateChannelNames();
  setInterval(updateChannelNames, 60 * 1000);
});

// ─── Welcome Handler with Canvas ────────────────────────────────────────────────
client.removeAllListeners('guildMemberAdd');
client.on('guildMemberAdd', async member => {
  console.log('🔔 New member:', member.user.tag);

  const canal = member.guild.channels.cache.get(process.env.WELCOME_CHANNEL_ID);
  if (!canal) return console.error('❌ Welcome channel not found');

  // Send text welcome
  await canal.send(
    `🍪 Welcome ${member} to **${member.guild.name}**!\n` +
    `Please read the 📜 <#${process.env.RULES_CHANNEL_ID}> and visit 🌈 <#${process.env.ROLES_CHANNEL_ID}> for roles.`
  );

  // Send canvas image
  try {
    const width = 1280, height = 720;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Draw background
    const bg = await loadImage(path.join(__dirname, 'bienvenida.png'));
    ctx.drawImage(bg, 0, 0, width, height);

    // Draw username
    ctx.font = 'bold 60px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(member.user.username, width / 2, 620);

    // Draw server name
    ctx.font = 'bold 40px sans-serif';
    ctx.fillText(`Welcome to ${member.guild.name}`, width / 2, 670);
    const buffer = canvas.toBuffer();
    await canal.send({ files: [{ attachment: buffer, name: 'bienvenida.png' }] });

  } catch (err) {
    console.error('⚠️ Canvas error:', err);
  }
});

// ─── Login ──────────────────────────────────────────────────────────────────────
client.login(process.env.DISCORD_TOKEN)
  .catch(err => console.error('❌ Login error:', err));
