# GitHub Pages Deployment Guide

This guide explains how to deploy the AI Law Library Search to GitHub Pages and configure it to work with your existing server infrastructure.

## Overview

This repository contains multiple deployment options:

1. **Production Version** (`index.html`) - Connects to your live server at `128.187.43.25:8443`
2. **Demo Version** (`demo.html`) - Standalone demo with sample data for GitHub Pages
3. **Full Server Code** - Complete Node.js backend for self-hosting

## GitHub Pages Setup

### Step 1: Repository Preparation

1. **Fork or Upload to GitHub**
   ```bash
   # If you have git initialized locally:
   git init
   git add .
   git commit -m "Initial commit: AI Law Library Search"
   git remote add origin https://github.com/garrettstephen/libguidesearch.git
   git branch -M main
   git push -u origin main
   ```

2. **Repository Structure for GitHub Pages**
   ```
   /
   ├── index.html          # Main page (connects to your server)
   ├── demo.html          # Demo version (standalone)
   ├── config.js          # Configuration options
   ├── README.md          # Project documentation
   ├── server.js          # Backend server code (for reference)
   ├── *.catalog.json     # Resource databases
   └── docs/              # Additional documentation
   ```

### Step 2: Enable GitHub Pages

1. Go to your repository settings: `https://github.com/garrettstephen/libguidesearch/settings`
2. Scroll to "Pages" section
3. Under "Source", select "Deploy from a branch"
4. Choose "main" branch and "/ (root)" folder
5. Click "Save"

Your site will be available at: `https://garrettstephen.github.io/libguidesearch/`

### Step 3: Configuration Options

#### Option A: Connect to Your Production Server

Edit `index.html` line 290-292:
```javascript
const API_BASE = 'https://128.187.43.25:8443'; // Your server
const API_KEY = 'your-actual-api-key-here';    // Your API key
```

**Requirements:**
- Your server must allow CORS from GitHub Pages domain
- HTTPS certificate must be valid
- API key must be configured

#### Option B: Demo Mode (Recommended for Public GitHub Pages)

Use `demo.html` as your main page by renaming:
```bash
mv index.html index-production.html
mv demo.html index.html
```

This provides a working demo without exposing API keys.

#### Option C: Client-Side Only (Advanced)

For advanced users wanting to bypass the server entirely, you can modify the code to make direct calls to Google's Gemini API. **Note: This exposes your API key publicly and is not recommended.**

### Step 4: CORS Configuration

If using the production server, update your `server.js` CORS settings:

```javascript
// Add GitHub Pages domain to CORS origins
const corsOptions = {
  origin: [
    'https://your-wordpress-site.com',
    'https://garrettstephen.github.io',  // Add this line
    'https://localhost:3000'
  ],
  credentials: true
};
```

Then restart your server:
```bash
pm2 restart ecosystem.config.js
```

## Customization

### Branding
Edit these sections in `index.html` or `demo.html`:

1. **Title and Description** (lines 6-8):
   ```html
   <title>Your Institution - AI Law Library Search</title>
   <meta name="description" content="Your custom description">
   ```

2. **Header Text** (lines 200-202):
   ```html
   <h1>🏛️ Your Institution Library Search</h1>
   <p>Your custom tagline here</p>
   ```

3. **Footer** (lines 230-234):
   ```html
   <p>
       Powered by Your Institution • 
       <a href="https://github.com/yourusername/yourrepo">GitHub</a>
   </p>
   ```

### Analytics
Uncomment and configure Google Analytics (lines 450-460):
```html
<script async src="https://www.googletagmanager.com/gtag/js?id=YOUR-GA-ID"></script>
<script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'YOUR-GA-ID');
</script>
```

### Colors and Styling
Modify CSS variables (lines 50-60):
```css
.ai-search-container {
  --ais-accent: #your-primary-color;
  --ais-accent-2: #your-secondary-color;
  /* ... other colors ... */
}
```

## Security Considerations

### For Production Version
- ✅ Use HTTPS for your backend server
- ✅ Implement proper API key rotation
- ✅ Monitor for unusual usage patterns
- ✅ Set up rate limiting
- ❌ Never commit API keys to public repositories

### For Demo Version
- ✅ Safe for public repositories
- ✅ No API keys exposed
- ✅ Works entirely client-side
- ℹ️ Limited to sample data

## Deployment Options Comparison

| Feature | Demo Version | Production Version | Self-Hosted |
|---------|--------------|-------------------|-------------|
| GitHub Pages Ready | ✅ Yes | ⚠️ Requires CORS setup | ❌ No |
| Live AI Search | ❌ Sample data only | ✅ Full functionality | ✅ Full functionality |
| API Key Security | ✅ No keys needed | ⚠️ Exposed in client | ✅ Server-side only |
| Maintenance | ✅ None required | ⚠️ Server upkeep needed | ❌ Full server management |
| Cost | ✅ Free | 💰 Server + API costs | 💰💰 Full hosting costs |

## Troubleshooting

### Common Issues

1. **CORS Errors**
   - Add GitHub Pages domain to server CORS whitelist
   - Ensure HTTPS is used for API calls

2. **API Key Issues**
   - Verify API key is correct in `index.html`
   - Check server logs for authentication errors

3. **GitHub Pages Not Updating**
   - Check repository Settings > Pages for build status
   - Wait 5-10 minutes for changes to deploy
   - Clear browser cache

4. **Demo Not Working**
   - Ensure `demo.html` is renamed to `index.html`
   - Check browser console for JavaScript errors

### Testing Locally

Test your GitHub Pages site locally:
```bash
# Using Python
python3 -m http.server 8000

# Using Node.js
npx serve .

# Then visit: http://localhost:8000
```

## Advanced Configuration

### Custom Domain
1. Add `CNAME` file to repository root:
   ```
   yourdomain.com
   ```
2. Configure DNS to point to GitHub Pages
3. Update CORS settings to include your domain

### Multiple Environments
Use different branches for different environments:
- `main` - Production GitHub Pages
- `staging` - Testing version
- `dev` - Development version

Each can have different configurations in `config.js`.

## Support and Maintenance

### Regular Updates
- Monitor your server logs for issues
- Update resource databases periodically
- Review GitHub Pages usage analytics
- Keep API keys secure and rotated

### Getting Help
- Check GitHub Issues for common problems
- Review server logs at `/home/hunterlaw/librarysearch/logs/`
- Test API endpoints manually with tools like Postman

## Next Steps

1. Choose your deployment strategy (Demo vs Production)
2. Configure GitHub Pages
3. Test thoroughly
4. Set up monitoring and analytics
5. Plan for regular maintenance

Your AI Law Library Search will be live and accessible to users worldwide once deployed to GitHub Pages!