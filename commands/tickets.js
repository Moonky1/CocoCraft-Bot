// commands/tickets.js
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  TextInputBuilder,
  TextInputStyle,
  ModalBuilder,
  ChannelType,
  PermissionFlagsBits,
} = require('discord.js');
const path = require('node:path');
const fs   = require('node:fs');

// ====== CONFIG ======
const SUPPORT_CATEGORY_ID = '1399207365886345246';
const STAFF_ROLE_ID       = '1146355437696974878';
const PANEL_COLOR         = 0x4cadd0;

// Emojis animados (IDs provistos)
const EMOJIS = {
  reporte:   { id: '1405529661529653338', animated: true, name: 'reporte'   },
  compras:   { id: '1405529067297574912', animated: true, name: 'cococoins' },
  bugs:      { id: '1405529198264844392', animated: true, name: 'bugs'      },
  apelacion: { id: '1405528646868799558', animated: true, name: 'apelacion' },
  pass:      { id: '1405528738929836184', animated: true, name: 'password'  },
  dudas:     { id: '1405529268997328916', animated: true, name: 'dudas'     },
  booster:   { id: '1405529149208133744', animated: true, name: 'booster3'  },
};

const LABELS = {
  reporte:   'Reporte',
  compras:   'Compras',
  bugs:      'Bugs',
  apelacion: 'Apelación',
  pass:      'Contraseñas',
  dudas:     'Dudas',
  booster:   'Booster',
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket_panel')
    .setDescription('Publica el panel de tickets de Soporte')
    .addAttachmentOption(o =>
      o.setName('banner').setDescription('Imagen del embed (opcional)')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const banner = interaction.options.getAttachment('banner');

    const embed = new EmbedBuilder()
      .setColor(PANEL_COLOR)
      .setTitle('Crea un ticket')
      .setDescription([
        '> **Selecciona una categoría para empezar tu ticket**',
        '',
        '_Tiempo de respuesta estimado: 1–2 horas_',
      ].join('\n'));

    if (banner?.url) embed.setImage(banner.url);

    // Thumbnail desde archivo local: assets/images/logo.gif
    const files = [];
    const localLogoPath = path.resolve(__dirname, '..', 'assets', 'images', 'logo.gif');
    if (fs.existsSync(localLogoPath)) {
      files.push({ attachment: localLogoPath, name: 'logo.gif' });
      embed.setThumbnail('attachment://logo.gif');
    }

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket:reporte').setLabel(LABELS.reporte).setStyle(ButtonStyle.Secondary).setEmoji(EMOJIS.reporte),
      new ButtonBuilder().setCustomId('ticket:compras').setLabel(LABELS.compras).setStyle(ButtonStyle.Secondary).setEmoji(EMOJIS.compras),
      new ButtonBuilder().setCustomId('ticket:bugs').setLabel(LABELS.bugs).setStyle(ButtonStyle.Secondary).setEmoji(EMOJIS.bugs),
      new ButtonBuilder().setCustomId('ticket:apelacion').setLabel(LABELS.apelacion).setStyle(ButtonStyle.Secondary).setEmoji(EMOJIS.apelacion),
      new ButtonBuilder().setCustomId('ticket:pass').setLabel(LABELS.pass).setStyle(ButtonStyle.Secondary).setEmoji(EMOJIS.pass),
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket:dudas').setLabel(LABELS.dudas).setStyle(ButtonStyle.Secondary).setEmoji(EMOJIS.dudas),
      new ButtonBuilder().setCustomId('ticket:booster').setLabel(LABELS.booster).setStyle(ButtonStyle.Secondary).setEmoji(EMOJIS.booster),
    );

    await interaction.reply({ content: '✅ Panel de tickets publicado.', ephemeral: true });

    const payload = { embeds: [embed], components: [row1, row2] };
    if (files.length) payload.files = files;

    await interaction.channel.send(payload);
  },

  async handleButton(interaction) {
    const [, kind] = interaction.customId.split(':');
    const label = LABELS[kind] || 'Soporte';

    const modal = new ModalBuilder()
      .setCustomId(`ticketModal:${kind}`)
      .setTitle(`Crear un ticket de ${label}`);

    const campoNick = new TextInputBuilder()
      .setCustomId('nick')
      .setLabel('¿Cuál es tu nick?')
      .setPlaceholder('Introduce tu nombre de usuario')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const campoModo = new TextInputBuilder()
      .setCustomId('modo')
      .setLabel('¿En qué modalidad?')
      .setPlaceholder('Towny / Survival / Minijuegos / Discord')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const campoDuda = new TextInputBuilder()
      .setCustomId('detalle')
      .setLabel('¿Cuál es tu duda/caso?')
      .setPlaceholder('Describe tu caso. Incluye pruebas o IDs si aplica.')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(campoNick),
      new ActionRowBuilder().addComponents(campoModo),
      new ActionRowBuilder().addComponents(campoDuda),
    );

    await interaction.showModal(modal);
  },

  async handleModal(interaction) {
    const [, kind] = interaction.customId.split(':');
    const label = LABELS[kind] || 'Soporte';

    const nick    = interaction.fields.getTextInputValue('nick').trim();
    const modo    = interaction.fields.getTextInputValue('modo').trim();
    const detalle = interaction.fields.getTextInputValue('detalle').trim();

    const existing = interaction.guild.channels.cache.find(
      ch => ch.parentId === SUPPORT_CATEGORY_ID && ch.topic === interaction.user.id
    );
    if (existing) {
      return interaction.reply({ content: `Ya tienes un ticket abierto: ${existing}`, ephemeral: true });
    }

    const safeUser = interaction.user.username.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 20);
    const name = `🎫・${kind}-${safeUser}`.slice(0, 90);

    const overwrites = [
      { id: interaction.guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
      { id: interaction.user.id, allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.ReadMessageHistory,
        ]},
      { id: STAFF_ROLE_ID, allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
        ]},
    ];

    const channel = await interaction.guild.channels.create({
      name,
      type: ChannelType.GuildText,
      parent: SUPPORT_CATEGORY_ID,
      topic: interaction.user.id,
      permissionOverwrites: overwrites,
      reason: `Ticket ${label} por ${interaction.user.tag}`,
    });

    const open = new EmbedBuilder()
      .setColor(PANEL_COLOR)
      .setTitle(`Ticket • ${label}`)
      .setDescription([
        `**Usuario:** ${interaction.user} (${nick})`,
        `**Modalidad:** ${modo}`,
        '',
        '**Detalle:**',
        detalle,
      ].join('\n'));

    await channel.send({
      content: `<@&${STAFF_ROLE_ID}>`,
      embeds: [open],
      allowedMentions: { roles: [STAFF_ROLE_ID] },
    });

    return interaction.reply({ content: `✅ Ticket creado: ${channel}`, ephemeral: true });
  },
};
