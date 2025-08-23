<p align="center">
  <img src="assets/banner-cococraft.png"/>
</p>

<h1 align="center">CocoCraft-Bot</h1>
<p align="center">Bot oficial de CocoCraft — Integración Discord ↔ Minecraft (Towny)</p>

<p align="center">
  <img src="https://img.shields.io/badge/discord.js-v14-4cadd0" />
  <img src="https://img.shields.io/badge/Deploy-Railway-4cadd0" />
  <img src="https://img.shields.io/badge/Status-Production-4cadd0" />
  <img src="https://img.shields.io/badge/License-MIT-4cadd0" />
</p>

---

## ✨ Features
- Verificación MC↔Discord con roles (**Member**, **Unverified**, **Verified**)
- Tickets con panel y transcripts
- Sugerencias `/suggest` con reacciones (✅ ➖ ❌)
- RCON + estado del servidor
- Keep-alive HTTP (Railway)

## 🏗️ Arquitectura
Este repositorio es **público** y contiene documentación, issues y releases.  
El código fuente vive en **`cococraft-bot-core` (privado)**.

## ⚙️ Configuración
Crea un archivo `.env` local a partir de **`.env.example`** (no lo subas):
```env
DISCORD_TOKEN= # definir en Railway/GitHub Secrets
GUILD_ID=1143555184264978533
VERIFY_CHANNEL_ID=1402353911808626799
ROLE_MEMBER=1404003165313040534
ROLE_UNVERIFIED=1406124792070934639
ROLE_VERIFIED=1406241979217612931
MC_HOST=
MC_PORT=25565
RCON_PASSWORD=
PORT=3000
