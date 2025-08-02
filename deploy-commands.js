// deploy-commands.js
const { REST, Routes } = require('discord.js');
require('dotenv').config();

const commands = [
  require('./commands/user-info.js').data.toJSON(),
  require('./commands/user.js').data.toJSON()
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  await rest.put(
    Routes.applicationGuildCommands(
      process.env.CLIENT_ID,
      process.env.GUILD_ID
    ),
    { body: commands }
  );
  console.log('✅ Comandos registrados');
})();
