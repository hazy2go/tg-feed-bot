const { fetchTweets } = require('./twitter');
const { fetchRedditPosts } = require('./reddit');
const store = require('./store');

let timer = null;
let checking = false;

function startMonitor(bot) {
  const mins = store.get('checkInterval') || 5;
  schedule(bot, mins);
  setTimeout(() => checkAll(bot), 15 * 1000);
}

function restartMonitor(bot) {
  schedule(bot, store.get('checkInterval') || 5);
}

function schedule(bot, mins) {
  if (timer) clearInterval(timer);
  timer = setInterval(() => checkAll(bot), mins * 60 * 1000);
  console.log(`[monitor] Scheduled every ${mins}m`);
}

async function checkAll(bot) {
  if (checking) { console.log('[monitor] Check already running, skipping'); return; }
  checking = true;
  try {
    const chatId = store.get('chatId');
    if (!chatId) return;
    const topicId = store.get('topicId');

    await checkTwitter(bot, chatId, topicId);
    await checkReddit(bot, chatId, topicId);

    console.log(`[monitor] Check done @ ${new Date().toISOString()}`);
  } finally {
    checking = false;
  }
}

// ── Twitter ─────────────────────────────────────────────────

async function checkTwitter(bot, chatId, topicId) {
  const accounts = store.get('twitter') || {};

  for (const [handle, info] of Object.entries(accounts)) {
    try {
      const tweets = await fetchTweets(handle);
      if (!tweets.length) continue;

      const seenIds = new Set(info.seenIds || []);

      // First run ever OR migrating from old format (has lastSeen but no seenIds)
      if (!info.lastSeen || !info.seenIds) {
        tweets.forEach(t => seenIds.add(t.id));
        accounts[handle] = { ...info, lastSeen: tweets[0].id, lastSeenDate: tweets[0].date, seenIds: [...seenIds], lastCheck: now() };
        store.set('twitter', accounts);
        console.log(`[twitter] @${handle} — baseline set`);
        continue;
      }

      const fresh = tweets.filter(t =>
        !seenIds.has(t.id) &&
        !t.isRetweet &&
        !t.isThreadReply
      );
      fresh.forEach(t => seenIds.add(t.id));
      // Keep only the last 100 IDs to avoid unbounded growth
      const seenArr = [...seenIds].slice(-100);
      accounts[handle] = { ...info, lastSeen: tweets[0].id, lastSeenDate: tweets[0].date, seenIds: seenArr, lastCheck: now() };
      store.set('twitter', accounts);

      for (const t of fresh.reverse()) {
        await send(bot, chatId, topicId, fmtTweet(handle, t), tweetButtons(handle, t));
        await sleep(1000);
      }
    } catch (err) {
      console.error(`[twitter] @${handle}:`, err.message);
    }
    await sleep(3000);
  }
}

// ── Reddit ──────────────────────────────────────────────────

async function checkReddit(bot, chatId, topicId) {
  const accounts = store.get('reddit') || {};

  for (const [name, info] of Object.entries(accounts)) {
    try {
      const posts = await fetchRedditPosts(name, info.type);
      if (!posts.length) continue;

      const seenIds = new Set(info.seenIds || []);

      if (!info.lastSeen || !info.seenIds) {
        posts.forEach(p => seenIds.add(p.id));
        accounts[name] = { ...info, lastSeen: posts[0].id, lastSeenDate: posts[0].date, seenIds: [...seenIds], lastCheck: now() };
        store.set('reddit', accounts);
        console.log(`[reddit] ${name} — baseline set`);
        continue;
      }

      const fresh = posts.filter(p => !seenIds.has(p.id));
      fresh.forEach(p => seenIds.add(p.id));
      const seenArr = [...seenIds].slice(-100);
      accounts[name] = { ...info, lastSeen: posts[0].id, lastSeenDate: posts[0].date, seenIds: seenArr, lastCheck: now() };
      store.set('reddit', accounts);

      for (const p of fresh.reverse()) {
        await sendRedditPost(bot, chatId, topicId, name, info.type, p);
        await sleep(1000);
      }
    } catch (err) {
      console.error(`[reddit] ${name}:`, err.message);
    }
  }
}

// ── Push latest (ignores baseline) ─────────────────────────

async function pushLatest(bot, count = 3) {
  const chatId = store.get('chatId');
  if (!chatId) return 'No chat set — use /here first';
  const topicId = store.get('topicId');
  let sent = 0;

  for (const handle of Object.keys(store.get('twitter') || {})) {
    try {
      const tweets = await fetchTweets(handle);
      const original = tweets.filter(t => !t.isRetweet && !t.isThreadReply);
      for (const t of original.slice(0, count)) {
        await send(bot, chatId, topicId, fmtTweet(handle, t), tweetButtons(handle, t));
        sent++;
        await sleep(1000);
      }
    } catch (err) {
      console.error(`[latest] @${handle}:`, err.message);
    }
    await sleep(3000);
  }

  for (const [name, info] of Object.entries(store.get('reddit') || {})) {
    try {
      const posts = await fetchRedditPosts(name, info.type);
      for (const p of posts.slice(0, count)) {
        await sendRedditPost(bot, chatId, topicId, name, info.type, p);
        sent++;
        await sleep(1000);
      }
    } catch (err) {
      console.error(`[latest] ${name}:`, err.message);
    }
  }

  return `Pushed ${sent} posts`;
}

// ── Message formatting ──────────────────────────────────────

function fmtTweet(handle, t) {
  return (
    `<b>𝕏  @${esc(handle)}</b>\n\n` +
    esc(t.text?.slice(0, 500))
  );
}

function tweetButtons(handle, t) {
  return [[
    { text: 'View Post', url: t.url },
    { text: `@${handle}`, url: `https://x.com/${handle}` },
  ]];
}

function fmtRedditPost(name, type, p) {
  const label = type === 'subreddit' ? `r/${esc(name)}` : `u/${esc(name)}`;
  const sub = p.subreddit ? ` in ${esc(p.subreddit)}` : '';
  const flair = p.flair ? `  [${esc(p.flair)}]` : '';
  const preview = p.text ? '\n' + esc(p.text.slice(0, 300)) + (p.text.length > 300 ? '...' : '') : '';

  return (
    `<b>Reddit  ${label}</b>${sub}${flair}\n\n` +
    `<b>${esc(p.title)}</b>${preview}\n\n` +
    `👍 ${p.score}  💬 ${p.numComments}`
  );
}

function redditButtons(name, type, p) {
  const profileUrl = type === 'subreddit'
    ? `https://reddit.com/r/${name}`
    : `https://reddit.com/user/${name}`;
  const profileLabel = type === 'subreddit' ? `r/${name}` : `u/${name}`;
  return [[
    { text: 'View Post', url: p.url },
    { text: profileLabel, url: profileUrl },
  ]];
}

async function sendRedditPost(bot, chatId, topicId, name, type, p) {
  const msg = fmtRedditPost(name, type, p);
  const buttons = redditButtons(name, type, p);
  if (p.image) {
    await sendPhoto(bot, chatId, topicId, p.image, msg, buttons);
  } else {
    await send(bot, chatId, topicId, msg, buttons);
  }
}

// ── Transport ───────────────────────────────────────────────

async function send(bot, chatId, topicId, text, buttons) {
  const opts = { parse_mode: 'HTML', disable_web_page_preview: false };
  if (topicId) opts.message_thread_id = topicId;
  if (buttons) opts.reply_markup = { inline_keyboard: buttons };
  await bot.sendMessage(chatId, text, opts);
}

async function sendPhoto(bot, chatId, topicId, imageUrl, caption, buttons) {
  try {
    const opts = { parse_mode: 'HTML' };
    if (topicId) opts.message_thread_id = topicId;
    if (buttons) opts.reply_markup = { inline_keyboard: buttons };
    opts.caption = caption.slice(0, 1024);
    await bot.sendPhoto(chatId, imageUrl, opts);
  } catch {
    await send(bot, chatId, topicId, caption, buttons);
  }
}

// ── Utils ───────────────────────────────────────────────────

function esc(s) {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function now() { return new Date().toISOString(); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { startMonitor, restartMonitor, checkAll, pushLatest };
