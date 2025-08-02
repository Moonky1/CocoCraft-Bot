// index.js
require('dotenv').config();
const express = require('express');
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('canvas');  // ← canvas
const path = require('path');

// Keep‑Alive
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (_r, res) => res.send('🤖 Bot alive'));
app.listen(PORT, () => console.log(`🌐 Healthcheck on port ${PORT}`));

// Crea cliente Discord
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

// Borra listeners viejos
client.removeAllListeners('guildMemberAdd');

client.once('ready', () => {
  console.log(`✅ Conectado como ${client.user.tag}`);
  client.user.setPresence({
    activities: [{ name: 'Spawn Club', type: 0 }], // 0 = Playing
    status: 'online'
  });
});

// Único handler de bienvenida
client.on('guildMemberAdd', async member => {
  console.log('🔔 guildMemberAdd trigger para:', member.user.username);

  const canal = member.guild.channels.cache.get('1399202129377234954');
  if (!canal) return;

  // 1) Texto de bienvenida
  await canal.send(
    `🍪 ¡Bienvenido ${member} al Discord de **${member.guild.name}**!\n` +
    `Por favor lee las 📜 <#1399202510367096973> y visita 🌈 <#1399202909467709511> para obtener roles.`
  );

  // 2) Imagen con canvas
  try {
    // Dimensiones que quieras
    const width = 1280;
    const height = 720;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 2a) Dibuja tu fondo
    const fondo = await loadImage(path.join(__dirname, 'bienvenida.png'));
    ctx.drawImage(fondo, 0, 0, width, height);

    // 2b) Nombre del usuario
    ctx.font = 'bold 60px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(member.user.username, width / 2, 620);

    // 2c) Nombre del servidor
    ctx.font = 'bold 40px sans-serif';
    ctx.fillText(`Bienvenido a ${member.guild.name}`, width / 2, 670);

    // 2d) Envía la imagen
    const buffer = canvas.toBuffer();
    await canal.send({ files: [{ attachment: buffer, name: 'bienvenida.png' }] });

  } catch (err) {
    console.error('⚠️ Error generando imagen con canvas:', err);
  }
});

client.login(process.env.DISCORD_TOKEN);
