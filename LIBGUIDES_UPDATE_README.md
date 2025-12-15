# LibGuides Whitelist Updater

Automatically sync your LibGuides with the search catalog and whitelist.

## Quick Start

### 1. Get API Credentials

1. Go to your LibGuides Admin Panel
2. Navigate to **Admin** > **API** > **Client Credentials**
3. Create a new client or use existing credentials
4. Copy your **Client ID** and **Client Secret**

Or visit: https://ask.springshare.com/libguides/faq/1205

### 2. Setup Environment Variables

```bash
# Copy the example file
cp .env.example .env

# Edit .env and add your credentials
nano .env
```

Add your credentials:
```
LIBGUIDES_SITE_ID=10827
LIBGUIDES_CLIENT_ID=your_actual_client_id
LIBGUIDES_CLIENT_SECRET=your_actual_secret
```

### 3. Run the Updater

```bash
# Make the script executable
chmod +x update-libguides.js

# Run it
node update-libguides.js
```

## What It Does

The script will:
1. ✅ Fetch all published LibGuides from your site
2. ✅ Update `library-resources-database.catalog.json` with guide metadata
3. ✅ Extract all links/assets and update `libguide-assets.catalog.json`
4. ✅ Scan for database references and update `resource-database.whitelist.json`

## Files Updated

- **library-resources-database.catalog.json** - Guide information (names, URLs, descriptions)
- **libguide-assets.catalog.json** - All links from guide pages
- **resource-database.whitelist.json** - Database name whitelist

## Schedule Regular Updates

### Option 1: Cron Job (Linux/Mac)

Run weekly on Mondays at 2 AM:

```bash
crontab -e
```

Add:
```
0 2 * * 1 cd /home/hunterlaw/librarysearch && /usr/bin/node update-libguides.js >> logs/libguides-update.log 2>&1
```

### Option 2: Manual Updates

Run whenever librarians add new guides:

```bash
cd /home/hunterlaw/librarysearch
node update-libguides.js
git add *.json
git commit -m "Update LibGuides catalog $(date +%Y-%m-%d)"
git push
```

### Option 3: GitHub Actions (Automated)

Create `.github/workflows/update-libguides.yml`:

```yaml
name: Update LibGuides

on:
  schedule:
    - cron: '0 2 * * 1'  # Every Monday at 2 AM
  workflow_dispatch:  # Manual trigger

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - name: Update LibGuides
        env:
          LIBGUIDES_CLIENT_ID: ${{ secrets.LIBGUIDES_CLIENT_ID }}
          LIBGUIDES_CLIENT_SECRET: ${{ secrets.LIBGUIDES_CLIENT_SECRET }}
        run: node update-libguides.js
      - name: Commit changes
        run: |
          git config user.name "GitHub Actions"
          git config user.email "actions@github.com"
          git add *.json
          git diff --staged --quiet || git commit -m "Update LibGuides catalog $(date +%Y-%m-%d)"
          git push
```

## Troubleshooting

### "Missing LibGuides API credentials"
- Make sure `.env` file exists with valid credentials
- Or set environment variables: `export LIBGUIDES_CLIENT_ID=xxx`

### "HTTP 401: Unauthorized"
- Check your Client ID and Secret are correct
- Verify credentials are active in LibGuides Admin

### "Rate limited"
- Script includes 100ms delay between guides
- If you have 100+ guides, it may take a few minutes

### "Could not fetch guide/page/box"
- Some guides may have restricted access
- Script continues processing remaining guides

## API Rate Limits

LibGuides API limits:
- **1000 requests per hour**
- **10 requests per second**

The script respects these limits with built-in delays.

## Advanced Usage

### Update Only Specific Files

Edit `update-libguides.js` and comment out functions you don't want to run:

```javascript
// updateLibraryResourcesCatalog(guides);  // Skip this
await updateLibGuideAssetsCatalog(token, guides);
// updateResourceWhitelist(guides);  // Skip this
```

### Filter Guides by Subject

Add filtering before processing:

```javascript
const guides = await fetchGuides(token);
const filtered = guides.filter(g => 
  g.subjects.some(s => s.name.includes('Law'))
);
```

### Export to Different Format

Modify output format in the update functions.

## Getting Help

- LibGuides API docs: https://ask.springshare.com/libguides/faq/785
- Contact your LibApps administrator
- Check logs: `logs/libguides-update.log`
