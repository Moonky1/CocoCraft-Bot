const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('suggest')
    .setDescription('Envía una sugerencia')
    .addStringOption(o =>
      o.setName('mensaje').setDescription('Tu sugerencia').setRequired(true)
    ),

  async execute(interaction) {
    // 👇 SIEMPRE AL INICIO
    await interaction.deferReply({ ephemeral: false });
    await interaction.editReply('✅ ¡Sugerencia enviada!');
setTimeout(() => interaction.deleteReply().catch(() => {}), 5000); // 5s

    try {
      const mensaje = interaction.options.getString('mensaje');
      const guild = interaction.guild;
      const canal = guild.channels.cache.get('1399206595128463521'); // #sugerencias

      if (!canal) {
        return await interaction.editReply('❌ No encontré el canal de sugerencias.');
      }

      // Thumb local (opcional)
      const path = require('path');
      const thumb = path.join(__dirname, '..', 'assets', 'images', 'thumb.png');

      const embed = {
        color: 0x4cadd0,
        author: {
          name: `${interaction.user.username}'s suggestion`,
          icon_url: interaction.user.displayAvatarURL({ size: 128 })
        },
        description: mensaje,
        thumbnail: { url: 'attachment://thumb.png' }
      };

      const msg = await canal.send({
        embeds: [embed],
        files: [{ attachment: thumb, name: 'thumb.png' }]
      });

      // Reacciones
      const EMOJI_APPROVE = 'a:check:1403993546901684265';
      const EMOJI_NEUTRAL = 'jum:1403993593579835422';
      const EMOJI_DENY    = 'a:denied:1403993575439728783';

      // Si falla una reacción, que no rompa el flujo
      for (const e of [EMOJI_APPROVE, EMOJI_NEUTRAL, EMOJI_DENY]) {
        msg.react(e).catch(() => {});
      }

      await interaction.editReply('✅ ¡Sugerencia enviada!');

    } catch (err) {
      console.error('suggest error:', err);
      await interaction.editReply('❌ Ocurrió un error al enviar tu sugerencia.');
    }
  }
};