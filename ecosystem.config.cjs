module.exports = {
  apps: [{
    name: 'flare',
    script: 'node_modules/next/dist/bin/next',
    args: 'start -p 3000',
    cwd: '/home/ubuntu/zip-main',
    user: 'ubuntu',
    env: {
      NODE_ENV: 'production',
    },
    max_memory_restart: '800M',
    exp_backoff_restart_delay: 100,
  }]
};
