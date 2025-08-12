// commands/ip.js
const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder } = require('discord.js');
const mc = require('minecraft-server-util'); // usamos mc.status para compatibilidad

const EMBED_COLOR = 0x4cadd0; // #4cadd0

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ip')
    .setDescription('Muestra la IP y el número de jugadores en tiempo real'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: false });

    const host = process.env.MC_HOST || '172.240.1.180'; // tu dominio/IP
    const port = Number(process.env.MC_PORT) || 25565;   // puerto Java

    let online = '¿?';
    let max    = '¿?';
    let ok     = true;
    let res;

    try {
      // Intento con firma v5+: status(host, { port, ... })
      res = await mc.status(host, { port, enableSRV: true, timeout: 3000 });
    } catch (e1) {
      try {
        // Fallback a firma v4: status(host, port, { ... })
        res = await mc.status(host, port, { timeout: 3000 });
      } catch (e2) {
        ok = false;
        console.error('Error al hacer ping al servidor:', e2);
      }
    }

    if (ok && res) {
      online = res.players?.online ?? '0';
      max    = res.players?.max ?? '0';
    }

    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setTitle('<:coco:1403619212693602424>  CocoCraft')
      .setDescription(`\`${host}:${port}\``)
      .addFields(
        { name: '👥 Jugadores', value: `\`${online}/${max}\``, inline: true },
        ok && res?.version?.name
          ? { name: '🧭 Versión', value: `${res.version.name}`, inline: true }
          : { name: '🧭 Versión', value: 'N/D', inline: true },
        ok
          ? { name: 'Estado', value: '✅ **Online**', inline: true }
          : { name: 'Estado', value: '❌ **Offline**', inline: true },
      )
      .setFooter({ text: `Solicitado por ${interaction.user.username}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
};
