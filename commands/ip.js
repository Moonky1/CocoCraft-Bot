// commands/ip.js
const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder } = require('discord.js');
const { status: mcStatus } = require('minecraft-server-util'); // <-- OJO nombre mcStatus
const path = require('path');

const EMBED_COLOR = 0x4cadd0; // tu color guardado

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ip')
    .setDescription('Muestra la IP de CocoCraft y su estado en tiempo real'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: false });

    // ===== Config (SOLO JAVA) =====
    const host       = (process.env.MC_HOST || '').trim();
    const port       = Number(process.env.MC_PORT)     || 25565; // número
    const timeout    = Number(process.env.MC_TIMEOUT)  || 3000;  // número
    const maxSlots   = Number(process.env.MAX_SLOTS)   || 200;
    const bePort     = Number(process.env.BE_PORT)     || 19132; // solo para mostrar
    const serverName = process.env.SERVER_NAME         || 'CocoCraft';

    // DEBUG: deja esto por ahora para detectar tipos raros
    console.log('[ip] host=%s port=%s(%s) timeout=%s(%s)',
      host, port, typeof port, timeout, typeof timeout);

    if (!host) {
      return interaction.editReply('❌ Falta **MC_HOST** en el `.env`.');
    }
    if (!Number.isInteger(port) || port <= 0) {
      return interaction.editReply('❌ **MC_PORT** inválido.');
    }

    // ===== Ping Java =====
    let isOnline = false;
    let online   = 0;
    let max      = maxSlots;

    try {
      const r = await mcStatus(host, { port, timeout, enableSRV: false });
      isOnline = true;
      online   = r?.players?.online ?? 0;
      max      = r?.players?.max ?? maxSlots;
    } catch (err) {
      console.error('Ping Java falló:', err?.code || err?.message || err, {
        port, tPort: typeof port, timeout, tTimeout: typeof timeout
      });
      isOnline = false; // seguiremos mostrando el embed como offline
    }

    const percent = Math.max(0, Math.min(100, Math.round((online / (max || 1)) * 100)));

    // ===== Embed =====
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setAuthor({ name: `${serverName} | Servidor` })
      .addFields(
        { name: 'IP', value: `\`${host}\``, inline: true },
        { name: 'Bedrock', value: `puerto \`${bePort}\``, inline: true },
      )
      .setDescription(
        isOnline
          ? `🟢 **Online** — \`${online}/${max}\` jugadores (${percent}%)`
          : '🔴 **Offline**'
      )
      .setTimestamp();

    // Thumbnail local (opcional)
    try {
      const thumb = path.join(__dirname, '..', 'assets', 'images', 'thumb.png');
      embed.setThumbnail('attachment://thumb.png');
      await interaction.editReply({ embeds: [embed], files: [{ attachment: thumb, name: 'thumb.png' }] });
    } catch {
      await interaction.editReply({ embeds: [embed] });
    }
  }
};