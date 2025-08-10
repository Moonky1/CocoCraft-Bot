// commands/test-boost.js
const { SlashCommandBuilder } = require('discord.js');

const BOOSTS_CHANNEL_ID = process.env.BOOSTS_CHANNEL_ID || '1404007396988289065'; // #boosts
const TICKETS_CHANNEL_ID = process.env.TICKETS_CHANNEL_ID || '1399207405602082816'; // #tickets

module.exports = {
  data: new SlashCommandBuilder()
    .setName('test-boost')
    .setDescription('Simula un boost para previsualizar el mensaje')
    .addUserOption(o =>
      o.setName('usuario')
        .setDescription('Quién “boosteó” (opcional)')
    )
    .addIntegerOption(o =>
      o.setName('conteo')
        .setDescription('Total de boosts después del evento (opcional)')
        .setMinValue(1)
    ),

  async execute(interaction) {
    const user = interaction.options.getUser('usuario') ?? interaction.user;
    const boosts = interaction.options.getInteger('conteo') ?? 22; // número de ejemplo
    const channel = interaction.guild.channels.cache.get(BOOSTS_CHANNEL_ID);

    if (!channel) {
      return interaction.reply({ content: '❌ No encuentro el canal de boosts.', ephemeral: true });
    }

    const content = `🎉 **¡${user} acaba de impulsar el server!** Ya somos **${boosts} boosts**. `
      + `Pasa por <#${TICKETS_CHANNEL_ID}> para reclamar tus recompensas.`;

    await channel.send({ content });
    await interaction.reply({ content: '✅ Mensaje de prueba enviado a #boosts.', ephemeral: true });
  }
};
