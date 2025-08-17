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
const { TRANSCRIPT_DIR, PUBLIC_BASE_URL } = require('../helpers/path');
const LOGS_CHANNEL_ID = '1404021560997707856';

// ====== CONFIG ======
const SUPPORT_CATEGORY_ID = '1399207365886345246';
const STAFF_ROLE_ID       = '1146355437696974878';
const PANEL_COLOR         = 0x4cadd0;
const DELETE_DELAY_MS     = 4000;

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

// ---------- helpers ----------
function escapeHtml(s = '') {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

async function fetchAllMessages(channel) {
  const all = [];
  let before;
  while (true) {
    const batch = await channel.messages.fetch({ limit: 100, before }).catch(() => null);
    if (!batch || batch.size === 0) break;
    all.push(...batch.values());
    before = batch.last().id;
    if (batch.size < 100) break;
  }
  all.sort((a,b) => a.createdTimestamp - b.createdTimestamp);
  return all;
}

function memberDisplayColorHex(msg) {
  const hex = msg.member?.displayHexColor;
  return hex && hex !== '#000000' ? hex : '#ffffff';
}
function messageAvatarUrl(msg) {
  return msg.author.displayAvatarURL({ extension: 'png', size: 128 });
}

async function buildHtmlTranscript(channel, closedById) {
  const openerId = channel.topic || 'unknown';
  const createdISO = new Date(channel.createdTimestamp).toISOString();
  const closedISO  = new Date().toISOString();

  const msgs = await fetchAllMessages(channel);
  const items = msgs.map(m => {
    const when = new Date(m.createdTimestamp).toLocaleString();
    const name = escapeHtml(m.member?.displayName || m.author.username);
    const color = memberDisplayColorHex(m);
    const avatar = messageAvatarUrl(m);
    let content = escapeHtml(m.content || '');

    const parts = [];
    if (content) parts.push(`<div class="content">${content}</div>`);

    // Adjuntos
    if (m.attachments?.size) {
      for (const a of m.attachments.values()) {
        const safeName = escapeHtml(a.name || 'archivo');
        parts.push(`<div class="att"><a href="${a.url}" target="_blank" rel="noopener">${safeName}</a></div>`);
        if (a.contentType?.startsWith('image/')) {
          parts.push(`<img class="att-img" src="${a.url}" alt="${safeName}">`);
        }
      }
    }
    if (m.embeds?.length) {
      parts.push(`<div class="embed-note">(${m.embeds.length} embed${m.embeds.length>1?'s':''})</div>`);
    }

    return `
      <div class="msg">
        <img class="ava" src="${avatar}" alt="ava">
        <div class="body">
          <div class="head">
            <span class="name" style="color:${color}">${name}</span>
            <span class="disc">#${m.author.discriminator ?? '0000'}</span>
            <span class="time">${when}</span>
          </div>
          ${parts.join('\n')}
        </div>
      </div>`;
  });

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Transcript ${escapeHtml(channel.name)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
:root{--bg:#0f1115;--panel:#151823;--soft:#1e2230;--text:#e6e9ef;--muted:#9aa4b2;--accent:#4cadd0;}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial}
a{color:#9bd3ff;text-decoration:none} a:hover{text-decoration:underline}
.wrap{max-width:980px;margin:28px auto;padding:0 16px}
.card{background:var(--panel);border:1px solid var(--soft);border-radius:14px;overflow:hidden;box-shadow:0 6px 20px rgba(0,0,0,.25)}
.card .header{padding:16px 18px;border-bottom:1px solid var(--soft);display:flex;gap:16px;align-items:center}
.card .header h1{margin:0;font-size:18px}
.meta{font-size:13px;color:var(--muted)}
.log{padding:10px 0}
.msg{display:flex;gap:12px;padding:12px 16px;border-bottom:1px dashed rgba(255,255,255,.06)}
.msg:last-child{border-bottom:0}
.ava{width:36px;height:36px;border-radius:50%}
.head{display:flex;gap:8px;align-items:baseline}
.name{font-weight:700}
.disc{color:var(--muted);font-size:12px}
.time{color:var(--muted);margin-left:auto;font-size:12px}
.content{white-space:pre-wrap;word-wrap:break-word;margin-top:2px}
.att{margin-top:6px;font-size:13px}
.att-img{display:block;max-width:320px;border-radius:8px;margin-top:6px;border:1px solid var(--soft)}
.embed-note{margin-top:6px;color:var(--muted);font-size:12px}
.footer{padding:14px 16px;background:var(--soft);color:var(--muted);font-size:12px}
.badge{display:inline-block;padding:2px 8px;border-radius:999px;background:var(--accent);color:#06202b;font-weight:700;margin-left:6px}
</style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="header">
        <h1>Transcripción <span class="badge">HTML</span></h1>
        <div class="meta">
          Canal: #${escapeHtml(channel.name)} (${channel.id}) · Parent: ${escapeHtml(channel.parent?.name || 'none')}<br>
          Abierto por: ${openerId !== 'unknown' ? `<a href="https://discord.com/users/${openerId}">${openerId}</a>` : 'unknown'}
          · Creado: ${createdISO}<br>
          Cerrado por: <a href="https://discord.com/users/${closedById}">${closedById}</a> · Cerrado: ${closedISO}
        </div>
      </div>
      <div class="log">
        ${items.join('\n')}
      </div>
      <div class="footer">Generado automáticamente · ${new Date().toLocaleString()}</div>
    </div>
  </div>
</body>
</html>`;
  return { html, openerId };
}

async function closeTicket(interaction) {
  const ch = interaction.channel;
  if (!ch || ch.type !== ChannelType.GuildText || ch.parentId !== SUPPORT_CATEGORY_ID) {
    return interaction.reply({ content: '❌ Este comando solo funciona dentro de un ticket.', ephemeral: true });
  }
  const isStaff = interaction.member.roles.cache.has(STAFF_ROLE_ID);
  const isOpener = ch.topic && interaction.user.id === ch.topic;
  if (!isStaff && !isOpener) {
    return interaction.reply({ content: '❌ Solo el autor del ticket o el staff pueden cerrarlo.', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  let publicUrl = null;
  let openerId  = 'unknown';

  try {
    const { html, openerId: op } = await buildHtmlTranscript(ch, interaction.user.id);
    openerId = op || 'unknown';

    fs.mkdirSync(TRANSCRIPT_DIR, { recursive: true });
    const filename = `ticket-${ch.id}-${Date.now()}.html`;
    const filepath = path.join(TRANSCRIPT_DIR, filename);
    fs.writeFileSync(filepath, html, 'utf8');

    if (PUBLIC_BASE_URL) {
      const publicUrl = PUBLIC_BASE_URL
  ? `${PUBLIC_BASE_URL}/transcripts/${filename}`
  : null;

    }
  } catch (e) {
    console.error('transcript build/write error', e);
  }

  // Enviar a logs
  try {
    const logs = interaction.guild.channels.cache.get(LOGS_CHANNEL_ID);
    if (logs) {
      const summary = new EmbedBuilder()
        .setColor(0xfa5252)
        .setTitle('Ticket cerrado')
        .setDescription([
          `**Canal:** ${ch.name} (${ch.id})`,
          `**Autor:** ${openerId !== 'unknown' ? `<@${openerId}>` : 'unknown'}`,
          `**Cerrado por:** ${interaction.user}`,
        ].join('\n'))
        .setTimestamp(new Date());

      const components = publicUrl
        ? [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Transcript ↗').setURL(publicUrl)
          )]
        : [];

      await logs.send({ embeds: [summary], components });
    } else {
      console.warn('LOGS_CHANNEL_ID no encontrado:', LOGS_CHANNEL_ID);
    }
  } catch (e) {
    console.error('logs send error', e);
  }
  
  // Aviso y borrado del canal
  try { await ch.send({ content: '🔒 Este ticket se cerrará en unos segundos…' }); } catch {}
  setTimeout(() => ch.delete('Ticket cerrado'), DELETE_DELAY_MS);

  return interaction.editReply(publicUrl
    ? '✅ Ticket cerrado. Envié a logs el botón **Transcript** con la URL.'
    : '✅ Ticket cerrado. (No hay PUBLIC_BASE_URL, se guardó localmente el HTML)'
  );
}

// ============= comando/handlers =============
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
        '> <a:derecha:1405531964508737548> **Selecciona una categoría para empezar tu ticket**',
        '',
        '_Recuerda, el tiempo estimado de la resolución del ticket dependerá de la categoría y de cada caso._',
      ].join('\n'));

    if (banner?.url) embed.setImage(banner.url);

    // Thumbnail
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
    if (kind === 'close') return closeTicket(interaction);

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

    const rowClose = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket:close').setLabel('Cerrar ticket').setStyle(ButtonStyle.Danger)
    );

    await channel.send({
      content: `<@&${STAFF_ROLE_ID}>`,
      embeds: [open],
      components: [rowClose],
      allowedMentions: { roles: [STAFF_ROLE_ID] },
    });

    return interaction.reply({ content: `✅ Ticket creado: ${channel}`, ephemeral: true });
  },
};
