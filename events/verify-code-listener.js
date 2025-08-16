// events/verify-code-listener.js
const { Events, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = (client) => {
  client.on(Events.MessageCreate, async (message) => {
    try {
      // Ignora bots y DMs
      if (message.author.bot || !message.guild) return;

      const VERIFY_CHANNEL_ID = process.env.VERIFY_CHANNEL_ID; // canal donde pegan el código
      const DELETE_DELAY_MS = Number(process.env.VERIFY_DELETE_DELAY_MS || 15000);

      // Solo actuamos en el canal de verificación
      if (!VERIFY_CHANNEL_ID || message.channel.id !== VERIFY_CHANNEL_ID) return;

      // Solo si el mensaje es un "código" (solo dígitos, 3-10)
      const code = message.content.trim();
      if (!/^\d{3,10}$/.test(code)) return;

      // Espera para que DiscordSRV lea el mensaje
      await sleep(DELETE_DELAY_MS);

      // Borra el mensaje si el bot puede hacerlo
      const perms = message.guild.members.me?.permissionsIn(message.channel);
      if (perms?.has(PermissionFlagsBits.ManageMessages) && message.deletable) {
        await message.delete().catch(() => {});
      }

      // Confirma por DM (visible solo para el usuario)
      const embed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('✅ Código recibido')
        .setDescription(
          'Si el código es válido, **DiscordSRV** vinculará tu cuenta y sincronizará tus roles en unos segundos.\n' +
          'Si no pasa nada, usa **/discord link** otra vez y pega el **nuevo** código aquí.\n' +
          'Recuerda tener los **DM abiertos** para este servidor.'
        );

      await message.author.send({ embeds: [embed] });
    } catch (err) {
      // Si tiene los DM cerrados, manda un “pseudo-ephemeral” en canal y bórralo rápido
      try {
        const reply = await message.reply({
          content: `<@${message.author.id}> ✅ Recibí tu código. Abre tus **DM** para ver la confirmación.`,
        });
        setTimeout(() => reply.delete().catch(() => {}), 6000);
      } catch (_) {}
    }
  });
};
