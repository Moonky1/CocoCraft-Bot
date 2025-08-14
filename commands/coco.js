// commands/coco.js
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');



const PREFER_WEBHOOK = (process.env.COCO_USE_WEBHOOK || '0') === '1';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('coco')
    .setDescription('Habla como el bot.')
    .addStringOption(o =>
      o.setName('mensaje')
        .setDescription('Lo que dirá el bot')
        .setRequired(true))
    .addChannelOption(o =>
      o.setName('canal')
        .setDescription('Canal donde hablar (opcional)')),
  
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const client = interaction.client;
    const text = interaction.options.getString('mensaje', true);
    const target = interaction.options.getChannel('canal') || interaction.channel;

    // Permisos básicos
    const perms = target.permissionsFor(client.user);
    if (!perms?.has(PermissionFlagsBits.SendMessages)) {
      return interaction.editReply('❌ No tengo permiso para enviar mensajes en ese canal.');
    }

    const payload = {
      content: text,
      allowedMentions: { parse: [] }, // evita @everyone/@here por defecto
    };

    // 1) Webhook si está habilitado en .env y hay permiso
    let sent = null;
    if (PREFER_WEBHOOK && perms.has(PermissionFlagsBits.ManageWebhooks) && typeof target.fetchWebhooks === 'function') {
      try {
        const hooks = await target.fetchWebhooks();
        let hook = hooks.find(h => h.owner?.id === client.user.id)
               || hooks.find(h => h.name === (process.env.SERVER_NAME || client.user.username));

        if (!hook) {
          hook = await target.createWebhook({
            name: process.env.SERVER_NAME || client.user.username,
            avatar: client.user.displayAvatarURL({ extension: 'png', size: 128 }),
          });
        }

        sent = await hook.send(payload);
      } catch (_) {
        // si falla, se intenta como mensaje normal
      }
    }

    // 2) Mensaje normal (APP) si no se usó webhook
    if (!sent) {
      await target.send(payload);
    }

    await interaction.editReply('✅ Mensaje enviado.');
  },
};
