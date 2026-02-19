# TG Feed Bot

A lightweight Telegram bot that monitors Twitter/X accounts and Reddit users/subreddits, sending notifications to a group chat or forum topic when new posts appear.

**No paid APIs.** Twitter/X monitoring uses Twitter's public syndication endpoint. Reddit uses the public JSON API. Zero auth tokens needed beyond your Telegram bot token.

## Features

- **Twitter/X monitoring** via `syndication.twitter.com` (free, no API key)
- **Reddit monitoring** via public JSON API (users and subreddits)
- **Forum topic support** — send notifications to a specific topic in a Telegram supergroup
- **Rich Reddit notifications** — thumbnails, scores, comment counts, flair tags
- **Reboot safe** — all config and state persisted to disk with atomic writes
- **PM2 ready** — includes ecosystem config for process management
- **Fully managed via Telegram** — add/remove accounts, change settings, all through bot commands

## Setup

### 1. Create a Telegram Bot

Message [@BotFather](https://t.me/BotFather) on Telegram and create a new bot. Copy the token.

### 2. Get Your Telegram User ID

Message [@userinfobot](https://t.me/userinfobot) to get your numeric user ID. This restricts bot commands to you.

### 3. Install

```bash
git clone https://github.com/YOUR_USERNAME/tg-feed-bot.git
cd tg-feed-bot
npm install
```

### 4. Configure

```bash
cp .env.example .env
```

Edit `.env`:

```env
BOT_TOKEN=your_telegram_bot_token
ADMIN_IDS=your_telegram_user_id
CHECK_INTERVAL=5
```

| Variable | Description |
|---|---|
| `BOT_TOKEN` | Telegram bot token from BotFather |
| `ADMIN_IDS` | Comma-separated Telegram user IDs allowed to control the bot |
| `CHECK_INTERVAL` | Default polling interval in minutes |

### 5. Run

**Direct:**

```bash
node index.js
```

**With PM2 (recommended for servers / Raspberry Pi):**

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # persist across reboots
```

### 6. Set Notification Target

Add the bot to your Telegram group, then send `/here` in the channel or forum topic where you want notifications.

## Commands

### Sources

| Command | Description |
|---|---|
| `/addx handle` | Monitor a Twitter/X account |
| `/rmx handle` | Stop monitoring a Twitter/X account |
| `/addr username` | Monitor a Reddit user |
| `/addr r/subreddit` | Monitor a subreddit |
| `/rmr name` | Stop monitoring a Reddit source |

### Settings

| Command | Description |
|---|---|
| `/here` | Set current chat + topic as notification target |
| `/interval N` | Set check interval in minutes (1–1440) |

### Info & Actions

| Command | Description |
|---|---|
| `/list` | Show all monitored sources |
| `/status` | Show bot status and uptime |
| `/check` | Force an immediate check |
| `/latest N` | Push the last N posts per account (default 3, max 10) |
| `/help` | Show command list |

## How It Works

### Twitter/X

Uses Twitter's public syndication endpoint (`syndication.twitter.com`), which serves embedded timeline data as HTML with JSON payloads. The bot parses the `__NEXT_DATA__` blob to extract tweets. No API key or auth needed.

### Reddit

Fetches from Reddit's public JSON API (`reddit.com/.json`) with a browser-like User-Agent. Returns full post metadata including scores, comments, flair, and preview images.

### State Management

All configuration and "last seen" post IDs are stored in `data/store.json`. Writes are atomic (write to temp file, then rename) to prevent corruption on crashes. On first add, the bot records the latest post as a baseline without sending notifications — only truly new posts trigger alerts.

## Project Structure

```
├── index.js              # Entry point
├── ecosystem.config.js   # PM2 config
├── .env.example          # Environment template
├── package.json
└── src/
    ├── bot.js            # Telegram command handlers
    ├── monitor.js        # Polling loop + notification formatting
    ├── twitter.js        # Twitter/X fetcher (syndication API)
    ├── reddit.js         # Reddit fetcher (JSON API)
    └── store.js          # Persistent JSON storage
```

## Requirements

- Node.js >= 18
- npm

## License

MIT
