/**
 * BYU Law Library AI Search Server
 * 
 * A comprehensive AI-powered search system for legal research resources that combines:
 * - Google Gemini AI for intelligent resource recommendations
 * - BYU Law Library's curated database of 10,330+ legal resources
 * - Local LibGuides and subject guides
 * - Legal help referral system for advice requests
 * - WordPress REST API integration for seamless embedding
 * 
 * SYSTEM ARCHITECTURE:
 * ┌─────────────────────┐    ┌──────────────────────┐    ┌─────────────────────┐
 * │   WordPress Site    │────│  AI Search Server   │────│  Google Gemini AI   │
 * │  (Widget Frontend)  │    │  (Node.js/Express)  │    │   (Resource Rec.)   │
 * └─────────────────────┘    └──────────────────────┘    └─────────────────────┘
 *                                       │
 *                            ┌──────────┴──────────┐
 *                            │  Resource Databases │
 *                            │ • External DBs (299)│
 *                            │ • LibGuides (187)   │
 *                            │ • Assets (9,878)    │
 *                            └─────────────────────┘
 *
 * SECURITY FEATURES:
 * - API key authentication (X-API-Key header required)
 * - Rate limiting (10 requests/minute per IP)
 * - Request logging with privacy protection (hashed IPs)
 * - CORS and Helmet security headers
 * - Legal advice detection and referral system
 *
 * REQUIREMENTS:
 *   - Node.js 18+ (native fetch support)
 *   - npm packages: express, cors, dotenv, helmet
 *   - Google Gemini API key
 *   - SSL certificate for HTTPS (recommended)
 *
 * ENVIRONMENT VARIABLES (.env file):
 *   PORT=8443                          # Server port (8443 for HTTPS)
 *   GEMINI_API_KEY=your_api_key_here  # Google Gemini API key
 *   MODEL=gemini-2.0-flash-lite       # AI model to use
 *   LOCAL_API_KEY=your_local_key      # API key for client authentication
 *   MAX_ALLOWLIST_SIZE=60             # Max resources sent to AI per query
 *   MAX_OUTPUT_TOKENS=4096            # AI response token limit
 */

// ============================================================================
// DEPENDENCIES AND CONFIGURATION
// ============================================================================

const fs = require("node:fs");
const path = require("node:path");
const https = require("https");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const crypto = require("crypto");
require("dotenv").config();



// ============================================================================
// SECURITY: RATE LIMITING & REQUEST LOGGING
// ============================================================================
/**
 * Security layer with rate limiting and privacy-aware logging.
 * - Prevents API abuse with 10 requests/minute limit per IP
 * - Logs requests with hashed IPs for privacy protection
 * - Tracks search queries and results for analytics
 */

// Simple in-memory rate limiting (consider Redis for production with multiple servers)
const rateLimiter = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10;   // 10 requests per minute per IP

// Request logging
const LOG_FILE = path.join(__dirname, "search.log");

function logRequest(ip, query, userAgent, results = 0, error = null) {
  const timestamp = new Date().toISOString();
  const hashedIP = crypto.createHash('md5').update(ip).digest('hex').substring(0,8);
  const logEntry = {
    timestamp,
    hashedIP, // Privacy: log hashed IP instead of real IP
    query: query.substring(0, 200), // Truncate long queries
    userAgent: userAgent ? userAgent.substring(0, 100) : 'unknown',
    results,
    error: error ? error.substring(0, 200) : null
  };
  
  const logLine = JSON.stringify(logEntry) + '\n';
  
  // Async write to avoid blocking
  fs.appendFile(LOG_FILE, logLine, (err) => {
    if (err) console.error('Failed to write to log:', err.message);
  });
}

function checkRateLimit(ip) {
  const now = Date.now();
  const key = ip;
  
  if (!rateLimiter.has(key)) {
    rateLimiter.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - 1 };
  }
  
  const limiter = rateLimiter.get(key);
  
  if (now > limiter.resetTime) {
    // Reset window
    limiter.count = 1;
    limiter.resetTime = now + RATE_LIMIT_WINDOW;
    return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - 1 };
  }
  
  if (limiter.count >= MAX_REQUESTS_PER_WINDOW) {
    return { 
      allowed: false, 
      remaining: 0,
      resetIn: Math.ceil((limiter.resetTime - now) / 1000)
    };
  }
  
  limiter.count++;
  return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - limiter.count };
}

// Cleanup old rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, limiter] of rateLimiter.entries()) {
    if (now > limiter.resetTime + RATE_LIMIT_WINDOW) {
      rateLimiter.delete(key);
    }
  }
}, 5 * 60 * 1000);

function normalize(s) {
  return String(s || "")
    // smart quotes & dashes -> ASCII
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"')
    .replace(/[–—]/g, "-")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[@™©®]/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ============================================================================
// LEGAL ADVICE DETECTION & REFERRAL SYSTEM
// ============================================================================
/**
 * Intelligent detection of legal advice requests vs. research queries.
 * When users ask for legal advice (e.g., "Should I sue?"), the system
 * automatically redirects them to appropriate legal aid organizations
 * rather than providing legal advice (which would be unauthorized practice).
 * 
 * Detection patterns include:
 * - Direct advice requests ("Should I...", "What should I do...")
 * - Personal legal situations ("I'm being sued...", "My landlord...")
 * - Representation requests ("Can you represent me...")
 * - Predictive questions ("Will I win in court...")
 */

function isLegalAdviceRequest(query) {
  const q = query.toLowerCase().trim();
  
  // Enhanced detection based on user testing patterns
  
  // Direct advice/recommendation requests
  if (/(should i|what should i|would you recommend|what would you recommend|tell me what to do|what's the right decision|what would a lawyer say)/i.test(q)) {
    return true;
  }
  
  // Personal legal situations
  if (/(i'm being|i think i'm|my child was|help me with my case|i need legal advice)/i.test(q)) {
    return true;
  }
  
  // Representation requests
  if (/(can you represent|can you file|can you notarize|represent me in court)/i.test(q)) {
    return true;
  }
  
  // Predictive/outcome questions
  if (/(will i win|will i go to jail|will the judge|what are my chances|how much money will i get|will i lose my house)/i.test(q)) {
    return true;
  }
  
  // Legal action questions
  if (/(should i sue|can i sue|do i have a case|is it worth|should i file)/i.test(q)) {
    return true;
  }
  
  // Safety/crisis situations
  if (/(i'm being abused|i think i'm being stalked|what should i do if|is it safe to)/i.test(q)) {
    return true;
  }
  
  // Specific help requests
  return (
    q.includes('divorce help') ||
    q.includes('custody help') ||
    q.includes('legal help') ||
    q.includes('help with divorce') ||
    q.includes('help getting divorced') ||
    q.includes('i need help with my divorce') ||
    q.includes('i want a divorce') ||
    q.includes('help suing') ||
    q.includes('help getting a divorce') ||
    q.includes('i would like a divorce') ||
    q.includes('what\'s the best way to handle') ||
    q.includes('how can i get around') ||
    q.includes('what\'s the best way to hide') ||
    q.includes('can i get disability for') ||
    (q.includes('help') && q.includes('divorce')) ||
    (q.includes('help') && q.includes('lawsuit')) ||
    (q.includes('help') && q.includes('suing')) ||
    (q.includes('i need') && q.includes('divorce')) ||
    (q.includes('how can i win') && (q.includes('case') || q.includes('court'))) ||
    (q.includes('what should i do') && (q.includes('legal') || q.includes('court') || q.includes('lawsuit')))
  );
}

function createLegalHelpResponse() {
  return [
    {
      name: "Utah Legal Services",
      relevanceScore: 95,
      matchReason: "Free legal aid for low-income individuals",
      description: "Provides free civil legal assistance to low-income Utahns in matters including housing, family law, public benefits, and more.",
      url: "https://www.utahlegalservices.org/",
      isLegalHelp: true
    },
    {
      name: "Utah State Bar Pro Bono Program",
      relevanceScore: 95,
      matchReason: "Pro bono attorney referrals",
      description: "Connects individuals who cannot afford legal representation with volunteer attorneys willing to provide free legal services.",
      url: "https://www.utahbar.org/pro-bono/",
      isLegalHelp: true
    },
    {
      name: "Utah State Bar Lawyer Referral Services",
      relevanceScore: 90,
      matchReason: "Paid attorney referral service",
      description: "Helps you find qualified attorneys for legal consultation and representation. Initial consultation fees may apply.",
      url: "https://www.utcourts.gov/en/legal-help/legal-help/finding-legal-help/legal-clinics.html",
      isLegalHelp: true
    },
    {
      name: "Timpanogos Legal Center",
      relevanceScore: 85,
      matchReason: "Local legal clinic in Provo",
      description: "Provides legal services and clinics. Hours: Tuesdays from 5pm-8pm (by appointment only). Location: Health and Justice Building, 1st Floor, 151 S University Avenue, Provo, UT 84601",
      url: "https://www.timplegal.org/legal-services/clinics",
      isLegalHelp: true
    },
    {
      name: "BYU Community Legal Clinic",
      relevanceScore: 90,
      matchReason: "BYU Law School clinic",
      description: "Student-supervised legal clinic providing free legal services. Hours: Thursdays 5pm-7pm (by appointment only). Email: communitylegalclinic@law.byu.edu, Phone: 801-297-7049. Location: 1060 E. Campus Dr. Provo, UT 84604",
      url: "https://law.byu.edu/explore/resources/centers-clinics/community-legal-clinic#1",
      isLegalHelp: true
    }
  ];
}

/* ----------------------------- Local guide search ----------------------- */

function searchLocalGuides(query) {
  const q = normalize(query);
  const qTokens = new Set(q.split(" ").filter(Boolean));
  const scored = [];

  for (const guide of CATALOG_A) {
    if (!guide.name) continue;
    
    const haystack = normalize(`${guide.name} ${guide.description || ""} ${(guide.aliases || []).join(" ")}`);
    const tokens = new Set(haystack.split(" ").filter(Boolean));
    
    let score = 0;
    
    // Exact name match gets high score
    if (normalize(guide.name).includes(q) || q.includes(normalize(guide.name))) {
      score += 10;
      
      // Boost general/topic matches over country-specific ones
      const isCountrySpecific = /\b(afghanistan|bosnia|ghana|[a-z]{2,}\s+(water|law))/i.test(guide.name);
      const isGeneralTopic = !isCountrySpecific && guide.name.toLowerCase().split(" ").length <= 3;
      
      if (isGeneralTopic) {
        score += 20; // Strong boost for general "Water Law" over country-specific variants
      }
    }
    
    // Token overlap scoring
    for (const token of qTokens) {
      if (token.length >= 3 && tokens.has(token)) {
        score += 2;
      }
    }
    
    // Subject/alias bonus
    for (const alias of guide.aliases || []) {
      if (normalize(alias).includes(q) || q.includes(normalize(alias))) {
        score += 5;
      }
    }
    
    if (score > 0) {
      scored.push({
        name: guide.name,
        relevanceScore: Math.min(98, 60 + score * 3), // Cap at 98, higher than LibGuide assets
        matchReason: "BYU Law Library subject guide on this topic",
        url: guide.url,
        description: guide.description || `Research guide for ${guide.name}`,
        isLocalGuide: true
      });
    }
  }
  
  return scored.sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, 5);
}

function searchLibGuideAssets(query) {
  const q = normalize(query);
  const qTokens = new Set(q.split(" ").filter(Boolean));
  const scored = [];

  for (const asset of CATALOG_C) {
    if (!asset.name) continue;
    
    const haystack = normalize(`${asset.name} ${asset.description || ""} ${(asset.subjects || []).join(" ")}`);
    const tokens = new Set(haystack.split(" ").filter(Boolean));
    
    let score = 0;
    
    // Exact name match gets high score
    if (normalize(asset.name).includes(q) || q.includes(normalize(asset.name))) {
      score += 10;
      
      // Boost general/topic matches over country-specific ones
      const isCountrySpecific = /\b(afghanistan|bosnia|ghana|[a-z]{2,}\s+(water|law))/i.test(asset.name);
      const isGeneralTopic = !isCountrySpecific && asset.name.toLowerCase().split(" ").length <= 3;
      
      if (isGeneralTopic) {
        score += 15; // Boost general "Water Law" over "Afghanistan Water Law"
      }
    }
    
    // Token overlap scoring
    for (const token of qTokens) {
      if (token.length >= 3 && tokens.has(token)) {
        score += 2;
      }
    }
    
    // Subject bonus
    for (const subject of asset.subjects || []) {
      if (normalize(subject).includes(q) || q.includes(normalize(subject))) {
        score += 5;
      }
    }
    
    if (score > 0) {
      scored.push({
        name: asset.name,
        relevanceScore: Math.min(90, 50 + score * 3), // Cap at 90, slightly lower than local guides
        matchReason: "LibGuide asset resource",
        url: asset.url,
        description: asset.description || asset.name,
        isLibGuideAsset: true
      });
    }
  }
  
  return scored.sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, 5);
}

/* ----------------------------- Scoring / shortlisting ----------------------- */

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false
}));

// Trust proxy headers for proper IP detection (important for rate limiting)
app.set('trust proxy', true);
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : true,
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'x-api-key'],
  exposedHeaders: ['X-Total-Count'],
  optionsSuccessStatus: 200
}));
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const LOCAL_API_KEY = process.env.LOCAL_API_KEY;
const MODEL = process.env.MODEL || "gemini-2.0-flash-lite";
const ALLOWLIST_SIZE = Number(process.env.ALLOWLIST_SIZE || 60);
const MAX_OUTPUT_TOKENS = Number(process.env.MAX_OUTPUT_TOKENS || 2048);

if (!GEMINI_API_KEY) {
  console.warn("⚠️  GEMINI_API_KEY missing in .env — /search will fail until set.");
}

// Simple API key authentication middleware
function requireApiKey(req, res, next) {
  // Skip authentication for health endpoint and localhost
  if (req.path === '/health' || req.ip === '127.0.0.1' || req.ip === '::1') {
    return next();
  }
  
  if (!LOCAL_API_KEY) {
    console.warn("⚠️  LOCAL_API_KEY not set - API authentication disabled");
    return next();
  }
  
  const providedKey = req.headers['x-api-key'] || req.query.apiKey;
  if (!providedKey || providedKey !== LOCAL_API_KEY) {
    logRequest(req.ip, req.path, req.headers['user-agent'], 0, 'Invalid or missing API key');
    return res.status(401).json({ error: 'Invalid or missing API key' });
  }
  
  next();
}

let RESOLVED_MODEL = null;

const CANDIDATES = [
  process.env.MODEL,            // your env preference first
  "gemini-2.0-flash-lite",     // preferred lightweight model
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-pro",
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b",
].filter(Boolean);

async function firstWorkingModel() {
  // Try known candidates
  for (const m of CANDIDATES) {
    const metaUrl = `https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(m)}?key=${GEMINI_API_KEY}`;
    const r = await fetch(metaUrl);
    if (!r.ok) continue;
    const j = await r.json();
    const methods = j?.supportedGenerationMethods || [];
    if (methods.length === 0 || methods.includes("generateContent")) return m;
  }
  // Fall back to listing what your key can use
  const listUrl = `https://generativelanguage.googleapis.com/v1/models?key=${GEMINI_API_KEY}`;
  const resp = await fetch(listUrl);
  if (resp.ok) {
    const j = await resp.json();
    const arr = j?.models || [];
    const pick =
      arr.find(m => (m.supportedGenerationMethods||[]).includes("generateContent")) ||
      arr[0];
    if (pick?.name) return pick.name;
  }
  throw new Error("No working Gemini model found for your API key");
}

async function getModel() {
  if (!RESOLVED_MODEL) RESOLVED_MODEL = await firstWorkingModel();
  return RESOLVED_MODEL;
}

// ============================================================================
// DATA LOADING: LEGAL RESOURCE CATALOGS & WHITELISTS  
// ============================================================================
/**
 * Loads and manages legal research resource databases:
 * - External databases (Westlaw, Lexis+, Bloomberg Law, etc.)
 * - Local LibGuides (BYU Law subject guides)
 * - LibGuide assets (books, articles, case collections)
 * - Whitelists for AI resource recommendations
 */

function loadJsonSafe(p) {
  try {
    const full = path.resolve(__dirname, p);
    if (!fs.existsSync(full)) {
      console.warn(`⚠️  Missing whitelist file: ${p}`);
      return [];
    }
    const raw = fs.readFileSync(full, "utf8");
    const data = JSON.parse(raw);
    if (!Array.isArray(data) || data.length === 0) {
      console.warn(`⚠️  Whitelist file has 0 items: ${p}`);
    }
    return data;
  } catch (e) {
    console.error(`❌ Failed to load ${p}:`, e.message);
    return [];
  }
}

/* ----------------------------- Catalog load (for URLs & descriptions) ----------------------------- */

function loadCatalogSafe(p) {
  try {
    const full = path.resolve(__dirname, p);
    if (!fs.existsSync(full)) {
      console.warn(`⚠️  Missing catalog file: ${p}`);
      return [];
    }
    const raw = fs.readFileSync(full, "utf8");
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) {
      console.warn(`⚠️  Catalog file is not an array: ${p}`);
      return [];
    }
    return data;
  } catch (e) {
    console.error(`❌ Failed to load catalog ${p}:`, e.message);
    return [];
  }
}

// Load catalog files (enhanced versions with URL and description)
// Load catalogs: A = librarian guides (local), B = external databases (AI whitelist), C = LibGuide assets
const CATALOG_A = loadCatalogSafe("./library-resources-database.catalog.json");  // Local guides
const CATALOG_B = loadCatalogSafe("./resource-database.catalog.json");          // External databases
const CATALOG_C = Object.values(loadJsonSafe("./libguide-assets.catalog.json") || {}); // LibGuide assets

console.log(`📚 Loaded local guides (A): ${CATALOG_A.length} items`);
console.log(`📚 Loaded external databases (B): ${CATALOG_B.length} items`);
console.log(`📚 Loaded LibGuide assets (C): ${CATALOG_C.length} items`);

// Load legal help content
let LEGAL_HELP_CONTENT = "";
try {
  LEGAL_HELP_CONTENT = fs.readFileSync(path.resolve(__dirname, "./legalhelp.txt"), "utf8");
  console.log(`📚 Loaded legal help content: ${LEGAL_HELP_CONTENT.length} characters`);
} catch (e) {
  console.error(`❌ Failed to load legalhelp.txt:`, e.message);
}

// Merge catalogs and index by normalized name and aliases
function indexCatalog(items) {
  const byName = new Map();
  const aliasToName = new Map();

  for (const it of items) {
    if (!it?.name) continue;
    const key = normalize(it.name);
    const existing = byName.get(key) || { name: it.name };
    
    // Merge fields, preferring non-empty values
    if (it.url && it.url.trim()) existing.url = it.url.trim();
    if (it.description && it.description.trim()) existing.description = it.description.trim();
    
    // Preserve type flags - Local guides take precedence over LibGuide assets for general topics
    if (it.isLocalGuide) {
      existing.isLocalGuide = true;
      // Remove other type flags if local guide (curated takes precedence)
      delete existing.isLibGuideAsset;
      delete existing.isExternalDatabase;
    } else if (it.isLibGuideAsset && !existing.isLocalGuide) {
      existing.isLibGuideAsset = true;
      // Remove external database flag if LibGuide asset
      delete existing.isExternalDatabase;
    } else if (it.isExternalDatabase && !existing.isLocalGuide && !existing.isLibGuideAsset) {
      existing.isExternalDatabase = true;
    }
    
    const aliases = new Set([...(existing.aliases || []), ...(it.aliases || [])]);
    if (aliases.size > 0) existing.aliases = [...aliases];
    
    byName.set(key, existing);

    // Index aliases
    for (const a of it.aliases || []) {
      if (a && a.trim()) {
        aliasToName.set(normalize(a), key);
      }
    }
  }

  return { byName, aliasToName };
}

// Order matters: Local guides last to take precedence over LibGuide assets for duplicates
const CATALOG = indexCatalog([...CATALOG_B, ...CATALOG_C, ...CATALOG_A]);

console.log(`📚 Catalog index has ${CATALOG.byName.size} entries`);
console.log(`📚 Sample catalog keys:`, [...CATALOG.byName.keys()].slice(0, 5));

function lookupCatalog(name) {
  if (!name) return null;
  
  const n = normalize(name);
  
  // Direct match by name or alias
  const k = CATALOG.byName.has(n) ? n : (CATALOG.aliasToName.get(n) || null);
  if (k && CATALOG.byName.has(k)) {
    console.log(`🔍 Found direct match for "${name}" -> "${k}"`);
    return CATALOG.byName.get(k);
  }

  // Fuzzy matching - look for partial matches
  for (const [key, val] of CATALOG.byName.entries()) {
    if (!key) continue;
    
    // If either string contains the other and both are at least 4 chars
    if (key.length >= 4 && n.length >= 4) {
      if (n.includes(key) || key.includes(n)) {
        console.log(`🔍 Found fuzzy match for "${name}" -> "${key}"`);
        return val;
      }
    }
    
    // Special case for common variations like "Westlaw Edge" vs "Westlaw"
    const words1 = key.split(" ").filter(Boolean);
    const words2 = n.split(" ").filter(Boolean);
    const commonWords = words1.filter(w => words2.includes(w));
    if (commonWords.length > 0 && commonWords.some(w => w.length >= 4)) {
      console.log(`🔍 Found word match for "${name}" -> "${key}" (common: ${commonWords.join(', ')})`);
      return val;
    }
  }
  
  console.log(`❌ No match found for "${name}" (normalized: "${n}")`);
  return null;
}

// Enrich results with catalog information
function enrichResults(items) {
  console.log(`🔧 Enriching ${items.length} results...`);
  return items.map(r => {
    console.log(`🔧 Processing: "${r.name}"`);
    const info = lookupCatalog(r.name) || {};
    
    // Use catalog description if available, otherwise fall back to matchReason
    const rawDesc = info.description || r.matchReason || "";
    const description = rawDesc.length > 400 ? (rawDesc.slice(0, 380) + "…") : rawDesc;
    
    // Ensure URL has proper protocol
    let url = info.url || "";
    if (url && !/^https?:\/\//i.test(url)) {
      url = "https://" + url;
    }
    
    // Use the catalog's type flags (which already have precedence logic applied)
    // Don't override the search result's type flags, but add missing ones from catalog
    const finalFlags = {};
    
    // Preserve existing flags from search result
    if (r.isLocalGuide) finalFlags.isLocalGuide = true;
    if (r.isLegalHelp) finalFlags.isLegalHelp = true; 
    if (r.isLibGuideAsset) finalFlags.isLibGuideAsset = true;
    
    // Only add catalog flags if no conflicting flags exist
    if (!finalFlags.isLocalGuide && !finalFlags.isLibGuideAsset && info.isLibGuideAsset) {
      finalFlags.isLibGuideAsset = true;
    }
    
    // External database flag (only if no other type flags)
    const isExternalDatabase = !finalFlags.isLocalGuide && !finalFlags.isLegalHelp && !finalFlags.isLibGuideAsset && info.name;
    if (isExternalDatabase) finalFlags.isExternalDatabase = true;

    const result = { 
      ...r, 
      ...finalFlags,
      ...(url ? { url } : {}), 
      ...(description ? { description } : {})
    };
    
    // Debug logging
    const resultType = finalFlags.isExternalDatabase ? 'EXTERNAL DB' : 
                      finalFlags.isLibGuideAsset ? 'LIBGUIDE ASSET' : 
                      finalFlags.isLocalGuide ? 'LOCAL GUIDE' : 'OTHER';
    console.log(`🔧 Result: ${url ? 'HAS URL' : 'NO URL'}, ${info.description ? 'HAS DESC' : 'NO DESC'}, ${resultType}`);
    return result;
  });
}

// Accept either singular or plural filename for the second list
const WL_A = loadJsonSafe("./library-resources-database.whitelist.json");
const WL_B = loadJsonSafe("./resource-database.whitelist.json").length
  ? loadJsonSafe("./resource-database.whitelist.json")
  : loadJsonSafe("./resources-database.whitelist.json");
// Convert LibGuide assets catalog to whitelist format
const WL_C = CATALOG_C.map(item => ({ name: item.name }));

function normalize(s) {
  return String(s || "")
    // smart quotes & dashes -> ASCII
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[@™©®]/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mergeWhitelists(...lists) {
  const map = new Map();
  for (const item of lists.flat()) {
    if (!item || !item.name) continue;
    const key = normalize(item.name);
    const existing = map.get(key);
    const nextAliases = new Set([...(existing?.aliases || []), ...(item.aliases || [])]);
    map.set(key, { name: existing?.name || item.name, aliases: [...nextAliases] });
  }
  return [...map.values()];
}

const WHITELIST = mergeWhitelists(WL_A, WL_B, WL_C);
if (WHITELIST.length === 0) {
  console.warn("⚠️  Merged whitelist is empty. /search will likely return 0 results.");
}

// Quick lookup sets
const exactTokens = new Set();
const aliasTokens = new Set();
for (const it of WHITELIST) {
  exactTokens.add(normalize(it.name));
  for (const a of it.aliases || []) aliasTokens.add(normalize(a));
}

function isWhitelistedLoose(name) {
  const n = normalize(name);
  if (!n) return false;
  if (exactTokens.has(n) || aliasTokens.has(n)) return true;

  const candidates = [...exactTokens, ...aliasTokens];
  for (const c of candidates) {
    if (!c) continue;
    const short = c.length <= n.length ? c : n;
    const long = c.length > n.length ? c : n;
    if (short.length >= 4 && long.includes(short)) return true;
  }
  return false;
}

/* ----------------------- Guide filter / Known platforms ------------------- */

const KNOWN_DATABASES = new Set(
  [
    "HeinOnline","Westlaw","Lexis","LexisNexis","Bloomberg Law","ProQuest",
    "JSTOR","LegalTrac","Index to Legal Periodicals","Oxford Constitutional Law",
    "Max Planck Encyclopedia of Comparative Constitutional Law","Kluwer Arbitration",
    "Wolters Kluwer","VitalLaw","vLex","Making of Modern Law","Foreign Law Guide",
    "LLMC Digital","Dalloz","Beck Online","SSRN","WorldTradeLaw.net","Investor-State LawGuide",
    "Oxford Public International Law","Oxford Law","Oxford Handbooks Online","Cambridge Core",
    "Elgaronline","Brill","Law Journal Library","U.S. Congressional Documents","Nexis Uni",
    "U.S. Supreme Court Records and Briefs","Westlaw Edge","Lexis+"
  ].map(normalize)
);

// Vendors/collections that usually indicate a *platform* (not a subject guide)
const VENDOR_TOKENS = [
  "hein", "westlaw", "lexis", "lexisnexis", "bloomberg", "proquest", "jstor", "legaltrac",
  "kluwer", "vitalLaw", "wolters", "vlex", "brill", "elgar", "oxford", "cambridge", "beck",
  "dalloz", "llmc", "ssrn", "max planck", "iel", "encyclopedia", "encyclopaedia", "handbook",
  "index to legal periodicals", "making of modern law"
].map(normalize);

const GUIDE_PATTERNS = [
  /\bsubject guide\b/i,
  /\bguide\b/i,
  /\bhow[- ]?to\b/i,
  /\boverview\b/i,
  /\bresources\b/i,
  // pure subject names like "Administrative Law", "Business Associations Law"
  // keep vendor/platform names that also end with "Law" (e.g., "Oxford Constitutional Law")
  (name) => {
    const n = normalize(name);
    const endsWithLaw = /\blaw$/.test(n);
    const hasVendorToken = VENDOR_TOKENS.some(t => n.includes(t));
    // reject if ends with "law" and no vendor hint (likely a subject page)
    return endsWithLaw && !hasVendorToken;
  },
  // catch category-ish phrases
  (name) => /\blegal history\b/i.test(name),
  (name) => /\bforeign &? international law\b/i.test(name),
];

function looksLikePlatform(name) {
  const n = normalize(name);
  if (KNOWN_DATABASES.has(n)) return true;
  // vendor hint?
  if (VENDOR_TOKENS.some(t => n.includes(t))) return true;
  // words that strongly imply a platform/collection
  if (/\b(encyclopedia|encyclopaedia|handbook|database|platform|online)\b/i.test(name)) return true;
  return false;
}

function filterGuides(items) {
  return items.filter((it) => {
    if (looksLikePlatform(it.name)) return true;
    // evaluate patterns (strings and functions)
    for (const pat of GUIDE_PATTERNS) {
      if (typeof pat === "function") {
        if (pat(it.name)) return false;
      } else if (pat.test(it.name)) {
        return false;
      }
    }
    return true;
  });
}

/* --------------------------- Scoring / shortlisting ----------------------- */

function scoreAgainstWhitelist(query) {
  const q = normalize(query);
  const qTokens = new Set(q.split(" ").filter(Boolean));
  const scored = [];

  for (const it of WHITELIST) {
    const hay = normalize(`${it.name} ${(it.aliases || []).join(" ")}`);
    const tokens = new Set(hay.split(" ").filter(Boolean));
    let match = 0;
    for (const t of qTokens) if (tokens.has(t)) match++;
    if (hay.includes(q)) match += 2; // mild substring boost
    if (match > 0) {
      scored.push({ name: it.name, score: match });
    }
  }
  return scored.sort((a, b) => b.score - a.score);
}

function shortlistFromCatalog(query, catalog, cap = ALLOWLIST_SIZE) {
  const q = normalize(query);
  const qTokens = new Set(q.split(" ").filter(Boolean));
  const scored = [];

  for (const item of catalog) {
    if (!item.name) continue;
    
    const hay = normalize(`${item.name} ${(item.aliases || []).join(" ")}`);
    const tokens = new Set(hay.split(" ").filter(Boolean));
    
    let match = 0;
    for (const t of qTokens) if (tokens.has(t)) match++;
    if (hay.includes(q)) match += 2; // mild substring boost
    
    if (match > 0) {
      scored.push({ name: item.name, score: match });
    }
  }

  console.log(`🔍 Scoring "${query}" against external databases: found ${scored.length} matches`);

  // If nothing scored, just take the first N names alphabetically to keep prompt small
  if (scored.length === 0) {
    const fallback = catalog.map((it) => it.name).sort((a, b) => a.localeCompare(b));
    console.log(`🔍 No matches, using alphabetical fallback`);
    return fallback.slice(0, cap);
  }
  
  // Dedup names by best score, take top N
  const best = new Map();
  for (const s of scored) {
    const key = normalize(s.name);
    if (!best.has(key) || s.score > best.get(key).score) best.set(key, s);
  }
  const arr = [...best.values()].sort((a, b) => b.score - a.score).slice(0, cap).map((s) => s.name);
  console.log(`🔍 Top external database allowlist:`, arr.slice(0, 5));
  return arr;
}

function shortlistAllowlist(query, cap = ALLOWLIST_SIZE) {
  let scored = scoreAgainstWhitelist(query);
  console.log(`🔍 Scoring for "${query}": found ${scored.length} matches`);
  
  // If nothing scored, just take the first N names alphabetically to keep prompt small
  if (scored.length === 0) {
    const fallback = WHITELIST.map((it) => it.name).sort((a, b) => a.localeCompare(b));
    console.log(`🔍 No matches, using alphabetical fallback`);
    return fallback.slice(0, cap);
  }
  // Dedup names by best score, take top N
  const best = new Map();
  for (const s of scored) {
    const key = normalize(s.name);
    if (!best.has(key) || s.score > best.get(key).score) best.set(key, s);
  }
  const arr = [...best.values()].sort((a, b) => b.score - a.score).slice(0, cap).map((s) => s.name);
  console.log(`🔍 Top allowlist items:`, arr.slice(0, 10));
  return arr;
}

/* ----------------------------- Gemini helpers ---------------------------- */

function buildPrompt(userQuery, allowedList) {
  const allowed = allowedList.join(", ");
  return `
SYSTEM: You are an expert law librarian at BYU Law Library. Recommend ONLY from the allowed list below.

ALLOWED RESOURCES (choose strictly from these; do not invent new names):
${allowed}

TASK: Recommend 3-8 HIGHLY RELEVANT LEGAL RESEARCH RESOURCES that best match the user's query.
- Output ONLY valid JSON (no code fences): an array of objects with exactly:
  - name (string; MUST be exactly from the allowed list above)
  - relevanceScore (1-100; be conservative - only use 70+ for truly relevant resources)
  - matchReason (<=100 chars; why this resource helps answer the query)

QUALITY OVER QUANTITY:
- ONLY include resources that are genuinely helpful for the specific query
- Better to return 3 excellent matches than 12 mediocre ones
- For CASE LAW queries: Prioritize Westlaw, Lexis+, Google Scholar, court databases, legal research platforms
- For STATUTES/CODES: Focus on code databases, government resources, statutory collections  
- For GEOGRAPHIC queries (e.g., "Utah law"): Prioritize resources with that jurisdiction's content
- For SUBJECT-SPECIFIC queries: Match to relevant practice area databases and specialized resources
- For ACADEMIC queries: Include law reviews, academic databases, scholarly resources
- REJECT resources clearly unrelated to the query (e.g., don't suggest international databases for domestic US law)
- VERIFY geographic relevance (e.g., Utah queries should not return Uzbekistan resources)
- If unsure about relevance, DON'T include it

User Query: ${JSON.stringify(userQuery)}
`.trim();
}
async function queryGemini(prompt, wantRaw = false) {
  const model = await getModel();  // <— use resolved model
  const url = `https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(model)}:generateContent?key=${GEMINI_API_KEY}`;

  const payload = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.3,
      topK: 32,
      topP: 0.9,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    },
  };

  // Add timeout to prevent hanging requests
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000); // 45 second timeout

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);

    if (!resp.ok) {
    // if we hit 404 once, re-resolve model and retry once
    if (resp.status === 404) {
      RESOLVED_MODEL = null;
      const retryModel = await getModel();
      const retryUrl = `https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(retryModel)}:generateContent?key=${GEMINI_API_KEY}`;
      const retry = await fetch(retryUrl, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(payload) });
      if (!retry.ok) {
        const t = await retry.text().catch(() => "");
        throw new Error(`Gemini HTTP ${retry.status}: ${t.slice(0, 400)}`);
      }
      const d2 = await retry.json();
      const t2 = d2?.candidates?.[0]?.content?.parts?.map(p => p?.text || "").join("") ?? "[]";
      return wantRaw ? { text: t2, data: d2 } : { text: t2, data: null };
    }
    const t = await resp.text().catch(() => "");
    throw new Error(`Gemini HTTP ${resp.status}: ${t.slice(0, 400)}`);
  }

    const data = await resp.json();
    const text = data?.candidates?.[0]?.content?.parts?.map(p => p?.text || "").join("") ?? "[]";
    return wantRaw ? { text, data } : { text, data: null };
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      throw new Error('AI request timed out - try a simpler query');
    }
    throw error;
  }
}


// --- parse helpers ---

function _normalizeToJsonishArray(text) {
  if (!text) return "";
  let s = String(text).trim();
  // strip fences like ```json ... ```
  s = s.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  // normalize quotes
  s = s.replace(/`/g, '"');
  s = s.replace(/\\'/g, "\uFFF0"); // temp escape
  s = s.replace(/'/g, '"');
  s = s.replace(/\uFFF0/g, "\\'");
  return s;
}

function parseGeminiJsonLoose(text) {
  // Fast path
  const s0 = _normalizeToJsonishArray(text);
  try {
    const direct = JSON.parse(s0);
    if (Array.isArray(direct)) return direct;
  } catch (_) {}

  // Try first [...] block
  const start = s0.indexOf("[");
  const end = s0.lastIndexOf("]");
  const slice = (start !== -1 && end !== -1 && end > start) ? s0.slice(start, end + 1) : s0;

  // Quote unquoted keys + remove trailing commas
  let s = slice
    .replace(/(^|{|,)\s*([A-Za-z_][A-Za-z0-9_\-]*)\s*:/gm, (_, p1, p2) => `${p1} "${p2}":`)
    .replace(/,\s*([}\]])/g, "$1");

  try {
    const arr = JSON.parse(s);
    if (Array.isArray(arr)) return arr;
  } catch (_) {
    // fall through to salvage
  }

  // --- SALVAGE: pull each complete { ... } from within the array, ignoring the tail if truncated ---
  // Find the array body (between first '[' and last ']'), or use full string
  const openIdx = s.indexOf("[");
  const closeIdx = s.lastIndexOf("]");
  const body = (openIdx !== -1 && closeIdx !== -1 && closeIdx > openIdx)
    ? s.slice(openIdx + 1, closeIdx)
    : s;

  const objs = [];
  let i = 0, depth = 0, inStr = false, esc = false, objStart = -1;

  while (i < body.length) {
    const ch = body[i];

    if (inStr) {
      if (esc) {
        esc = false;
      } else if (ch === "\\") {
        esc = true;
      } else if (ch === '"') {
        inStr = false;
      }
      i++;
      continue;
    }

    if (ch === '"') {
      inStr = true;
      i++;
      continue;
    }

    if (ch === "{") {
      if (depth === 0) objStart = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && objStart !== -1) {
        const rawObj = body.slice(objStart, i + 1);
        // Clean individual object and try parsing
        let o = rawObj
          .replace(/(^|{|,)\s*([A-Za-z_][A-Za-z0-9_\-]*)\s*:/gm, (_, p1, p2) => `${p1} "${p2}":`)
          .replace(/,\s*}/g, "}");
        try {
          const parsed = JSON.parse(o);
          objs.push(parsed);
        } catch {
          // ignore bad fragments
        }
        objStart = -1;
      }
    }

    i++;
  }

  return objs; // may be empty, but will include any complete objects before truncation
}

function coerceItem(r) {
  const name = r?.name || r?.platform || r?.database || r?.provider || r?.title || r?.resource || "";
  const score = r?.relevanceScore ?? r?.score ?? r?.rank ?? r?.relevance ?? 0;
  const reason = r?.matchReason || r?.why || r?.reason || r?.notes || "";
  return {
    name: String(name).trim(),
    relevanceScore: Number.isFinite(+score) ? +score : 0,
    matchReason: String(reason).trim(),
  };
}

/* ----------------------------- Fallback logic ---------------------------- */

function fallbackRecommend(query, limit = 12) {
  const scored = scoreAgainstWhitelist(query);
  let results = scored.slice(0, Math.max(limit * 2, 20)).map((s) => ({
    name: s.name,
    relevanceScore: Math.min(100, 50 + s.score * 8),
    matchReason: "Keyword overlap with query.",
  }));
  results = filterGuides(results);

  if (results.length === 0) {
    const COMMON = [
      "HeinOnline","Westlaw","Lexis","Bloomberg Law","LegalTrac",
      "Index to Legal Periodicals","JSTOR","ProQuest","Kluwer Arbitration",
      "Oxford Public International Law","Oxford Constitutional Law","VitalLaw","vLex"
    ];
    for (const n of COMMON) {
      if (isWhitelistedLoose(n)) {
        results.push({
          name: n,
          relevanceScore: 60,
          matchReason: "Core legal research platform for broad queries.",
        });
      }
      if (results.length >= limit) break;
    }
  }

  // De-dupe & cap
  const best = new Map();
  for (const item of results) {
    const key = normalize(item.name);
    const prev = best.get(key);
    if (!prev || item.relevanceScore > prev.relevanceScore) best.set(key, item);
  }
  const fallbackResults = [...best.values()].sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, limit);
  
  // Enrich fallback results with catalog information
  return enrichResults(fallbackResults);
}

/* -------------------------------- Routes -------------------------------- */

app.get("/wordpresspage.html", (req, res) => {
  res.sendFile(path.join(__dirname, "wordpresspage.html"));
});

app.get("/test-legal", (req, res) => {
  const query = req.query.query;
  if (!query) return res.status(400).json({ error: "Missing ?query" });
  
  const isLegal = isLegalAdviceRequest(query);
  const normalized = normalize(query);
  
  res.json({ 
    query, 
    normalized, 
    isLegalAdvice: isLegal,
    response: isLegal ? "Would return legal help" : "Would proceed to AI search"
  });
});

app.get("/health", async (req, res) => {
  let resolved = null;
  try { resolved = await getModel(); } catch {}
  res.json({
    ok: true,
    node: process.version,
    port: PORT,
    model_env: MODEL,
    model_resolved: resolved,
    allowlistSize: ALLOWLIST_SIZE,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    whitelistCounts: { listA: WL_A.length, listB: WL_B.length, listC: WL_C.length, merged: WHITELIST.length },
  });
});

app.get("/test-ai", async (req, res) => {
  try {
    console.log("🧪 Testing AI connection...");
    const modelName = await getModel();
    const url = `https://generativelanguage.googleapis.com/v1/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`;
    const body = {
      contents: [{ parts: [{ text: "Hello, respond with just 'OK' if you can hear me." }] }]
    };
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error?.message || `HTTP ${response.status}`);
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'No response';
    res.json({ 
      ok: true, 
      model: modelName,
      response: text,
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    console.error("🚨 AI test failed:", e.message);
    res.status(502).json({ 
      ok: false, 
      error: e.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get("/models", async (req, res) => {
  try {
    const url = `https://generativelanguage.googleapis.com/v1/models?key=${GEMINI_API_KEY}`;
    const r = await fetch(url);
    const j = await r.json();
    res.json(j);
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
});

/**
 * GET /search?query=...&debug=1&skipWhitelist=1&debug=2
 * - debug=1  -> diagnostics
 * - debug=2  -> diagnostics + compact raw model JSON preview
 * - skipWhitelist=1 -> return parsed Gemini output without whitelist filter
 */
app.get("/search", requireApiKey, async (req, res) => {
  // Rate limiting check
  const clientIP = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';
  const rateCheck = checkRateLimit(clientIP);
  
  if (!rateCheck.allowed) {
    logRequest(clientIP, req.query.query || 'empty', req.headers['user-agent'], 0, `Rate limited - reset in ${rateCheck.resetIn}s`);
    return res.status(429).json({ 
      error: "Too many requests", 
      retryAfter: rateCheck.resetIn,
      message: `Please wait ${rateCheck.resetIn} seconds before trying again`
    });
  }

  const query = req.query.query;
  const debug = Number(req.query.debug || 0);
  const skipWhitelist = req.query.skipWhitelist === "1";

  if (!query || !String(query).trim()) {
    logRequest(clientIP, query || 'empty', req.headers['user-agent'], 0, 'Missing query parameter');
    return res.status(400).json({ error: "Missing ?query" });
  }
  if (!GEMINI_API_KEY) {
    logRequest(clientIP, query, req.headers['user-agent'], 0, 'Server missing GEMINI_API_KEY');
    return res.status(500).json({ error: "Server missing GEMINI_API_KEY" });
  }

  console.log(`🔍 SEARCH REQUEST: "${query}" from ${clientIP.substring(0,8)}...`);
  
  try {
    // Step 1: Check if this is a legal advice request
    const isLegal = isLegalAdviceRequest(query);
    console.log(`🔍 Legal advice check result: ${isLegal}`);
    
    if (isLegal) {
      console.log(`✅ RETURNING LEGAL HELP for: "${query}"`);
      const legalHelp = createLegalHelpResponse();
      logRequest(clientIP, query, req.headers['user-agent'], legalHelp.length, null);
      return res.json(legalHelp);
    }
    
    console.log(`➡️ Proceeding to AI search for: "${query}"`);

    // Step 2: Get AI recommendations from external databases (resource-database only)
    // Use ONLY external databases (CATALOG_B / resource-database) for AI whitelist
    const externalDatabases = CATALOG_B.map(item => ({ name: item.name, aliases: item.aliases || [] }));
    const allowedList = shortlistFromCatalog(query, externalDatabases, ALLOWLIST_SIZE);
    const prompt = buildPrompt(query, allowedList);

    const { text, data } = await queryGemini(prompt, debug >= 2);
    const aiParsed = parseGeminiJsonLoose(text);
    const cleaned = aiParsed.map(coerceItem).filter((r) => r.name);
    const afterGuideFilter = filterGuides(cleaned);

    let aiResults = skipWhitelist ? afterGuideFilter : afterGuideFilter.filter((r) => isWhitelistedLoose(r.name));

    if (aiResults.length === 0) {
      aiResults = fallbackRecommend(query, 8); // Reduce to make room for local guides
    }

    // Step 3: Add local guides that match the query
    const localGuides = searchLocalGuides(query);

    // Step 4: Add LibGuide assets that match the query
    const libGuideAssets = searchLibGuideAssets(query);

    // Step 5: Combine results (AI + local guides + LibGuide assets)
    let result = [...aiResults, ...localGuides, ...libGuideAssets];

    // De-dupe + sort + cap
    const best = new Map();
    for (const item of result) {
      const key = normalize(item.name);
      const prev = best.get(key);
      if (!prev || item.relevanceScore > prev.relevanceScore) best.set(key, item);
    }
    // Filter by relevance score and limit results - prioritize quality over quantity
    const sortedResults = [...best.values()].sort((a, b) => b.relevanceScore - a.relevanceScore);
    const MIN_RELEVANCE_SCORE = 60; // Don't show results below 60% relevance
    const MAX_RESULTS = 8; // Reduce from 12 to focus on most relevant
    const finalOut = sortedResults
      .filter(item => item.relevanceScore >= MIN_RELEVANCE_SCORE)
      .slice(0, MAX_RESULTS);

    // Enrich results with catalog information (URLs and descriptions)
    console.log(`🚨 About to enrich ${finalOut.length} results...`);
    const enriched = enrichResults(finalOut);
    console.log(`🚨 Enrichment complete. First result:`, enriched[0]);

    if (debug) {
      return res.json({
        diagnostics: {
          queryType: isLegalAdviceRequest(query) ? "legal-advice" : "research",
          model: MODEL,
          externalDatabaseCount: CATALOG_B.length,
          localGuideCount: CATALOG_A.length,
          allowlistSent: allowedList.length,
          rawChars: text?.length ?? 0,
          aiResults: aiResults.length,
          localGuideResults: localGuides.length,
          totalResults: finalOut.length,
          usedFallback: cleaned.length === 0,
          enrichedWithUrl: enriched.filter(x => x.url).length,
          enrichedWithDesc: enriched.filter(x => x.description).length,
          sampleAiResults: aiResults.slice(0, 3),
          sampleLocalGuides: localGuides.slice(0, 3),
          rawGeminiPreview: debug >= 2 ? JSON.stringify(data, null, 2).slice(0, 2000) : undefined,
        },
        results: enriched,
      });
    }

    logRequest(clientIP, query, req.headers['user-agent'], enriched.length, null);
    res.json(enriched);
  } catch (err) {
    console.error("Search error:", err);
    
    // Check if it's any API service error that should trigger fallback
    const isApiServiceError = err.message && (
      err.message.includes('quota') || 
      err.message.includes('429') || 
      err.message.includes('RESOURCE_EXHAUSTED') ||
      err.message.includes('503') ||
      err.message.includes('500') ||
      err.message.includes('502') ||
      err.message.includes('overloaded') ||
      err.message.includes('temporarily unavailable') ||
      err.message.includes('service unavailable') ||
      err.message.includes('timeout') ||
      err.message.includes('DEADLINE_EXCEEDED')
    );
    
    if (isApiServiceError) {
      console.log(`🔄 AI service error detected, providing fallback results for: "${query}"`);
      console.log(`🔄 Error details: ${err.message}`);
      
      // Provide comprehensive fallback results: external databases + local guides + LibGuide assets
      const fallbackFromExternal = fallbackRecommend(query, 3); // 3 external databases
      const fallbackFromLocal = searchLocalGuides(query).slice(0, 2); // 2 local guides  
      const fallbackFromAssets = searchLibGuideAssets(query).slice(0, 2); // 2 LibGuide assets
      const fallbackResults = [...fallbackFromExternal, ...fallbackFromLocal, ...fallbackFromAssets];
      
      // Enrich and return fallback results
      const enrichedFallback = enrichResults(fallbackResults);
      
      logRequest(clientIP, query, req.headers['user-agent'], enrichedFallback.length, `AI service error - returned ${enrichedFallback.length} fallback results: ${err.message}`);
      
      return res.json({
        results: enrichedFallback,
        fallback: true,
        message: "AI search temporarily unavailable - showing backup recommendations from our library catalog"
      });
    }
    
    logRequest(clientIP, query, req.headers['user-agent'], 0, err.message);
    res.status(502).json({ error: "Error contacting Gemini API", detail: String(err) });
  }
});

/* ------------------------ WordPress Endpoint --------------------------- */

// WordPress-style endpoint that mirrors the main search functionality
app.get("/wp-json/ais/v1/search", requireApiKey, async (req, res) => {
  // Rate limiting check
  const clientIP = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';
  const rateCheck = checkRateLimit(clientIP);
  
  if (!rateCheck.allowed) {
    logRequest(clientIP, req.query.query || 'empty', req.headers['user-agent'], 0, `WordPress rate limited - reset in ${rateCheck.resetIn}s`);
    return res.status(429).json({ 
      error: "Too many requests", 
      retryAfter: rateCheck.resetIn,
      message: `Please wait ${rateCheck.resetIn} seconds before trying again`
    });
  }

  const query = req.query.query;
  const debug = Number(req.query.debug || 0);
  const skipWhitelist = req.query.skipWhitelist === "1";

  if (!query || !String(query).trim()) {
    logRequest(clientIP, query || 'empty', req.headers['user-agent'], 0, 'WordPress missing query parameter');
    return res.status(400).json({ error: "Missing ?query" });
  }
  if (!GEMINI_API_KEY) {
    logRequest(clientIP, query, req.headers['user-agent'], 0, 'WordPress server missing GEMINI_API_KEY');
    return res.status(500).json({ error: "Server missing GEMINI_API_KEY" });
  }

  console.log(`🔍 WORDPRESS SEARCH REQUEST: "${query}" from ${clientIP.substring(0,8)}...`);
  
  try {
    // Step 1: Check if this is a legal advice request
    const isLegal = isLegalAdviceRequest(query);
    console.log(`🔍 WordPress Legal advice check result: ${isLegal}`);
    
    if (isLegal) {
      console.log(`✅ WORDPRESS RETURNING LEGAL HELP for: "${query}"`);
      const legalHelp = createLegalHelpResponse();
      logRequest(clientIP, query, req.headers['user-agent'], legalHelp.length, null);
      return res.json(legalHelp);
    }
    
    console.log(`➡️ WordPress proceeding to AI search for: "${query}"`);

    // Step 2: Get AI recommendations from external databases (resource-database only)
    // Use ONLY external databases (CATALOG_B / resource-database) for AI whitelist
    const externalDatabases = CATALOG_B.map(item => ({ name: item.name, aliases: item.aliases || [] }));
    const allowedList = shortlistFromCatalog(query, externalDatabases, ALLOWLIST_SIZE);
    const prompt = buildPrompt(query, allowedList);

    const { text, data } = await queryGemini(prompt, debug >= 2);
    const aiParsed = parseGeminiJsonLoose(text);
    const cleaned = aiParsed.map(coerceItem).filter((r) => r.name);
    const afterGuideFilter = filterGuides(cleaned);

    let aiResults = skipWhitelist ? afterGuideFilter : afterGuideFilter.filter((r) => isWhitelistedLoose(r.name));

    if (aiResults.length === 0) {
      aiResults = fallbackRecommend(query, 8); // Reduce to make room for local guides
    }

    // Step 3: Add local guides that match the query
    const localGuides = searchLocalGuides(query);

    // Step 4: Add LibGuide assets that match the query
    const libGuideAssets = searchLibGuideAssets(query);

    // Step 5: Combine results (AI + local guides + LibGuide assets)
    let result = [...aiResults, ...localGuides, ...libGuideAssets];

    // De-dupe + sort + cap
    const best = new Map();
    for (const item of result) {
      const key = normalize(item.name);
      const prev = best.get(key);
      if (!prev || item.relevanceScore > prev.relevanceScore) best.set(key, item);
    }
    // Filter by relevance score and limit results - prioritize quality over quantity
    const sortedResults = [...best.values()].sort((a, b) => b.relevanceScore - a.relevanceScore);
    const MIN_RELEVANCE_SCORE = 60; // Don't show results below 60% relevance
    const MAX_RESULTS = 8; // Reduce from 12 to focus on most relevant
    const finalOut = sortedResults
      .filter(item => item.relevanceScore >= MIN_RELEVANCE_SCORE)
      .slice(0, MAX_RESULTS);

    // Enrich results with catalog information (URLs and descriptions)
    const enriched = enrichResults(finalOut);

    if (debug) {
      return res.json({
        diagnostics: {
          queryType: isLegalAdviceRequest(query) ? "legal-advice" : "research",
          model: MODEL,  
          externalDatabaseCount: CATALOG_B.length,
          localGuideCount: CATALOG_A.length,
          allowlistSent: allowedList.length,
          rawChars: text?.length ?? 0,
          aiResults: aiResults.length,
          localGuideResults: localGuides.length,
          totalResults: finalOut.length,
          usedFallback: cleaned.length === 0,
          enrichedWithUrl: enriched.filter(x => x.url).length,
          enrichedWithDesc: enriched.filter(x => x.description).length,
          sampleAiResults: aiResults.slice(0, 3),
          sampleLocalGuides: localGuides.slice(0, 3),
          rawGeminiPreview: debug >= 2 ? JSON.stringify(data, null, 2).slice(0, 2000) : undefined,
        },
        results: enriched,
      });
    }

    logRequest(clientIP, query, req.headers['user-agent'], enriched.length, null);
    res.json(enriched);

  } catch (error) {
    console.error(`❌ WORDPRESS SEARCH ERROR for "${query}":`, error.message);
    logRequest(clientIP, query, req.headers['user-agent'], 0, error.message);
    return res.status(500).json({ 
      error: "Error contacting Gemini API", 
      detail: error.message 
    });
  }
});

// Logs endpoint (for monitoring)
app.get("/logs", (req, res) => {
  const lines = parseInt(req.query.lines) || 50;
  
  if (!fs.existsSync(LOG_FILE)) {
    return res.json({ logs: [], message: "No log file found" });
  }
  
  try {
    const content = fs.readFileSync(LOG_FILE, 'utf8');
    const logLines = content.trim().split('\n').slice(-lines);
    const logs = logLines.map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return { raw: line };
      }
    });
    
    res.json({ 
      logs,
      total: logLines.length,
      requested: lines,
      logFile: LOG_FILE
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to read logs", detail: error.message });
  }
});

/* ------------------------------- Startup -------------------------------- */

// Export app for production startup, or start directly if this file is run
if (require.main === module) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ LibrarySearch running on port ${PORT}`);
    console.log(`   Health:  http://0.0.0.0:${PORT}/health`);
    console.log(`   Models:  http://0.0.0.0:${PORT}/models`);
    console.log(`   Search:  http://0.0.0.0:${PORT}/search?query=constitutional%20law`);
    console.log(`            Add &debug=1 (or &debug=2) and/or &skipWhitelist=1 for troubleshooting`);
  });
} else {
  console.log(`📦 LibrarySearch app exported for external startup`);
}

module.exports = app;
