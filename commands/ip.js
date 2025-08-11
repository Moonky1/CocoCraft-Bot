// commands/ip.js
const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder }        = require('discord.js');
const { status }              = require('minecraft-server-util');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ip')
    .setDescription('Muestra la IP y el número de jugadores en tiempo real'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: false });

    let online  = '❌';
    let max     = '❌';
    const host  = process.env.MC_HOST || '172.240.1.180';  // tu dominio público
    const port  = parseInt(process.env.MC_PORT) || 25565;     // puerto Java Edition

    try {
      // Hace ping al servidor Java Edition
      const result = await status(host, { port, timeout: 2000 });
      online = result.players.online;
      max    = result.players.max;
    } catch (err) {
      console.error('Error al hacer ping al servidor:', err);
    }

    const embed = new EmbedBuilder()
      .setTitle('🌐 ExoTown Network')
      .setDescription(`\`${host}:${port}\``)
      .addFields(
        { name: '🟢 Jugadores', value: `\`${online}/${max}\``, inline: true }
      )
      .setColor(0x1ABC9C)
      .setFooter({ text: `Solicitado por ${interaction.user.username}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};