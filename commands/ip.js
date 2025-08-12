// commands/ip.js
const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { status } = require('minecraft-server-util'); // Java Edition
const path = require('path');
const { createCanvas, loadImage, registerFont } = require('canvas');

// intenta registrar tu fuente (opcional)
try {
  registerFont(path.join(__dirname, '..', 'assets', 'fonts', 'DMSans-Bold.ttf'), {
    family: 'DMSansBold'
  });
} catch (_) {}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ip')
    .setDescription('Muestra la IP y un banner con el número de jugadores en tiempo real'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: false });

    const host = process.env.MC_HOST || '127.0.0.1';
    const port = parseInt(process.env.MC_PORT || '25565', 10);

    let online = 0;
    let max = 0;
    let ok = true;

    try {
      const res = await status(host, { port, timeout: 2000 });
      online = res.players?.online ?? 0;
      max    = res.players?.max ?? Math.max(online, 1);
    } catch (err) {
      ok = false;
      // si no responde, deja online=0 y max=1 para la barra
    }

    // --- generar imagen dinámica ---
    const bgPath = path.join(__dirname, '..', 'assets', 'images', 'server-status-bg.png'); // <-- tu imagen
    const buffer = await drawServerCard({
      bgPath,
      host,
      port,
      online,
      max,
      ok
    });

    const file = new AttachmentBuilder(buffer, { name: `server-status-${Date.now()}.png` });

    // --- embed ---
    const embed = new EmbedBuilder()
      .setColor(0x4cadd0) // #4cadd0
      .setTitle('CocoCraft | Servidor')
      .setDescription(`\`${host}:${port}\``)
      .setImage('attachment://' + file.name)
      .setFooter({ text: ok ? 'Estado en vivo' : 'No se pudo contactar al servidor' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed], files: [file] });
  }
};

/**
 * Dibuja una tarjeta con fondo + online/max + barra de progreso
 */
async function drawServerCard({ bgPath, host, port, online, max, ok }) {
  // tamaño recomendado para banners: 1024x300 (puedes cambiarlo)
  const W = 1024;
  const H = 300;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // fondo
  try {
    const bg = await loadImage(bgPath);
    ctx.drawImage(bg, 0, 0, W, H);
  } catch {
    // fondo liso si falla la imagen
    ctx.fillStyle = '#1f2428';
    ctx.fillRect(0, 0, W, H);
  }

  // capa oscura suave para legibilidad
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, 0, W, H);

  // textos
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 10;

  // título
  ctx.font = 'bold 36px DMSansBold, sans-serif';
  ctx.fillText('CocoCraft Network', 32, 64);

  // ip
  ctx.font = 'bold 26px DMSansBold, sans-serif';
  ctx.fillStyle = '#cfe9f6';
  ctx.fillText(`${host}:${port}`, 32, 100);

  // estado y contador
  ctx.fillStyle = ok ? '#a7f3d0' : '#fca5a5';
  ctx.font = 'bold 24px DMSansBold, sans-serif';
  ctx.fillText(ok ? 'Online' : 'Offline', 32, 138);

  // contador grande
  const pct = Math.max(0, Math.min(1, max ? online / max : 0));
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 64px DMSansBold, sans-serif';
  const countText = `${online}/${max}`;
  ctx.fillText(countText, 32, 220);

  // barra de progreso
  const barX = 32;
  const barY = 238;
  const barW = W - 64;
  const barH = 24;

  // fondo de barra
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  roundRect(ctx, barX, barY, barW, barH, 12);
  ctx.fill();

  // barra llena
  ctx.fillStyle = ok ? '#22c55e' : '#ef4444';
  roundRect(ctx, barX, barY, Math.max(10, Math.floor(barW * pct)), barH, 12);
  ctx.fill();

  // numerito a la derecha
  ctx.textAlign = 'right';
  ctx.font = 'bold 20px DMSansBold, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`${Math.round(pct * 100)}%`, barX + barW - 8, barY + barH - 6);

  return canvas.toBuffer('image/png');
}

// utilidad para esquinas redondeadas
function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
