// deploy-commands.js  (CommonJS)
require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const TOKEN    = process.env.DISCORD_TOKEN;        // Bot A (principal)
const CLIENTID = process.env.CLIENT_ID;            // App ID del bot
const GUILDID  = process.env.GUILD_ID;             // Guild para registrar (rápido)

if (!TOKEN || !CLIENTID) {
  console.error('Faltan DISCORD_TOKEN o CLIENT_ID en .env');
  process.exit(1);
}

// Carga todos los comandos de /commands/*.js
const commands = [];
const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
  const cmd = require(path.join(commandsPath, file));
  if (cmd?.data) commands.push(cmd.data.toJSON());
}
console.log(`Encontrados ${commands.length} comandos para publicar.`);

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  try {
    if (GUILDID) {
      await rest.put(
        Routes.applicationGuildCommands(CLIENTID, GUILDID),
        { body: commands }
      );
      console.log('✅ Comandos (guild) actualizados.');
    } else {
      await rest.put(
        Routes.applicationCommands(CLIENTID),
        { body: commands }
      );
      console.log('✅ Comandos (global) actualizados.');
    }
  } catch (err) {
    console.error('❌ Error publicando comandos:', err);
  }
})();
