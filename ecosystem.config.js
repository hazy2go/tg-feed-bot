module.exports = {
  apps: [{
    name: 'tg-feed-bot',
    script: 'index.js',
    cwd: __dirname,
    watch: false,
    autorestart: true,
    max_restarts: 50,
    restart_delay: 5000,
    exp_backoff_restart_delay: 1000,
    env: {
      NODE_ENV: 'production'
    }
  }]
};
