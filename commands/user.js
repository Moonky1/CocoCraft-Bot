// commands/user.js
const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder }      = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('user')
    .setDescription('Muestra tu propia información'),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const target = interaction.user;
    const member = interaction.guild.members.cache.get(target.id);

    const embed = new EmbedBuilder()
      .setAuthor({
        name: interaction.guild.name,
        iconURL: interaction.guild.iconURL({ size: 64 })
      })
      .setTitle(`👤 ${target.username}`)
      .setColor(0x00AEFF)
      .setThumbnail(target.displayAvatarURL({ dynamic: true, size: 64 }))
      .addFields(
        {
          name: '📅 Se unió',
          value: member
            ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`
            : 'Desconocido',
          inline: true
        },
        {
          name: '🏷️ Roles',
          value: member
            ? member.roles.cache
                .filter(r => r.id !== interaction.guild.id)
                .map(r => r.name)
                .join(', ') || '—'
            : '—',
          inline: false
        }
      )
      .setFooter({ text: 'CocoCraft | Minecraft Server' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};