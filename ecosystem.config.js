module.exports = {
  apps: [
    {
      name: 'pizza-bot',
      script: './Pizza-bot/index.js',
      cwd: './Pizza-bot',
      watch: false,
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'cake-bot',
      script: './Cake-bot/index.js',
      cwd: './Cake-bot',
      watch: false,
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
