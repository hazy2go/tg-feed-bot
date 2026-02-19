const TelegramBot = require('node-telegram-bot-api');
const store = require('./store');
const { restartMonitor, checkAll, pushLatest } = require('./monitor');

const ADMIN_IDS = (process.env.ADMIN_IDS || '')
  .split(',')
  .map(id => parseInt(id.trim()))
  .filter(Boolean);

function isAdmin(uid) {
  return ADMIN_IDS.length === 0 || ADMIN_IDS.includes(uid);
}

async function startBot() {
  const token = process.env.BOT_TOKEN;
  if (!token || token === 'your_telegram_bot_token_here') {
    console.error('[bot] BOT_TOKEN not set! Copy .env.example to .env and fill it in.');
    process.exit(1);
  }

  const bot = new TelegramBot(token, { polling: true });
  const me = await bot.getMe();
  console.log(`[bot] Logged in as @${me.username}`);

  // ── Help ──────────────────────────────────────────────

  bot.onText(/\/(start|help)(@\w+)?$/, (msg) => {
    if (!isAdmin(msg.from.id)) return;
    reply(bot, msg, [
      '<b>Feed Bot Commands</b>',
      '',
      '<b>Twitter/X:</b>',
      '/addx handle — Monitor an X account',
      '/rmx handle — Stop monitoring',
      '',
      '<b>Reddit:</b>',
      '/addr name — Monitor user (bare name or u/name)',
      '/addr r/sub — Monitor subreddit',
      '/rmr name — Stop monitoring',
      '',
      '<b>Settings:</b>',
      '/here — Set this chat+topic as notification target',
      '/interval N — Check interval in minutes',
      '',
      '<b>Info:</b>',
      '/list — All monitored sources',
      '/status — Bot status',
      '/check — Force check now',
      '/latest N — Push last N posts per account (default 3)',
    ].join('\n'));
  });

  // ── Twitter: add / remove ─────────────────────────────

  bot.onText(/\/addx(@\w+)?\s+@?(\w+)/, (msg, match) => {
    if (!isAdmin(msg.from.id)) return;
    const handle = match[2].toLowerCase();
    const twitter = store.get('twitter') || {};
    if (twitter[handle]) return reply(bot, msg, `Already monitoring @${handle}`);

    twitter[handle] = { lastSeen: null, lastSeenDate: null, addedAt: new Date().toISOString() };
    store.set('twitter', twitter);
    reply(bot, msg, `Added <b>@${handle}</b> on X`);
  });

  bot.onText(/\/rmx(@\w+)?\s+@?(\w+)/, (msg, match) => {
    if (!isAdmin(msg.from.id)) return;
    const handle = match[2].toLowerCase();
    const twitter = store.get('twitter') || {};
    if (!twitter[handle]) return reply(bot, msg, `Not monitoring @${handle}`);

    delete twitter[handle];
    store.set('twitter', twitter);
    reply(bot, msg, `Removed <b>@${handle}</b>`);
  });

  // ── Reddit: add / remove ──────────────────────────────

  bot.onText(/\/addr(@\w+)?\s+(.+)/, (msg, match) => {
    if (!isAdmin(msg.from.id)) return;
    let input = match[2].trim();
    let type = 'user';

    if (/^\/?r\//.test(input)) {
      type = 'subreddit';
      input = input.replace(/^\/?r\//, '');
    } else {
      input = input.replace(/^\/?u\//, '');
    }

    const name = input.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (!name) return reply(bot, msg, 'Invalid name. Use: /addr username or /addr r/subreddit');

    const reddit = store.get('reddit') || {};
    if (reddit[name]) return reply(bot, msg, `Already monitoring ${name}`);

    reddit[name] = { type, lastSeen: null, lastSeenDate: null, addedAt: new Date().toISOString() };
    store.set('reddit', reddit);
    reply(bot, msg, `Added <b>${type === 'subreddit' ? 'r/' : 'u/'}${name}</b> on Reddit`);
  });

  bot.onText(/\/rmr(@\w+)?\s+(.+)/, (msg, match) => {
    if (!isAdmin(msg.from.id)) return;
    const name = match[2].trim().replace(/^\/?[ru]\//, '').toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const reddit = store.get('reddit') || {};
    if (!reddit[name]) return reply(bot, msg, `Not monitoring ${name}`);

    delete reddit[name];
    store.set('reddit', reddit);
    reply(bot, msg, `Removed <b>${name}</b>`);
  });

  // ── Settings ──────────────────────────────────────────

  bot.onText(/\/here(@\w+)?$/, (msg) => {
    if (!isAdmin(msg.from.id)) return;
    store.set('chatId', msg.chat.id);
    store.set('topicId', msg.message_thread_id || null);
    const topic = msg.message_thread_id ? ` (topic ${msg.message_thread_id})` : '';
    reply(bot, msg, `Notifications will be sent here${topic}`);
  });

  bot.onText(/\/interval(@\w+)?\s+(\d+)/, (msg, match) => {
    if (!isAdmin(msg.from.id)) return;
    const mins = parseInt(match[2]);
    if (mins < 1 || mins > 1440) return reply(bot, msg, 'Must be 1–1440 minutes');

    store.set('checkInterval', mins);
    restartMonitor(bot);
    reply(bot, msg, `Interval set to <b>${mins}</b> minutes`);
  });

  // ── Info ──────────────────────────────────────────────

  bot.onText(/\/list(@\w+)?$/, (msg) => {
    if (!isAdmin(msg.from.id)) return;
    const twitter = store.get('twitter') || {};
    const reddit = store.get('reddit') || {};

    const tList = Object.keys(twitter);
    const rList = Object.keys(reddit);

    reply(bot, msg, [
      '<b>Monitored Sources</b>',
      '',
      '<b>Twitter/X:</b>',
      tList.length ? tList.map(h => `  @${h}`).join('\n') : '  (none)',
      '',
      '<b>Reddit:</b>',
      rList.length ? rList.map(n => `  ${reddit[n].type === 'subreddit' ? 'r/' : 'u/'}${n}`).join('\n') : '  (none)',
    ].join('\n'));
  });

  bot.onText(/\/status(@\w+)?$/, (msg) => {
    if (!isAdmin(msg.from.id)) return;
    const d = store.getAll();
    const up = process.uptime();

    reply(bot, msg, [
      '<b>Bot Status</b>',
      '',
      `Chat: <code>${d.chatId || 'not set'}</code>`,
      `Topic: <code>${d.topicId || 'none'}</code>`,
      `Interval: ${d.checkInterval}m`,
      `X accounts: ${Object.keys(d.twitter || {}).length}`,
      `Reddit sources: ${Object.keys(d.reddit || {}).length}`,
      `Uptime: ${Math.floor(up / 3600)}h ${Math.floor((up % 3600) / 60)}m`,
    ].join('\n'));
  });

  // ── Actions ───────────────────────────────────────────

  bot.onText(/\/check(@\w+)?$/, async (msg) => {
    if (!isAdmin(msg.from.id)) return;
    reply(bot, msg, 'Checking...');
    await checkAll(bot);
    reply(bot, msg, 'Check complete');
  });

  bot.onText(/\/latest(@\w+)?(?:\s+(\d+))?$/, async (msg, match) => {
    if (!isAdmin(msg.from.id)) return;
    const count = Math.min(parseInt(match[2]) || 3, 10);
    reply(bot, msg, `Pushing last ${count} posts per account...`);
    const result = await pushLatest(bot, count);
    reply(bot, msg, result);
  });

  // ── Error handling ────────────────────────────────────

  bot.on('polling_error', (err) => {
    console.error('[bot] Polling error:', err.code || err.message);
  });

  return bot;
}

function reply(bot, msg, text) {
  const opts = { parse_mode: 'HTML', disable_web_page_preview: true };
  if (msg.message_thread_id) opts.message_thread_id = msg.message_thread_id;
  bot.sendMessage(msg.chat.id, text, opts);
}

module.exports = { startBot };
