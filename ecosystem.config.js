module.exports = {
  apps: [{
    name: 'byu-library-search',
    script: 'server.js',
    cwd: '/home/hunterlaw/librarysearch',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 8443
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    // Restart strategies
    min_uptime: '10s',
    max_restarts: 10,
    // Performance monitoring
    pmx: true,
    // Auto restart on memory usage
    kill_timeout: 5000,
    // Graceful shutdown
    listen_timeout: 8000,
    // Health check
    health_check_grace_period: 10000
  }]
};