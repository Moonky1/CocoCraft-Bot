// commands/verify-embed.js
const {
  SlashCommandBuilder,
  ChannelType,
  EmbedBuilder,
  AttachmentBuilder,
} = require('discord.js');
const path = require('path');
const fs = require('fs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verify-embed')
    .setDescription('Publica el embed de verificación')
    .addSubcommand(sub =>
      sub
        .setName('publicar')
        .setDescription('Publica/actualiza el embed en un canal')
        .addChannelOption(opt =>
          opt
            .setName('canal')
            .setDescription('Canal destino (opcional)')
            .addChannelTypes(ChannelType.GuildText)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub !== 'publicar') return;

    await interaction.deferReply({ ephemeral: true });

    // 1) Elegir canal
    const chosen = interaction.options.getChannel('canal');
    const fallback = interaction.guild.channels.cache.get(process.env.VERIFY_CHANNEL_ID);
    const channel = chosen ?? fallback;

    if (!channel || channel.type !== ChannelType.GuildText) {
      return interaction.editReply('⚠️ `VERIFY_CHANNEL_ID` no apunta a un canal de texto válido.');
    }

    // 2) Adjuntar banner si existe
    const bannerPath = path.join(__dirname, '../assets/verify-banner.png');
    const files = [];
    let imageUrl = null;
    if (fs.existsSync(bannerPath)) {
      files.push(new AttachmentBuilder(bannerPath).setName('verify-banner.png'));
      imageUrl = 'attachment://verify-banner.png';
    }

    // 3) Construir embed (texto re-escrito)
    const canalMencion = `<#${channel.id}>`;

    const embed = new EmbedBuilder()
      .setColor(0x00ff7f)
      .setTitle('✅ Verificación de rangos')
      .setDescription(
        [
          '### ¿Cómo me verifico?',
          '• Entra al servidor y escribe **/discord link**.',
          '• Copia el **código** que te entregue el juego (ej. **8323**).',
          `• Vuelve a ${canalMencion} y pega **solo el número**. El bot lo borrará y te dirá si quedó vinculado. ✅`,
          '',
          '### ¿Debo hacerlo por cada modalidad?',
          'Sí. Manejamos rangos por **modalidad**, así que la verificación es por cada modo donde quieras sincronizar tus roles.',
          '',
          '### ¿Qué gano al verificar?',
          'Se sincronizan automáticamente los rangos/compras que tengas en el server con tus **roles de Discord**, y obtienes tag de **verificado**.',
          '',
          '### ¿Ya estaba vinculado?',
          'Si compraste rangos nuevos o recibiste boosters, vuelve a verificar para actualizar tus roles.',
        ].join('\n')
      )
      .setFooter({ text: 'Spawn Club' });

    if (imageUrl) embed.setImage(imageUrl);

    // 4) Publicar
    await channel.send({ embeds: [embed], files });
    await interaction.editReply(`✅ Embed publicado en ${canalMencion}.`);
  },
};
