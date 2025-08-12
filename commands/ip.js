// commands/ip.js
const { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder } = require('discord.js');
const { status } = require('minecraft-server-util');
const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');

// registra fuente (una vez por proceso)
const FONT_PATH = path.join(__dirname, '..', 'assets', 'fonts', 'DMSans-Bold.ttf');
try { registerFont(FONT_PATH, { family: 'DMSansBold' }); } catch (e) {}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ip')
    .setDescription('Muestra el estado del servidor con imagen'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: false });

    const host = process.env.MC_HOST || 'tu.host.com';
    const port = Number(process.env.MC_PORT) || 25565;
    const serverName = process.env.SERVER_NAME || 'CocoCraft';

    let online = 0;
    let max = 0;
    let isUp = false;

    try {
      const res = await status(host, { port, timeout: 2500 });
      online = res?.players?.online ?? 0;
      max    = res?.players?.max ?? 0;
      isUp = true;
    } catch (err) {
      console.error('ip canvas ping error:', err);
      isUp = false;
    }

    // Canvas
    const W = 1280, H = 640;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    // Fondo
    try {
      const bg = await loadImage(path.join(__dirname, '..', 'assets', 'images', 'server-status-bg.png'));
      ctx.drawImage(bg, 0, 0, W, H);
    } catch {
      // fallback si no encuentra el fondo
      ctx.fillStyle = '#0e0f13';
      ctx.fillRect(0, 0, W, H);
    }

    // Capa suavizada para texto
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(40, 40, W - 80, H - 80);

    // Logo arriba derecha
    try {
      const logo = await loadImage(path.join(__dirname, '..', 'assets', 'images', 'logo.png'));
      const L = 220; // tamaño logo
      ctx.drawImage(logo, W - L - 60, 60, L, L);
    } catch {}

    // Títulos
    ctx.font = 'bold 64px DMSansBold, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 18;
    ctx.textAlign = 'left';
    ctx.fillText(serverName, 70, 120);

    ctx.font = 'bold 40px DMSansBold, sans-serif';
    ctx.fillStyle = '#cfe9f6';
    ctx.fillText(`${host}:${port}`, 70, 170);

    // Estado
    ctx.font = 'bold 36px DMSansBold, sans-serif';
    ctx.fillStyle = isUp ? '#4cadd0' : '#ff6b6b';
    ctx.fillText(isUp ? 'Online' : 'Offline', 70, 220);

    // Jugadores + barra
    const barX = 70, barY = 300, barW = W - 140, barH = 30;
    ctx.shadowBlur = 0;

    // pista
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(barX, barY, barW, barH);

    // progreso
    const pct = (max > 0 && isUp) ? Math.min(online / max, 1) : 0;
    ctx.fillStyle = '#4cadd0';
    ctx.fillRect(barX, barY, Math.max(4, Math.floor(barW * pct)), barH);

    // números
    ctx.font = 'bold 44px DMSansBold, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    const playersText = isUp ? `${online} / ${max}` : '— / —';
    ctx.fillText(playersText, W / 2, barY + barH + 60);

    // “gráfico” simple de líneas (opcional)
    ctx.strokeStyle = 'rgba(76,173,208,0.4)';
    ctx.lineWidth = 2;
    const baseY = barY + 160;
    ctx.beginPath();
    for (let i = 0; i <= 48; i++) {
      const x = 70 + (i * ((W - 140) / 48));
      const y = baseY + Math.sin(i / 2) * 8;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Sello “actualizado”
    ctx.textAlign = 'right';
    ctx.font = 'bold 26px DMSansBold, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    const ts = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    ctx.fillText(`Actualizado ${ts}`, W - 60, H - 54);

    const buffer = canvas.toBuffer('image/png');
    const file = new AttachmentBuilder(buffer, { name: 'server-status.png' });

    // Embed con la imagen
    const embed = new EmbedBuilder()
      .setColor(0x4cadd0) // #4cadd0
      .setTitle('Estado del servidor')
      .setDescription(`\`${host}:${port}\``)
      .setImage('attachment://server-status.png')
      .setFooter({ text: `Solicitado por ${interaction.user.username}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed], files: [file] });
  }
};
