// commands/ip.js
const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { status, statusBedrock } = require('minecraft-server-util');
const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');

// Fuente opcional (si la tienes)
try {
  registerFont(path.join(__dirname, '..', 'assets', 'fonts', 'DMSans-Bold.ttf'), {
    family: 'DMSansBold',
  });
} catch (_) { /* no pasa nada si no está */ }

const EMBED_COLOR = 0x4cadd0; // #4cadd0

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ip')
    .setDescription('Muestra el estado del servidor con imagen'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: false });

    // Config
    const host        = process.env.MC_HOST || '172.240.1.180';
    const port        = parseInt(process.env.MC_PORT || '25565', 10);
    const maxSlotsEnv = parseInt(process.env.MC_MAX  || '200',   10);
    const timeoutMs   = parseInt(process.env.MC_TIMEOUT || '7000', 10);
    const bePort      = parseInt(process.env.BE_PORT || '19132', 10);
    const maintenance =
      String(process.env.MAINTENANCE || '').toLowerCase() === '1' ||
      String(process.env.MAINTENANCE || '').toLowerCase() === 'true';

    const serverName = process.env.SERVER_NAME || 'CocoCraft';

    // ===== PING =====
    let isOnline = false;
    let online = 0;
    let maxFromServer = maxSlotsEnv;

    try {
      const res = await status(host, {
        port,
        timeout: timeoutMs,
        enableSRV: true,
      });
      isOnline = true;
      online = Math.max(0, res.players?.online ?? 0);
      const rawMax = res.players?.max ?? 0;
      if (rawMax && Number.isFinite(rawMax)) maxFromServer = rawMax;
    } catch (e1) {
      // fallback a Bedrock si aplica
      try {
        const resB = await statusBedrock(host, {
          port: bePort,
          timeout: timeoutMs,
        });
        isOnline = true;
        online = Math.max(0, resB.players?.online ?? 0);
        const rawMaxB = resB.players?.max ?? 0;
        if (rawMaxB && Number.isFinite(rawMaxB)) maxFromServer = rawMaxB;
      } catch (e2) {
        // sigue offline si ambos fallan
        console.error('Ping falló (java/bedrock):', e1?.code || e1?.message, '|', e2?.code || e2?.message);
      }
    }

    // Forzar mantenimiento si está activo
    const showMaintenance = maintenance;
    const showOnline = !showMaintenance && isOnline;

    // ===== Dibujo de la tarjeta =====
    const W = 1000;
    const H = 240;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    // Fondo
    let bg;
    try {
      const bgPath = path.join(__dirname, '..', 'assets', 'images', 'server-status-bg.png');
      bg = await loadImage(bgPath);
    } catch {
      const fallback = path.join(__dirname, '..', 'assets', 'images', 'welcome-bg.png');
      bg = await loadImage(fallback);
    }
    ctx.drawImage(bg, 0, 0, W, H);

    // Nombre del server
    ctx.font = 'bold 38px DMSansBold, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 10;
    ctx.fillText(serverName, 24, 70);
    ctx.shadowBlur = 0;

    // Etiqueta de estado
    const drawBadge = (text, color) => {
      ctx.font = 'bold 16px DMSansBold, sans-serif';
      const padX = 10, padY = 6;
      const textW = ctx.measureText(text).width;
      const x = 24, y = 86;
      const w = textW + padX * 2, h = 28;

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 8);
      ctx.fill();

      ctx.fillStyle = '#000000';
      ctx.globalAlpha = 0.15;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 8);
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.fillStyle = '#ffffff';
      ctx.fillText(text, x + padX, y + 19);
    };

    if (showMaintenance) {
      drawBadge('En mantenimiento', '#f1c40f');
    } else if (showOnline) {
      drawBadge('Online', '#2ecc71');
    } else {
      drawBadge('Offline', '#e74c3c');
    }

    // Conteo y barra
    const cap = Math.max(maxFromServer || maxSlotsEnv, 1);
    const pct = Math.min(online / cap, 1);

    // Texto 0/200 grande
    ctx.font = 'bold 54px DMSansBold, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 16;
    const label = `${online}/${cap}`;
    ctx.fillText(label, 24, 150);
    ctx.shadowBlur = 0;

    // Barra de progreso
    const barX = 24;
    const barY = 170;
    const barW = W - 48;
    const barH = 18;

    // fondo barra
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, barH, 9);
    ctx.fill();

    // fill
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.roundRect(barX, barY, Math.max(12, barW * pct), barH, 9);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Porcentaje al extremo
    ctx.font = 'bold 14px DMSansBold, sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    const pctStr = `${Math.round(pct * 100)}%`;
    const pW = ctx.measureText(pctStr).width;
    ctx.fillText(pctStr, barX + barW - pW, barY + barH - 4);

    const cardBuffer = canvas.toBuffer('image/png');
    const cardFile = new AttachmentBuilder(cardBuffer, { name: 'server-status.png' });

    // Thumbnail (opcional)
    const files = [cardFile];
    const thumbPath = path.join(__dirname, '..', 'assets', 'images', 'thumb.png');
    let thumbOk = false;
    try {
      await loadImage(thumbPath);
      thumbOk = true;
      files.push({ attachment: thumbPath, name: 'thumb.png' });
    } catch (_) { /* sin thumb */ }

    // ===== Embed =====
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setTitle(`${serverName} | Servidor`)
      .addFields(
        { name: 'IP:', value: `\`${host}\``, inline: false },
        { name: 'Bedrock:', value: 'Puerto `25565`', inline: false }, // como pediste
      )
      .setImage('attachment://server-status.png')
      .setTimestamp();

    if (thumbOk) {
      embed.setThumbnail('attachment://thumb.png');
    }

    await interaction.editReply({ embeds: [embed], files });
  },
};
