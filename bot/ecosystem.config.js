module.exports = {
  apps: [
    {
      name: 'pizza-bot',
      script: 'index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      restart_delay: 10000,
      env: {
        NODE_ENV: 'production',
        OUTLET: 'pizza',
        REDIS_URL: 'rediss://clustercfg.roshani-bot-cache.x2kucy.apse2.cache.amazonaws.com:6379'
      }
    },
    {
      name: 'cake-bot',
      script: 'index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      restart_delay: 10000,
      env: {
        NODE_ENV: 'production',
        OUTLET: 'cake',
        REDIS_URL: 'rediss://clustercfg.roshani-bot-cache.x2kucy.apse2.cache.amazonaws.com:6379'
      }
    }
  ]
};
