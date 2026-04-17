module.exports = {
  apps: [{
    name: 'roshani-bot',
    script: 'index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '300M',
    restart_delay: 10000, 
    min_uptime: '10s',
    max_restarts: 10,
    env: {
      NODE_ENV: 'production'
    }
  }]
};
