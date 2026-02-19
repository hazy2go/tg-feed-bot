const { fetchTweets } = require('./twitter');
const { fetchRedditPosts } = require('./reddit');
const store = require('./store');

let timer = null;

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
  const chatId = store.get('chatId');
  if (!chatId) return;
  const topicId = store.get('topicId');

  await checkTwitter(bot, chatId, topicId);
  await checkReddit(bot, chatId, topicId);

  console.log(`[monitor] Check done @ ${new Date().toISOString()}`);
}

// ── Twitter ─────────────────────────────────────────────────

async function checkTwitter(bot, chatId, topicId) {
  const accounts = store.get('twitter') || {};
  let changed = false;

  for (const [handle, info] of Object.entries(accounts)) {
    try {
      const tweets = await fetchTweets(handle);
      if (!tweets.length) continue;

      if (!info.lastSeen) {
        accounts[handle] = { ...info, lastSeen: tweets[0].id, lastSeenDate: tweets[0].date, lastCheck: now() };
        changed = true;
        console.log(`[twitter] @${handle} — baseline set`);
        continue;
      }

      const cutoff = new Date(info.lastSeenDate || 0);
      const fresh = tweets.filter(t => t.id !== info.lastSeen && new Date(t.date) > cutoff);
      accounts[handle] = { ...info, lastSeen: tweets[0].id, lastSeenDate: tweets[0].date, lastCheck: now() };
      changed = true;

      for (const t of fresh.reverse()) {
        await send(bot, chatId, topicId, fmtTweet(handle, t));
        await sleep(1000);
      }
    } catch (err) {
      console.error(`[twitter] @${handle}:`, err.message);
    }
    await sleep(3000);
  }

  if (changed) store.set('twitter', accounts);
}

// ── Reddit ──────────────────────────────────────────────────

async function checkReddit(bot, chatId, topicId) {
  const accounts = store.get('reddit') || {};
  let changed = false;

  for (const [name, info] of Object.entries(accounts)) {
    try {
      const posts = await fetchRedditPosts(name, info.type);
      if (!posts.length) continue;

      if (!info.lastSeen) {
        accounts[name] = { ...info, lastSeen: posts[0].id, lastSeenDate: posts[0].date, lastCheck: now() };
        changed = true;
        console.log(`[reddit] ${name} — baseline set`);
        continue;
      }

      const cutoff = new Date(info.lastSeenDate || 0);
      const fresh = posts.filter(p => p.id !== info.lastSeen && new Date(p.date) > cutoff);
      accounts[name] = { ...info, lastSeen: posts[0].id, lastSeenDate: posts[0].date, lastCheck: now() };
      changed = true;

      for (const p of fresh.reverse()) {
        await sendRedditPost(bot, chatId, topicId, name, info.type, p);
        await sleep(1000);
      }
    } catch (err) {
      console.error(`[reddit] ${name}:`, err.message);
    }
  }

  if (changed) store.set('reddit', accounts);
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
      for (const t of tweets.slice(0, count)) {
        await send(bot, chatId, topicId, fmtTweet(handle, t));
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
    `${esc(t.text?.slice(0, 500))}\n\n` +
    `<a href="${t.url}">View post</a>`
  );
}

function fmtRedditPost(name, type, p) {
  const label = type === 'subreddit' ? `r/${esc(name)}` : `u/${esc(name)}`;
  const sub = p.subreddit ? ` in ${esc(p.subreddit)}` : '';
  const flair = p.flair ? `  [${esc(p.flair)}]` : '';
  const preview = p.text ? '\n' + esc(p.text.slice(0, 300)) + (p.text.length > 300 ? '...' : '') : '';

  return (
    `<b>Reddit  ${label}</b>${sub}${flair}\n\n` +
    `<b>${esc(p.title)}</b>${preview}\n\n` +
    `👍 ${p.score}  💬 ${p.numComments}\n` +
    `<a href="${p.url}">View post</a>`
  );
}

async function sendRedditPost(bot, chatId, topicId, name, type, p) {
  const msg = fmtRedditPost(name, type, p);
  if (p.image) {
    await sendPhoto(bot, chatId, topicId, p.image, msg);
  } else {
    await send(bot, chatId, topicId, msg);
  }
}

// ── Transport ───────────────────────────────────────────────

async function send(bot, chatId, topicId, text) {
  const opts = { parse_mode: 'HTML', disable_web_page_preview: false };
  if (topicId) opts.message_thread_id = topicId;
  await bot.sendMessage(chatId, text, opts);
}

async function sendPhoto(bot, chatId, topicId, imageUrl, caption) {
  try {
    const opts = { parse_mode: 'HTML' };
    if (topicId) opts.message_thread_id = topicId;
    opts.caption = caption.slice(0, 1024);
    await bot.sendPhoto(chatId, imageUrl, opts);
  } catch {
    await send(bot, chatId, topicId, caption);
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
