// commands/ip.js
const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
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
    const PORT = parseInt(process.env.MC_PORT, 10) || 25565;     // Java
    const BEDROCK_PORT = parseInt(process.env.BEDROCK_PORT, 10) || 19132;
    const SERVER_NAME = process.env.SERVER_NAME || 'CocoCraft';
    const BRAND_COLOR = 0x4cadd0;
    const MAINTENANCE = String(process.env.MAINTENANCE || '').trim() === '1';

    // ── Ping Java server ─────────────────────────────────────
    let isOnline = false;
    try {
      await status(HOST, { port: PORT, timeout: 2000 });
      isOnline = true;
    } catch (_) {
      isOnline = false;
    }

    // Estado para la imagen
    let stateText = 'Offline';
    let stateColor = '#ff6b6b'; // rojo
    if (MAINTENANCE) {
      stateText = 'En mantenimiento';
      stateColor = '#f7b500';  // ámbar
    } else if (isOnline) {
      stateText = 'Online';
      stateColor = '#49d17a';  // verde
    }

    // ── Canvas (solo nombre + estado) ────────────────────────
    const W = 1280, H = 360;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    // fondo
    const bgPath = path.join(__dirname, '..', 'assets', 'images', 'server-status-bg.png');
    try {
      const bg = await loadImage(bgPath);
      ctx.drawImage(bg, 0, 0, W, H);
    } catch {
      // fondo liso si no existe
      ctx.fillStyle = '#1e1f26';
      ctx.fillRect(0, 0, W, H);
    }

    // banda inferior suave
    const grad = ctx.createLinearGradient(0, H - 120, 0, H);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, H - 140, W, 140);

    // nombre del server
    ctx.font = 'bold 64px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 18;
    ctx.fillText(SERVER_NAME, 48, 120);

    // chip de estado
    const chipX = 48, chipY = 160, chipH = 56;
    ctx.shadowBlur = 0;
    ctx.fillStyle = stateColor;
    const pad = 22;
    // ancho dinámico segun texto
    ctx.font = 'bold 32px sans-serif';
    const textW = ctx.measureText(stateText).width;
    const chipW = textW + pad * 2;
    // rect redondeado
    const r = chipH / 2;
    ctx.beginPath();
    ctx.moveTo(chipX + r, chipY);
    ctx.lineTo(chipX + chipW - r, chipY);
    ctx.arc(chipX + chipW - r, chipY + r, r, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(chipX + r, chipY + chipH);
    ctx.arc(chipX + r, chipY + r, r, Math.PI / 2, -Math.PI / 2);
    ctx.closePath();
    ctx.fill();

    // texto del chip
    ctx.fillStyle = '#0e0f12';
    ctx.fillText(stateText, chipX + pad, chipY + 38);

    const bannerBuffer = canvas.toBuffer('image/png');
    const bannerFile = new AttachmentBuilder(bannerBuffer, { name: 'server-status.png' });

    // ── Thumbnail (logo) ─────────────────────────────────────
    const thumbPath = path.join(__dirname, '..', 'assets', 'images', 'thumb.png');

    // ── Embed ────────────────────────────────────────────────
    const embed = new EmbedBuilder()
      .setColor(BRAND_COLOR)
      .setTitle(`${SERVER_NAME} | Servidor`)
      // Solo texto aquí: IP y Bedrock
      .setDescription([
        `**IP:** \`${HOST}\``,
        `**Bedrock:** puerto \`${BEDROCK_PORT}\``,
      ].join('\n'))
      .setImage('attachment://server-status.png')
      .setTimestamp();

    try {
      // si hay logo, úsalo
      await loadImage(thumbPath);
      embed.setThumbnail('attachment://thumb.png');
      await interaction.editReply({
        embeds: [embed],
        files: [bannerFile, { attachment: thumbPath, name: 'thumb.png' }],
      });
    } catch {
      // sin logo
      await interaction.editReply({
        embeds: [embed],
        files: [bannerFile],
      });
    }
  }
};
