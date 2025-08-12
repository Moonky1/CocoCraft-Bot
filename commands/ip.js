const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { status, statusBedrock } = require('minecraft-server-util');
const { status } = require('minecraft-server-util');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ip')
    .setDescription('Muestra el estado del servidor con imagen'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: false });

    // ── Config ───────────────────────────────────────────────
    const HOST = process.env.MC_HOST || '172.240.1.180';
    const PORT = parseInt(process.env.MC_PORT, 10) || 25565;          // Java
    const TIMEOUT_MS   = Number(process.env.MC_TIMEOUT) || 7000;  // espera hasta 7s antes de dar “Offline”
    const BEDROCK_PORT = Number(process.env.BE_PORT)    || 19132; // por si usas Bedrock/Geyser
    const BEDROCK_PORT = parseInt(process.env.BEDROCK_PORT, 10) || 25565; // Texto
    const SERVER_NAME = process.env.SERVER_NAME || 'CocoCraft';
    const MAX_SLOTS = parseInt(process.env.MAX_SLOTS, 10) || 200;     // Cálculo %
    const MAINTENANCE = String(process.env.MAINTENANCE || '').trim() === '1';
    const BRAND_COLOR = 0x4cadd0;

    // ── Ping Java server ─────────────────────────────────────
    let isOnline = false;
    let online = 0;
    let maxFromServer = MAX_SLOTS;

    try {
      let isOnline = false;
let online   = 0;
let maxFromServer = MAX_SLOTS; // o como llames a tu tope (200)

try {
  // 1) PING JAVA (con SRV y timeout más alto)
  const res = await status(host, {
    port: port,
    timeout: TIMEOUT_MS,
    enableSRV: true
  });
  isOnline = true;
  online   = Math.max(0, res.players?.online ?? 0);
  const rawMax = res.players?.max ?? 0;
  if (rawMax && Number.isFinite(rawMax)) maxFromServer = rawMax;

} catch (e1) {
  // 2) FALLBACK: PING BEDROCK (solo si usas Bedrock/Geyser)
  try {
    const resB = await statusBedrock(host, {
      port: BEDROCK_PORT,
      timeout: TIMEOUT_MS
    });
    isOnline = true;
    online   = Math.max(0, resB.players?.online ?? 0);
    const rawMaxB = resB.players?.max ?? 0;
    if (rawMaxB && Number.isFinite(rawMaxB)) maxFromServer = rawMaxB;

  } catch (e2) {
    console.error('Ping falló (java, bedrock):', e1?.code || e1?.message, '|', e2?.code || e2?.message);
  }
}

      isOnline = true;
      online = Math.max(0, res.players?.online ?? 0);
      const rawMax = res.players?.max ?? 0;
      if (rawMax && Number.isFinite(rawMax)) {
        maxFromServer = rawMax;
      }
    } catch {
      isOnline = false;
      online = 0;
    }

    // tope para el % (si el server reporta 0, usamos MAX_SLOTS)
    const cap = maxFromServer || MAX_SLOTS;
    const percent = Math.max(0, Math.min(100, Math.round((online / cap) * 100)));

    // Estado: respeta MAINTENANCE sólo si lo pones en .env
    let stateText = 'Offline';
    let stateColor = '#ff6b6b'; // rojo
    if (MAINTENANCE) {
      stateText = 'En mantenimiento';
      stateColor = '#f7b500';  // ámbar
    } else if (isOnline) {
      stateText = 'Online';
      stateColor = '#49d17a';  // verde
    }

    // ── Canvas con nombre + estado + 0/200 + barra ──────────
    const W = 1280, H = 360;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    // fondo
    const bgPath = path.join(__dirname, '..', 'assets', 'images', 'server-status-bg.png');
    try {
      const bg = await loadImage(bgPath);
      ctx.drawImage(bg, 0, 0, W, H);
    } catch {
      ctx.fillStyle = '#1e1f26';
      ctx.fillRect(0, 0, W, H);
    }

    // banda inferior suave
    const grad = ctx.createLinearGradient(0, H - 120, 0, H);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, H - 140, W, 140);

    // Nombre
    ctx.font = 'bold 64px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 18;
    ctx.fillText(SERVER_NAME, 48, 120);

    // Chip de estado
    const chipX = 48, chipY = 160, chipH = 56;
    ctx.shadowBlur = 0;
    ctx.font = 'bold 32px sans-serif';
    const pad = 22;
    const textW = ctx.measureText(stateText).width;
    const chipW = textW + pad * 2;
    const r = chipH / 2;

    ctx.fillStyle = stateColor;
    ctx.beginPath();
    ctx.moveTo(chipX + r, chipY);
    ctx.lineTo(chipX + chipW - r, chipY);
    ctx.arc(chipX + chipW - r, chipY + r, r, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(chipX + r, chipY + chipH);
    ctx.arc(chipX + r, chipY + r, r, Math.PI / 2, -Math.PI / 2);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#0e0f12';
    ctx.fillText(stateText, chipX + pad, chipY + 38);

    // 0/200 grande
    ctx.font = 'bold 92px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 14;
    ctx.fillText(`${online}/${cap}`, 48, 300);

    // Barra de porcentaje
    ctx.shadowBlur = 0;
    const barX = 620, barY = 270, barW = 560, barH = 28, barR = 14;

    // fondo barra
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.moveTo(barX + barR, barY);
    ctx.lineTo(barX + barW - barR, barY);
    ctx.arc(barX + barW - barR, barY + barH / 2, barR, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(barX + barR, barY + barH);
    ctx.arc(barX + barR, barY + barH / 2, barR, Math.PI / 2, -Math.PI / 2);
    ctx.closePath();
    ctx.fill();

    // progreso
    const progW = Math.round((percent / 100) * barW);
    if (progW > 0) {
      ctx.fillStyle = '#4cadd0';
      ctx.beginPath();
      const w = Math.max(barH, progW); // mantener los bordes redondeados en valores bajos
      ctx.moveTo(barX + barR, barY);
      ctx.lineTo(barX + w - barR, barY);
      ctx.arc(barX + w - barR, barY + barH / 2, barR, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(barX + barR, barY + barH);
      ctx.arc(barX + barR, barY + barH / 2, barR, Math.PI / 2, -Math.PI / 2);
      ctx.closePath();
      ctx.fill();
    }

    // % texto
    ctx.font = 'bold 20px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${percent}%`, barX + barW + 12, barY + barH - 6);

    const bannerBuffer = canvas.toBuffer('image/png');
    const bannerFile = new AttachmentBuilder(bannerBuffer, { name: 'server-status.png' });

    // Thumbnail (logo)
    const thumbPath = path.join(__dirname, '..', 'assets', 'images', 'thumb.png');

    // Embed
    const embed = new EmbedBuilder()
      .setColor(BRAND_COLOR)
      .setTitle(`${SERVER_NAME} | Servidor`)
      .setDescription([
        `**IP:** \`${HOST}\``,
        `**Bedrock:** puerto \`${BEDROCK_PORT}\``,
      ].join('\n'))
      .setImage('attachment://server-status.png')
      .setTimestamp();

    try {
      await loadImage(thumbPath);
      embed.setThumbnail('attachment://thumb.png');
      await interaction.editReply({
        embeds: [embed],
        files: [bannerFile, { attachment: thumbPath, name: 'thumb.png' }],
      });
    } catch {
      await interaction.editReply({
        embeds: [embed],
        files: [bannerFile],
      });
    }
  }
};
