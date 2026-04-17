module.exports = {
  apps: [{
    name: 'roshani-bot',
    script: 'index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '300M',
    restart_delay: 10000, // 10 seconds delay between restarts to avoid spamming
    max_restarts: 20,
    env: {
      NODE_ENV: 'production'
    }
  }]
};
