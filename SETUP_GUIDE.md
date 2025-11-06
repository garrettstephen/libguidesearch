# BYU Law Library AI Search - Setup Guide

## Prerequisites

### System Requirements
- **Operating System**: Linux (Ubuntu 20.04+ recommended)
- **Node.js**: Version 18 or higher
- **Memory**: Minimum 2GB RAM, 4GB recommended
- **Storage**: 1GB free space for application and logs
- **Network**: Internet access for Google Gemini API

### Required Accounts
- **Google Cloud Account**: For Gemini API access
- **Domain/SSL Certificate**: For HTTPS deployment (recommended)

## Installation Steps

### 1. System Preparation

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Node.js (if not already installed)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version  # Should be v18+
npm --version   # Should be v8+

# Install PM2 for process management
sudo npm install -g pm2

# Install UFW firewall (if not installed)
sudo apt install ufw
```

### 2. Project Setup

```bash
# Create application directory
sudo mkdir -p /opt/byu-library-search
sudo chown $USER:$USER /opt/byu-library-search
cd /opt/byu-library-search

# Clone or copy project files
# (Assuming you have the project files in a directory)
cp -r /path/to/your/project/* .

# Install Node.js dependencies
npm install express cors dotenv helmet
```

### 3. Configuration

#### Create Environment File
```bash
# Create .env file with your configuration
cat > .env << 'EOF'
# Server Configuration
PORT=8443
NODE_ENV=production

# Google Gemini AI Configuration
GEMINI_API_KEY=your_google_gemini_api_key_here
MODEL=gemini-2.0-flash-lite

# Security Configuration
LOCAL_API_KEY=your_secure_api_key_here

# AI Configuration
MAX_ALLOWLIST_SIZE=60
MAX_OUTPUT_TOKENS=4096
EOF

# Secure the environment file
chmod 600 .env
```

#### Configure Google Gemini API
1. Go to [Google AI Studio](https://aistudio.google.com/)
2. Create a new API key
3. Copy the API key to your `.env` file
4. Test the API key:
```bash
# Test Gemini API access
curl -H "Content-Type: application/json" \
     -d '{"contents":[{"parts":[{"text":"Hello"}]}]}' \
     "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=YOUR_API_KEY"
```

### 4. SSL Certificate Setup (Recommended)

#### Option A: Let's Encrypt (Automated)
```bash
# Install Certbot
sudo apt install certbot

# Generate certificate (replace with your domain)
sudo certbot certonly --standalone -d your-domain.com

# Copy certificates to project directory
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem ssl/
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem ssl/
sudo chown $USER:$USER ssl/*
```

#### Option B: Self-Signed Certificate (Development)
```bash
# Create SSL directory
mkdir ssl

# Generate self-signed certificate
openssl req -x509 -newkey rsa:4096 -keyout ssl/key.pem -out ssl/cert.pem -days 365 -nodes \
  -subj "/C=US/ST=Utah/L=Provo/O=BYU Law Library/CN=localhost"
```

### 5. Firewall Configuration

```bash
# Configure UFW firewall
sudo ufw --force reset
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Allow necessary ports
sudo ufw allow 22/tcp      # SSH
sudo ufw allow 80/tcp      # HTTP (for certbot)
sudo ufw allow 443/tcp     # HTTPS
sudo ufw allow 8443/tcp    # Custom HTTPS for our app

# Enable firewall
sudo ufw --force enable

# Check status
sudo ufw status
```

### 6. Process Management Setup

```bash
# The ecosystem.config.js should already exist in your project
# Verify it exists and has correct paths
cat ecosystem.config.js

# Start the application with PM2
pm2 start ecosystem.config.js

# Set up auto-start on system boot
pm2 startup
# Follow the instructions from the command output

# Save current PM2 processes
pm2 save

# Check status
pm2 status
pm2 logs byu-library-search
```

### 7. Testing the Installation

```bash
# Test health endpoint
curl -k https://localhost:8443/health

# Test search endpoint (replace YOUR_API_KEY)
curl -k -H "X-API-Key: YOUR_API_KEY" \
  "https://localhost:8443/search?query=contract%20law"

# Test legal advice detection
curl -k -H "X-API-Key: YOUR_API_KEY" \
  "https://localhost:8443/search?query=should%20I%20sue%20my%20landlord"
```

## WordPress Integration

### 1. Update WordPress Functions.php

Add this code to your theme's `functions.php` file:

```php
<?php
// AI Search WordPress REST API Proxy
function register_ais_endpoints() {
    register_rest_route('ais/v1', '/health', array(
        'methods' => 'GET',
        'callback' => 'ais_health_handler',
        'permission_callback' => '__return_true'
    ));
    
    register_rest_route('ais/v1', '/search', array(
        'methods' => 'GET', 
        'callback' => 'ais_search_handler',
        'permission_callback' => '__return_true'
    ));
}

function ais_health_handler($request) {
    $response = wp_remote_get('https://YOUR_SERVER_IP:8443/health', array(
        'headers' => array('X-API-Key' => 'YOUR_API_KEY'),
        'timeout' => 10,
        'sslverify' => false // Only if using self-signed certificates
    ));
    
    if (is_wp_error($response)) {
        return new WP_Error('server_error', 'Cannot connect to AI search server', array('status' => 500));
    }
    
    return json_decode(wp_remote_retrieve_body($response), true);
}

function ais_search_handler($request) {
    $query = $request->get_param('query');
    $debug = $request->get_param('debug');
    
    if (empty($query)) {
        return new WP_Error('missing_query', 'Query parameter required', array('status' => 400));
    }
    
    $url = 'https://YOUR_SERVER_IP:8443/search?query=' . urlencode($query);
    if ($debug) $url .= '&debug=1';
    
    $response = wp_remote_get($url, array(
        'headers' => array('X-API-Key' => 'YOUR_API_KEY'),
        'timeout' => 60,
        'sslverify' => false // Only if using self-signed certificates
    ));
    
    if (is_wp_error($response)) {
        return new WP_Error('server_error', 'Search server unavailable', array('status' => 500));
    }
    
    return json_decode(wp_remote_retrieve_body($response), true);
}

add_action('rest_api_init', 'register_ais_endpoints');
?>
```

### 2. Add Widget to WordPress Page

1. Edit the page where you want the search widget
2. Add a "Custom HTML" block
3. Copy the contents of `wordpress-proxy-widget.html`
4. Replace `GA_MEASUREMENT_ID` with your Google Analytics ID (if using)
5. Save and publish

## Monitoring and Maintenance

### Log Management

```bash
# View application logs
pm2 logs byu-library-search

# View system logs
sudo tail -f /var/log/syslog

# Set up log rotation for application logs
sudo tee /etc/logrotate.d/byu-library-search << 'EOF'
/opt/byu-library-search/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 644 $USER $USER
    postrotate
        pm2 reload byu-library-search
    endscript
}
EOF
```

### Health Monitoring

```bash
# Create monitoring script
cat > monitor.sh << 'EOF'
#!/bin/bash
# Simple health check script

HEALTH_URL="https://localhost:8443/health"
LOG_FILE="/opt/byu-library-search/health.log"

response=$(curl -k -s -w "%{http_code}" -o /tmp/health_response "$HEALTH_URL")
timestamp=$(date '+%Y-%m-%d %H:%M:%S')

if [ "$response" -eq 200 ]; then
    echo "[$timestamp] Health check OK" >> "$LOG_FILE"
else
    echo "[$timestamp] Health check FAILED (HTTP $response)" >> "$LOG_FILE"
    # Restart service if needed
    pm2 restart byu-library-search
fi
EOF

chmod +x monitor.sh

# Add to crontab for regular checks
(crontab -l 2>/dev/null; echo "*/5 * * * * /opt/byu-library-search/monitor.sh") | crontab -
```

### Performance Monitoring

```bash
# Monitor PM2 processes
pm2 monit

# Check system resources
htop

# Monitor network connections
ss -tlnp | grep :8443

# Check disk usage
df -h /opt/byu-library-search
```

## Security Best Practices

### 1. API Key Management
```bash
# Use strong, unique API keys
openssl rand -base64 32

# Never commit API keys to version control
echo ".env" >> .gitignore

# Regularly rotate API keys (monthly recommended)
```

### 2. System Updates
```bash
# Create update script
cat > update.sh << 'EOF'
#!/bin/bash
# System and application update script

echo "Updating system packages..."
sudo apt update && sudo apt upgrade -y

echo "Updating Node.js packages..."
npm audit fix

echo "Restarting application..."
pm2 restart byu-library-search

echo "Update complete!"
EOF

chmod +x update.sh
```

### 3. Backup Strategy
```bash
# Create backup script
cat > backup.sh << 'EOF'
#!/bin/bash
# Backup application data and configuration

BACKUP_DIR="/backup/byu-library-search"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

# Backup application files and configuration
tar -czf "$BACKUP_DIR/app_$DATE.tar.gz" \
  --exclude="node_modules" \
  --exclude="logs" \
  /opt/byu-library-search/

# Backup PM2 configuration
pm2 save --force
cp /home/$USER/.pm2/dump.pm2 "$BACKUP_DIR/pm2_$DATE.json"

echo "Backup completed: $BACKUP_DIR"
EOF

chmod +x backup.sh

# Schedule weekly backups
(crontab -l 2>/dev/null; echo "0 2 * * 0 /opt/byu-library-search/backup.sh") | crontab -
```

## Troubleshooting

### Common Issues

#### 1. Server Won't Start
```bash
# Check PM2 logs
pm2 logs byu-library-search

# Check if port is in use
sudo ss -tlnp | grep :8443

# Verify environment variables
cat .env

# Test Node.js directly
node server.js
```

#### 2. API Connection Issues
```bash
# Test Gemini API directly
curl -H "Content-Type: application/json" \
     -d '{"contents":[{"parts":[{"text":"test"}]}]}' \
     "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=$GEMINI_API_KEY"

# Check firewall rules
sudo ufw status

# Verify SSL certificates
openssl x509 -in ssl/cert.pem -text -noout
```

#### 3. WordPress Integration Problems
```bash
# Test WordPress endpoints
curl "https://your-wordpress-site.com/wp-json/ais/v1/health"

# Check WordPress error logs
tail -f /path/to/wordpress/wp-content/debug.log

# Verify functions.php syntax
php -l /path/to/theme/functions.php
```

#### 4. Performance Issues
```bash
# Monitor resource usage
pm2 monit

# Check system resources
free -h
df -h

# Analyze slow queries
grep "timeout" logs/combined.log
```

### Getting Help

1. **Check logs first**: `pm2 logs byu-library-search`
2. **Verify configuration**: Ensure `.env` file is correct
3. **Test components individually**: API, server, WordPress integration
4. **Check system resources**: Memory, disk space, network connectivity
5. **Review firewall settings**: Ensure ports are open

## Advanced Configuration

### Load Balancing (Optional)
```bash
# For high-traffic deployments, use nginx as reverse proxy
sudo apt install nginx

# Configure nginx upstream
sudo tee /etc/nginx/sites-available/ais-search << 'EOF'
upstream ais_backend {
    server 127.0.0.1:8443;
    # Add more servers for load balancing
    # server 127.0.0.1:8444;
}

server {
    listen 443 ssl;
    server_name your-domain.com;
    
    ssl_certificate /path/to/ssl/cert.pem;
    ssl_certificate_key /path/to/ssl/key.pem;
    
    location / {
        proxy_pass https://ais_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

# Enable site
sudo ln -s /etc/nginx/sites-available/ais-search /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Database Migration (Optional)
For high-volume deployments, consider migrating from JSON files to a proper database:

```bash
# Install MongoDB
sudo apt install mongodb

# Or PostgreSQL
sudo apt install postgresql postgresql-contrib

# Update application code to use database instead of JSON files
```

This completes the comprehensive setup guide for the BYU Law Library AI Search system. The system should now be fully operational and ready for production use.