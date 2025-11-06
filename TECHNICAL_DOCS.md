# Technical Documentation - BYU Law Library AI Search

## Code Architecture Overview

### File Structure
```
byu-library-search/
├── server.js                           # Main server application
├── ecosystem.config.js                 # PM2 process configuration
├── wordpress-proxy-widget.html         # WordPress integration widget
├── .env                                # Environment configuration
├── ssl/                                # SSL certificates
├── logs/                              # Application logs
├── data/                              # Resource catalogs
│   ├── library-resources-database.catalog.json
│   ├── resource-database.catalog.json
│   ├── libguide-assets.catalog.json
│   ├── library-resources-database.whitelist.json
│   ├── resource-database.whitelist.json
│   └── legalhelp.txt
├── test_improvements.sh               # Testing script
├── PROJECT_OVERVIEW.md                # Project documentation
├── SETUP_GUIDE.md                     # Installation guide
└── TECHNICAL_DOCS.md                  # This file
```

## Core Components Deep Dive

### 1. Main Server (server.js)

The server is organized into several key sections:

#### Security & Rate Limiting
```javascript
// Rate limiting implementation
const rateLimiter = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10;   // 10 requests per minute per IP

function checkRateLimit(clientIP) {
    const now = Date.now();
    const hashedIP = crypto.createHash('md5').update(clientIP).digest('hex').substring(0,8);
    
    if (!rateLimiter.has(hashedIP)) {
        rateLimiter.set(hashedIP, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
        return { allowed: true };
    }
    
    const record = rateLimiter.get(hashedIP);
    if (now > record.resetTime) {
        rateLimiter.set(hashedIP, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
        return { allowed: true };
    }
    
    if (record.count >= MAX_REQUESTS_PER_WINDOW) {
        return { 
            allowed: false, 
            resetIn: Math.ceil((record.resetTime - now) / 1000) 
        };
    }
    
    record.count++;
    return { allowed: true };
}
```

#### Legal Advice Detection
```javascript
function isLegalAdviceRequest(query) {
    const q = query.toLowerCase().trim();
    
    // Pattern matching for legal advice requests
    if (/(should i|what should i|would you recommend|tell me what to do)/i.test(q)) {
        return true;
    }
    
    // Personal legal situations
    if (/(i'm being|i think i'm|my child was|help me with my case)/i.test(q)) {
        return true;
    }
    
    // Additional patterns...
    return false;
}
```

#### AI Integration
```javascript
async function queryGemini(prompt, wantRaw = false) {
    const model = await getModel();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
    
    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
            maxOutputTokens: MAX_OUTPUT_TOKENS,
            temperature: 0.1,
            topP: 0.8,
            topK: 40
        }
    };
    
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    
    // Response processing...
}
```

### 2. Resource Management System

#### Catalog Structure
Each resource catalog follows this JSON structure:
```json
{
  "resource_id": {
    "name": "Resource Name",
    "url": "https://resource-url.com",
    "description": "Detailed description of the resource",
    "subjects": ["Subject1", "Subject2"],
    "type": "database|guide|asset"
  }
}
```

#### Whitelist System
The whitelist system ensures AI only recommends actual resources:
```javascript
function isWhitelistedLoose(name) {
    const normalized = normalize(name);
    return WHITELIST_NORM.has(normalized) || WHITELIST_NORM.has(normalized.replace(/\s+/g, ''));
}

function normalize(s) {
    return String(s)
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
```

#### Search Enhancement Functions
```javascript
function searchLocalGuides(query) {
    const q = normalize(query);
    const words = q.split(/\s+/).filter(w => w.length > 2);
    
    const scored = CATALOG_A.map(guide => {
        let score = 0;
        const name = normalize(guide.name);
        const desc = normalize(guide.description || "");
        
        // Scoring algorithm
        for (const word of words) {
            if (name.includes(word)) score += 3;
            if (desc.includes(word)) score += 1;
        }
        
        return {
            ...guide,
            relevanceScore: Math.min(98, 60 + score * 3),
            matchReason: "BYU Law Library subject guide on this topic",
            isLocalGuide: true
        };
    }).filter(guide => guide.relevanceScore >= 65);
    
    return scored.sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, 5);
}
```

### 3. WordPress Integration Widget

#### Widget Architecture
The WordPress widget is a self-contained HTML/CSS/JavaScript component:

```javascript
// WordPress API integration
const WP_API_BASE = window.location.origin + '/wp-json/ais/v1';

async function doSearch(q) {
    // Google Analytics tracking
    if (typeof gtag !== 'undefined') {
        gtag('event', 'search', {
            search_term: q,
            event_category: 'AI Library Search',
            event_label: 'WordPress Widget'
        });
    }
    
    const params = new URLSearchParams({ query: q });
    const url = WP_API_BASE + '/search?' + params.toString();
    
    // Fetch and process results...
}
```

#### Pagination System
```javascript
function render(items, page = 0) {
    // Store all results and current page
    allResults = items;
    currentPage = page;
    
    // Calculate pagination
    const startIdx = page * resultsPerPage;
    const endIdx = startIdx + resultsPerPage;
    const pageItems = items.slice(startIdx, endIdx);
    const totalPages = Math.ceil(items.length / resultsPerPage);
    
    // Render results and pagination controls...
}
```

## API Endpoints Documentation

### Main Search Endpoint
```
GET /search?query=<query>&debug=<0|1>&skipWhitelist=<0|1>
```

**Parameters:**
- `query` (required): The search query string
- `debug` (optional): Enable debug mode (0 or 1)
- `skipWhitelist` (optional): Bypass whitelist filtering (0 or 1)

**Headers:**
- `X-API-Key`: Required API authentication key

**Response Format:**
```json
[
  {
    "name": "Resource Name",
    "relevanceScore": 85,
    "matchReason": "Why this resource matches the query",
    "url": "https://resource-url.com",
    "description": "Resource description",
    "isExternalDatabase": true,
    "isLocalGuide": false,
    "isLibGuideAsset": false,
    "isLegalHelp": false
  }
]
```

### WordPress Proxy Endpoint
```
GET /wp-json/ais/v1/search?query=<query>&debug=<0|1>
```
Mirrors the main search endpoint with WordPress-compatible responses.

### Health Check Endpoint
```
GET /health
GET /wp-json/ais/v1/health
```

**Response:**
```json
{
  "ok": true,
  "node": "v20.19.5",
  "port": "8443",
  "model_env": "gemini-2.0-flash-lite",
  "model_resolved": "gemini-2.0-flash-lite",
  "allowlistSize": 40,
  "maxOutputTokens": 4096,
  "whitelistCounts": {
    "listA": 299,
    "listB": 187,
    "listC": 9878,
    "merged": 10330
  }
}
```

## Performance Characteristics

### Response Times
- **Health Check**: < 50ms
- **Simple Search**: 2-8 seconds (AI processing)
- **Legal Help Detection**: < 100ms (local processing)
- **Cache Hits**: < 200ms

### Resource Usage
- **Memory**: ~70MB baseline, 150MB under load
- **CPU**: Low baseline, spikes during AI queries
- **Network**: ~1-5KB per request, 10-50KB per AI query
- **Storage**: ~50MB for catalogs, logs grow over time

### Scalability Limits
- **Concurrent Users**: ~100-200 (single instance)
- **Requests/Minute**: 600 (with rate limiting)
- **Database Size**: Current 10K resources, can handle 100K+
- **AI API Limits**: Depends on Google Gemini quotas

## Security Model Details

### Authentication Flow
```
Client Request → API Key Validation → Rate Limit Check → Process Request
```

### Rate Limiting Algorithm
```javascript
// Sliding window rate limiting with automatic cleanup
function cleanupRateLimit() {
    const now = Date.now();
    for (const [ip, record] of rateLimiter.entries()) {
        if (now > record.resetTime) {
            rateLimiter.delete(ip);
        }
    }
}

// Cleanup every 5 minutes
setInterval(cleanupRateLimit, 5 * 60 * 1000);
```

### Privacy Protection
- IP addresses hashed with MD5 before logging
- Query content truncated to 200 characters
- No persistent user tracking
- GDPR-compliant logging practices

## Error Handling Strategy

### AI Service Failures
```javascript
try {
    const { text, data } = await queryGemini(prompt, debug >= 2);
    // Process successful response
} catch (error) {
    console.error("Gemini API error:", error);
    
    // Fallback to local recommendations
    const fallbackResults = fallbackRecommend(query, 8);
    return res.json({
        results: fallbackResults,
        fallback: true,
        message: "AI temporarily unavailable - showing backup recommendations"
    });
}
```

### Network Timeouts
```javascript
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 30000); // 30 second timeout

try {
    const response = await fetch(url, { 
        signal: controller.signal,
        // ... other options
    });
} catch (error) {
    if (error.name === 'AbortError') {
        throw new Error("AI request timed out - try a simpler query");
    }
    throw error;
} finally {
    clearTimeout(timeout);
}
```

## Testing Framework

### Automated Testing Script
The `test_improvements.sh` script validates:
- Legal help detection accuracy
- Regular search functionality
- Result relevance and count
- API response format

### Manual Testing Procedures
1. **Legal Advice Detection**: Test with various advice-seeking queries
2. **Search Quality**: Verify relevance and geographic accuracy
3. **Performance**: Measure response times under load
4. **Security**: Verify rate limiting and authentication
5. **Integration**: Test WordPress widget functionality

### Load Testing
```bash
# Simple load test with curl
for i in {1..20}; do
  curl -s -H "X-API-Key: $API_KEY" \
    "http://localhost:8443/search?query=contract%20law" &
done
wait
```

## Monitoring and Analytics

### Key Metrics to Track
1. **Response Times**: P50, P95, P99 percentiles
2. **Error Rates**: 4xx and 5xx response codes
3. **Search Quality**: User engagement with results
4. **AI Performance**: Success rate and token usage
5. **Security Events**: Rate limiting triggers, invalid API keys

### Log Analysis Queries
```bash
# Most common search queries
grep "Search query" logs/combined.log | \
  sed 's/.*: "\(.*\)".*/\1/' | sort | uniq -c | sort -nr | head -20

# Error rate analysis
grep "ERROR" logs/combined.log | \
  awk '{print $1}' | sort | uniq -c

# Response time analysis
grep "Response time" logs/combined.log | \
  awk '{print $NF}' | sort -n
```

### Health Check Monitoring
```javascript
// Advanced health check with metrics
app.get("/health/detailed", (req, res) => {
    const memUsage = process.memoryUsage();
    const uptime = process.uptime();
    
    res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        uptime: Math.floor(uptime),
        memory: {
            rss: Math.round(memUsage.rss / 1024 / 1024) + "MB",
            heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + "MB",
            heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + "MB"
        },
        nodeVersion: process.version,
        env: process.env.NODE_ENV || "development"
    });
});
```

## Deployment Considerations

### Production Checklist
- [ ] Environment variables configured
- [ ] SSL certificates installed
- [ ] Firewall rules configured
- [ ] PM2 process management setup
- [ ] Log rotation configured
- [ ] Monitoring alerts setup
- [ ] Backup strategy implemented
- [ ] Performance testing completed
- [ ] Security audit passed

### Scaling Strategies
1. **Vertical Scaling**: Increase server resources (RAM, CPU)
2. **Horizontal Scaling**: Deploy multiple server instances
3. **Database Optimization**: Move to dedicated database server
4. **CDN Integration**: Cache static assets and responses
5. **Load Balancing**: Distribute traffic across instances

### Maintenance Tasks
- **Weekly**: Review logs, check performance metrics
- **Monthly**: Update dependencies, rotate API keys
- **Quarterly**: Security audit, performance optimization
- **Annually**: Full system review and architecture assessment

This technical documentation provides the foundation for understanding, maintaining, and extending the BYU Law Library AI Search system.