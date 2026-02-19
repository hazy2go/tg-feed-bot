require('dotenv').config();
const { startBot } = require('./src/bot');
const { startMonitor } = require('./src/monitor');
const store = require('./src/store');

async function main() {
  console.log('[boot] Loading store...');
  store.load();

  console.log('[boot] Starting Telegram bot...');
  const bot = await startBot();

  console.log('[boot] Starting monitor...');
  startMonitor(bot);

  console.log('[boot] Bot is live!');
}

main().catch(err => {
  console.error('[fatal]', err);
  process.exit(1);
});
