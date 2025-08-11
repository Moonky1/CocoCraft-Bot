// commands/test-boost.js
const { SlashCommandBuilder } = require('discord.js');

const BOOSTS_CHANNEL_ID = process.env.BOOSTS_CHANNEL_ID || '1404007396988289065'; // #boosts
const TICKETS_CHANNEL_ID = process.env.TICKETS_CHANNEL_ID || '1399207405602082816'; // #tickets

module.exports = {
  data: new SlashCommandBuilder()
    .setName('test-boost')
    .setDescription('Simula un boost para previsualizar el mensaje')
    .addUserOption(o =>
      o.setName('miembro')
        .setDescription('Quién “boosteó” (por defecto: tú)')
    )
    .addIntegerOption(o =>
      o.setName('conteo')
        .setDescription('Total de boosts tras el evento')
        .setMinValue(1)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const newMember = interaction.options.getUser('miembro') ?? interaction.user;
    const totalBoosts = interaction.options.getInteger('conteo') ?? 1;

    const boostsChannel = interaction.guild.channels.cache.get(BOOSTS_CHANNEL_ID);
    if (!boostsChannel) {
      return interaction.reply({ content: '❌ No encuentro el canal de boosts.', ephemeral: true });
    }

    const content = `**¡Gracias por el boost ${newMember}!** Con este ya sumamos **${totalBoosts}** boosts. Canjea tus premios en <#${TICKETS_CHANNEL_ID}>.`;

    await boostsChannel.send({ content });
    await interaction.reply({ content: '✅ Mensaje de prueba enviado a #boosts.', ephemeral: true });
  }
};
