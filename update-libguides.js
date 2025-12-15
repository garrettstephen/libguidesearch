#!/usr/bin/env node
/**
 * LibGuides Whitelist Updater
 * Fetches guides and assets from LibGuides API and updates whitelist/catalog files
 * 
 * Usage:
 *   node update-libguides.js
 * 
 * Environment variables:
 *   LIBGUIDES_SITE_ID=xxxx     (Your LibGuides site ID)
 *   LIBGUIDES_CLIENT_ID=xxxx   (Your API client ID)
 *   LIBGUIDES_CLIENT_SECRET=xxxx (Your API client secret)
 */

// Load environment variables from .env file
require('dotenv').config();

const https = require('https');
const fs = require('fs');
const path = require('path');

// Configuration
const LIBGUIDES_SITE_ID = process.env.LIBGUIDES_SITE_ID || '10827'; // BYU Law default
const LIBGUIDES_CLIENT_ID = process.env.LIBGUIDES_CLIENT_ID;
const LIBGUIDES_CLIENT_SECRET = process.env.LIBGUIDES_CLIENT_SECRET;
const LIBGUIDES_API_BASE = 'https://lgapi-us.libapps.com/1.2';

// OAuth endpoints use v1.2
const USE_LEGACY_AUTH = false; // Always use OAuth for v1.2

// File paths
const LIBGUIDE_ASSETS_FILE = path.join(__dirname, 'libguide-assets.catalog.json');
const LIBRARY_RESOURCES_FILE = path.join(__dirname, 'library-resources-database.catalog.json');
const RESOURCE_WHITELIST_FILE = path.join(__dirname, 'resource-database.whitelist.json');

// Helper: Make HTTPS GET request
function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve(data);
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    }).on('error', reject);
  });
}

// Get OAuth token
async function getAccessToken() {
  console.log('🔑 Getting OAuth token...');
  const url = `${LIBGUIDES_API_BASE}/oauth/token`;
  const postData = `client_id=${LIBGUIDES_CLIENT_ID}&client_secret=${LIBGUIDES_CLIENT_SECRET}&grant_type=client_credentials`;
  
  return new Promise((resolve, reject) => {
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': postData.length
      }
    };
    
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const response = JSON.parse(data);
            resolve(response.access_token);
          } catch (e) {
            reject(new Error(`Failed to parse OAuth response: ${data}`));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });
    
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// Fetch all guides
async function fetchGuides(token) {
  console.log('📚 Fetching LibGuides...');
  let url;
  let headers = {};
  
  if (USE_LEGACY_AUTH) {
    // Legacy key/hash authentication
    url = `${LIBGUIDES_API_BASE}/guides?site_id=${LIBGUIDES_SITE_ID}&key=${LIBGUIDES_CLIENT_ID}&hash=${LIBGUIDES_CLIENT_SECRET}&status=1&expand=owner`;
  } else {
    // OAuth2 authentication
    url = `${LIBGUIDES_API_BASE}/guides?site_id=${LIBGUIDES_SITE_ID}&status=1&expand=owner`;
    headers = { Authorization: `Bearer ${token}` };
  }
  
  const guides = await httpsGet(url, headers);
  console.log(`   Found ${guides.length} published guides`);
  return guides;
}

// Fetch guide assets (links from all guides)
async function fetchGuideAssets(token, guideId) {
  const url = `${LIBGUIDES_API_BASE}/guides/${guideId}?expand=pages`;
  try {
    const guide = await httpsGet(url, { Authorization: `Bearer ${token}` });
    const assets = [];
    
    if (guide.pages) {
      for (const page of guide.pages) {
        // Fetch page content to get links
        const pageUrl = `${LIBGUIDES_API_BASE}/pages/${page.id}?expand=boxes`;
        try {
          const pageData = await httpsGet(pageUrl, { Authorization: `Bearer ${token}` });
          
          if (pageData.boxes) {
            for (const box of pageData.boxes) {
              // Fetch box content to get links
              const boxUrl = `${LIBGUIDES_API_BASE}/boxes/${box.id}?expand=assets`;
              try {
                const boxData = await httpsGet(boxUrl, { Authorization: `Bearer ${token}` });
                
                if (boxData.assets) {
                  for (const asset of boxData.assets) {
                    if (asset.type === 'link' && asset.url) {
                      assets.push({
                        name: asset.name || asset.title || 'Untitled',
                        url: asset.url,
                        description: asset.description || `LibGuide asset: ${asset.name || 'link'}`,
                        guide: guide.name,
                        subjects: guide.subjects || [],
                        owner: guide.owner?.first_name && guide.owner?.last_name 
                          ? `${guide.owner.last_name}, ${guide.owner.first_name}`
                          : 'Unknown'
                      });
                    }
                  }
                }
              } catch (e) {
                console.warn(`   Warning: Could not fetch box ${box.id}: ${e.message}`);
              }
            }
          }
        } catch (e) {
          console.warn(`   Warning: Could not fetch page ${page.id}: ${e.message}`);
        }
      }
    }
    
    return assets;
  } catch (e) {
    console.warn(`   Warning: Could not fetch guide ${guideId}: ${e.message}`);
    return [];
  }
}

// Update library resources catalog with guides
function updateLibraryResourcesCatalog(guides) {
  console.log('📝 Updating library-resources-database.catalog.json...');
  
  let catalog = [];
  let existingIds = new Set();
  
  try {
    if (fs.existsSync(LIBRARY_RESOURCES_FILE)) {
      const existing = JSON.parse(fs.readFileSync(LIBRARY_RESOURCES_FILE, 'utf8'));
      // Handle both array and object formats
      catalog = Array.isArray(existing) ? existing : Object.values(existing);
      existingIds = new Set(catalog.map(g => g.id).filter(Boolean));
    }
  } catch (e) {
    console.log('   Creating new catalog file');
  }
  
  // Add/update guides
  let added = 0;
  let updated = 0;
  
  for (const guide of guides) {
    const entry = {
      id: guide.id,
      name: guide.name,
      url: guide.url,
      description: guide.description || `LibGuide: ${guide.name}`,
      subjects: (guide.subjects || []).map(s => s.name || s),
      owner: guide.owner?.first_name && guide.owner?.last_name
        ? `${guide.owner.last_name}, ${guide.owner.first_name}`
        : 'Unknown',
      updated: guide.updated || new Date().toISOString().split('T')[0],
      isLocalGuide: true
    };
    
    if (existingIds.has(guide.id)) {
      // Update existing guide
      const index = catalog.findIndex(g => g.id === guide.id);
      if (index >= 0) {
        catalog[index] = entry;
        updated++;
      }
    } else {
      // Add new guide
      catalog.push(entry);
      added++;
    }
  }
  
  // Sort by name
  catalog.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  
  fs.writeFileSync(LIBRARY_RESOURCES_FILE, JSON.stringify(catalog, null, 2));
  console.log(`   ✅ Added ${added} new guides, updated ${updated} existing guides (total: ${catalog.length})`);
}

// Update libguide assets catalog
async function updateLibGuideAssetsCatalog(token, guides) {
  console.log('🔗 Updating libguide-assets.catalog.json...');
  
  let catalog = {};
  try {
    if (fs.existsSync(LIBGUIDE_ASSETS_FILE)) {
      catalog = JSON.parse(fs.readFileSync(LIBGUIDE_ASSETS_FILE, 'utf8'));
    }
  } catch (e) {
    console.log('   Creating new catalog file');
  }
  
  let added = 0;
  let updated = 0;
  
  // Fetch assets from each guide (with rate limiting)
  for (let i = 0; i < guides.length; i++) {
    const guide = guides[i];
    console.log(`   Processing guide ${i + 1}/${guides.length}: ${guide.name}`);
    
    const assets = await fetchGuideAssets(token, guide.id);
    
    for (const asset of assets) {
      const key = (asset.name + '_' + asset.url).toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .substring(0, 100);
      
      const existing = catalog[key];
      
      const entry = {
        name: asset.name,
        url: asset.url,
        description: asset.description,
        subjects: asset.subjects,
        owner: asset.owner,
        updated: new Date().toISOString().split('T')[0],
        is_pdf: asset.url.toLowerCase().endsWith('.pdf'),
        status: 200,
        isLibGuideAsset: true
      };
      
      if (existing) {
        updated++;
      } else {
        added++;
      }
      
      catalog[key] = entry;
    }
    
    // Rate limiting: wait 100ms between guides
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  fs.writeFileSync(LIBGUIDE_ASSETS_FILE, JSON.stringify(catalog, null, 2));
  console.log(`   ✅ Added ${added} new assets, updated ${updated} existing assets`);
}

// Extract database names from guides and update whitelist
function updateResourceWhitelist(guides) {
  console.log('📋 Updating resource-database.whitelist.json...');
  
  let whitelist = [];
  try {
    if (fs.existsSync(RESOURCE_WHITELIST_FILE)) {
      whitelist = JSON.parse(fs.readFileSync(RESOURCE_WHITELIST_FILE, 'utf8'));
    }
  } catch (e) {
    console.log('   Creating new whitelist file');
  }
  
  // Get existing database names
  const existingNames = new Set(whitelist.map(item => item.name));
  
  // Extract potential database names from guide descriptions and subjects
  let added = 0;
  
  for (const guide of guides) {
    // Check if guide name looks like a database (common patterns)
    const name = guide.name;
    const desc = guide.description || '';
    
    // Look for database-like patterns in names
    const isDatabaseGuide = 
      name.match(/\b(database|databases|index|indexes|collection)\b/i) ||
      name.match(/\b(westlaw|lexis|bloomberg|heinonline)\b/i) ||
      desc.match(/\baccess to\b.*\bdatabase/i);
    
    if (isDatabaseGuide && !existingNames.has(name)) {
      whitelist.push({ name: name });
      existingNames.add(name);
      added++;
    }
  }
  
  // Sort alphabetically
  whitelist.sort((a, b) => a.name.localeCompare(b.name));
  
  fs.writeFileSync(RESOURCE_WHITELIST_FILE, JSON.stringify(whitelist, null, 2));
  console.log(`   ✅ Added ${added} new database entries (total: ${whitelist.length})`);
}

// Main execution
async function main() {
  console.log('🚀 LibGuides Whitelist Updater\n');
  
  // Check for required credentials
  if (!LIBGUIDES_CLIENT_ID || !LIBGUIDES_CLIENT_SECRET) {
    console.error('❌ Error: Missing LibGuides API credentials');
    console.error('Please set environment variables:');
    console.error('  LIBGUIDES_CLIENT_ID (or API key)');
    console.error('  LIBGUIDES_CLIENT_SECRET (or API hash)');
    console.error('\nOr edit .env file with your credentials');
    process.exit(1);
  }
  
  try {
    let token = null;
    
    // Get OAuth token only if using OAuth (not legacy key/hash)
    if (!USE_LEGACY_AUTH) {
      token = await getAccessToken();
    } else {
      console.log('🔑 Using legacy key/hash authentication');
    }
    
    // Fetch all guides
    const guides = await fetchGuides(token);
    
    // Update catalogs and whitelist
    updateLibraryResourcesCatalog(guides);
    await updateLibGuideAssetsCatalog(token, guides);
    updateResourceWhitelist(guides);
    
    console.log('\n✨ All done! Your whitelists and catalogs are up to date.');
    console.log('\nNext steps:');
    console.log('  1. Review the updated files');
    console.log('  2. Commit changes: git add *.json && git commit -m "Update LibGuides catalog"');
    console.log('  3. Restart your search server if needed');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { main, fetchGuides, getAccessToken };
