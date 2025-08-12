const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } = require('discord.js');

const EMBED_COLOR = 0x4cadd0; // tu color guardado

module.exports = {
  data: new SlashCommandBuilder()
    .setName('coco')
    .setDescription('Haz que el bot envíe un mensaje.')
    .addStringOption(o =>
      o.setName('mensaje')
       .setDescription('Texto que dirá el bot')
       .setRequired(true))
    .addChannelOption(o =>
      o.setName('canal')
       .setDescription('Canal donde hablará el bot (por defecto, este mismo)')
       .addChannelTypes(
         ChannelType.GuildText,
         ChannelType.GuildAnnouncement,
         ChannelType.PublicThread,
         ChannelType.PrivateThread
       ))
    .addBooleanOption(o =>
      o.setName('embed')
       .setDescription('Si quieres que lo envíe como embed bonito'))
    // si quieres que solo admins usen esto, descomenta la línea de abajo:
    // .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    ,

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    // (opcional) restringir por roles desde .env
    const allowRoles = (process.env.SPEAK_ROLE_IDS || '')
      .split(',').map(s => s.trim()).filter(Boolean);
    if (allowRoles.length) {
      const has = interaction.member.roles.cache.some(r => allowRoles.includes(r.id));
      if (!has) {
        return interaction.editReply('❌ No tienes permiso para usar este comando.');
      }
    }

    const text   = interaction.options.getString('mensaje', true).slice(0, 2000);
    const target = interaction.options.getChannel('canal') ?? interaction.channel;
    const asEmbed = interaction.options.getBoolean('embed') ?? false;

    // seguridad: evitar que el bot @everyone/@here/roles
    const allowedMentions = { parse: [], users: [], roles: [], repliedUser: false };

    // construir payload
    const payload = asEmbed
      ? {
          embeds: [
            new EmbedBuilder()
              .setColor(EMBED_COLOR)
              .setDescription(text)
          ],
          allowedMentions
        }
      : { content: text, allowedMentions };

    // Intento 1: usar webhook (si hay permisos) para que se vea nombre/avatar del bot
    const client = interaction.client;
    let sent = null;

    const canManageWebhooks = target
      && target.permissionsFor(client.user)?.has(PermissionFlagsBits.ManageWebhooks);

    if (canManageWebhooks && typeof target.fetchWebhooks === 'function') {
      try {
        const existing = await target.fetchWebhooks();
        let hook = existing.find(h => h.owner?.id === client.user.id) // un hook del propio bot
               || existing.find(h => h.name === (process.env.SERVER_NAME || client.user.username));

        if (!hook) {
          hook = await target.createWebhook({
            name: process.env.SERVER_NAME || client.user.username,
            avatar: client.user.displayAvatarURL({ extension: 'png', size: 128 })
          });
        }
        sent = await hook.send(payload);
      } catch (e) {
        // si falla webhook, probamos envío normal
      }
    }

    // Intento 2: envío normal del bot
    if (!sent) {
      try {
        sent = await target.send(payload);
      } catch (e) {
        return interaction.editReply('❌ No pude enviar el mensaje en ese canal.');
      }
    }

    await interaction.editReply(`✅ Enviado como **${client.user.username}** en ${target}.`);
  }
};
