const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verify-embed')
    .setDescription('Publica el embed de verificación en este canal')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const channel = interaction.guild.channels.cache.get(process.env.VERIFY_CHANNEL_ID) || interaction.channel;

    const embed = new EmbedBuilder()
      .setColor(0x00D166)
      .setAuthor({ name: 'Spawn Club', iconURL: interaction.client.user.displayAvatarURL() })
      .setTitle('✅ Verifica tu cuenta')
      .setDescription(
        [
          'Para vincular tu cuenta de **Minecraft** con **Discord** y sincronizar roles:',
          '',
          '1) En **Minecraft** escribe **`/discord link`**.',
          '2) Copia el **código** que te da el servidor (p.ej. `8323`).',
          `3) Pega **solo el número** aquí en <#${process.env.VERIFY_CHANNEL_ID}>.`,
          '',
          'DiscordSRV hará el vínculo y sincronizará tus rangos automáticamente.',
        ].join('\n')
      )
      .addFields(
        { name: '¿Qué gano?', value: 'Tus **rangos del server** se reflejan como **roles en Discord** y recibes el tag de verificado.' },
        { name: '¿Problemas?', value: 'Asegúrate de estar **conectado** al server al pegar el código y no tardes demasiado.' }
      )
      // .setImage('LINK_A_TU_BANNER.png') // opcional
      .setFooter({ text: 'Spawn Club • Verificación' });

    await interaction.deferReply({ ephemeral: true });

    // Publica el embed en el canal definido
    const msg = await channel.send({ embeds: [embed] });

    // Lo pinea para que se quede fijo arriba
    try { await msg.pin(); } catch {}

    await interaction.editReply('✅ Embed publicado y pineado.');
  }
};
