#!/bin/bash
# Secure Setup Script for AI Library Search

echo "🔒 Implementing Security Measures..."

# 1. Allow port 3000 only from specific sources
echo "📡 Setting up restricted firewall rules..."

# Allow localhost (for local testing)
sudo ufw allow from 127.0.0.1 to any port 3000 comment 'Local access'

# Allow from your local network (adjust as needed)
sudo ufw allow from 128.187.43.0/24 to any port 3000 comment 'Local network'

# If your WordPress is on a different server, add its IP here:
# sudo ufw allow from YOUR_WORDPRESS_IP to any port 3000 comment 'WordPress server'

echo "✅ Firewall rules updated"

# 2. Generate a random API key
API_KEY=$(openssl rand -hex 32)
echo "🔑 Generated API key: $API_KEY"

# 3. Add API key to .env file
if ! grep -q "API_KEY=" .env 2>/dev/null; then
    echo "API_KEY=$API_KEY" >> .env
    echo "✅ API key added to .env file"
else
    echo "⚠️  API_KEY already exists in .env file"
fi

# 4. Show current firewall status
echo "🛡️  Current firewall rules:"
sudo ufw status numbered

echo ""
echo "🔒 Security Setup Complete!"
echo ""
echo "📋 Next Steps:"
echo "1. Update your WordPress functions.php to include the API key"
echo "2. Restart your Node.js server to load the new API key"
echo "3. Test the restricted access"
echo ""
echo "🔑 Your API Key: $API_KEY"
echo "📁 Saved to: .env file"