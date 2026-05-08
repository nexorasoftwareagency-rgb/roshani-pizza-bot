module.exports = {
  apps: [
    {
      name: 'pizza-bot',
      script: 'index.js',
      cwd: './Pizza-bot',
      watch: false,
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'cake-bot',
      script: 'index.js',
      cwd: './Cake-bot',
      watch: false,
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
