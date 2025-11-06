# BYU Law Library AI Search System

## Project Overview

The BYU Law Library AI Search System is a comprehensive, AI-powered legal research platform that intelligently recommends relevant legal resources to researchers. Built using Google Gemini AI and Node.js, it serves as a bridge between users and BYU Law Library's extensive collection of 10,330+ legal research resources.

## System Architecture

```
┌─────────────────────┐    ┌──────────────────────┐    ┌─────────────────────┐
│   WordPress Site    │────│  AI Search Server   │────│  Google Gemini AI   │
│  (Widget Frontend)  │    │  (Node.js/Express)  │    │   (Resource Rec.)   │
└─────────────────────┘    └──────────────────────┘    └─────────────────────┘
                                       │
                            ┌──────────┴──────────┐
                            │  Resource Databases │
                            │ • External DBs (299)│
                            │ • LibGuides (187)   │
                            │ • Assets (9,878)    │
                            └─────────────────────┘
```

## Key Features

### 🤖 **AI-Powered Search**
- Google Gemini AI analyzes user queries and recommends relevant legal resources
- Intelligent matching based on query intent (case law, statutes, academic research)
- Geographic relevance filtering (e.g., Utah law queries return Utah resources)

### 🛡️ **Legal Ethics Compliance**
- Automatic detection of legal advice requests
- Redirects advice-seekers to appropriate legal aid organizations
- Prevents unauthorized practice of law

### 🔒 **Security & Performance**
- API key authentication for all requests
- Rate limiting (10 requests/minute per IP)
- Privacy-aware logging with hashed IP addresses
- CORS and security headers via Helmet

### 📚 **Comprehensive Resource Database**
- **External Databases**: Westlaw, Lexis+, Bloomberg Law, HeinOnline, etc. (299 resources)
- **Local LibGuides**: BYU Law subject guides and research guides (187 resources)
- **LibGuide Assets**: Books, articles, case collections, and more (9,878 resources)
- **Total**: 10,330+ curated legal research resources

### 🔍 **Intelligent Result Filtering**
- Quality over quantity approach (3-8 results vs. 12+ low-relevance results)
- Minimum 60% relevance threshold
- Deduplication and relevance scoring
- Enhanced with catalog URLs and descriptions

### 🌐 **WordPress Integration**
- REST API endpoints for seamless WordPress embedding
- Custom widget with search interface, pagination, and result display
- Responsive design for desktop and mobile

## Technical Stack

- **Backend**: Node.js, Express.js
- **AI**: Google Gemini 2.0 Flash Lite
- **Security**: Helmet, CORS, custom rate limiting
- **Frontend**: HTML/CSS/JavaScript widget
- **Process Management**: PM2 for production deployment
- **Database**: JSON catalog files (10,000+ resources)

## Core Components

### 1. Search Engine (`server.js`)
The main server handling AI search requests, legal advice detection, and resource recommendations.

### 2. Resource Catalogs
- `library-resources-database.catalog.json` - External databases
- `resource-database.catalog.json` - Local LibGuides  
- `libguide-assets.catalog.json` - Books, articles, assets

### 3. Whitelists
- Controls which resources AI can recommend
- Ensures quality and relevance of suggestions
- Prevents hallucination of non-existent resources

### 4. WordPress Widget (`wordpress-proxy-widget.html`)
- Search interface with real-time results
- Pagination for large result sets
- Badge system for different resource types
- Legal notice system for advice requests

### 5. Legal Referral System
Comprehensive database of legal aid organizations:
- Utah Legal Services (free legal aid)
- Utah State Bar referral services
- Local legal clinics
- BYU Community Legal Clinic

## Search Flow

1. **User Query**: User enters search query in WordPress widget
2. **Legal Check**: System checks if query requests legal advice
3. **AI Analysis**: If research query, sent to Google Gemini AI with resource whitelist
4. **Resource Matching**: AI recommends relevant resources from allowed list
5. **Local Enhancement**: System adds matching local guides and assets
6. **Quality Filter**: Results filtered by relevance score (60%+ threshold)
7. **Enrichment**: Results enhanced with URLs, descriptions, and badges
8. **Response**: Final results returned with pagination and metadata

## Security Model

### Authentication
- All API endpoints require `X-API-Key` header
- Separate API key for local development vs. production

### Rate Limiting
- 10 requests per minute per IP address
- Sliding window implementation
- Prevents API abuse and resource exhaustion

### Privacy Protection
- IP addresses hashed before logging (MD5, first 8 characters)
- Query logging limited to 200 characters
- No storage of sensitive user information

### Legal Ethics
- Automatic detection prevents unauthorized legal advice
- Clear disclaimers about library vs. legal services
- Referral system connects users with licensed attorneys

## Performance Optimizations

### Caching
- Resource catalogs loaded once at startup
- AI model resolution cached
- Whitelist compilation optimized

### Result Quality
- Intelligent deduplication by normalized resource names
- Relevance-based sorting and filtering
- Limited result sets (8 max) for better user experience

### Error Handling
- Graceful fallbacks when AI unavailable
- Comprehensive error logging
- User-friendly error messages

## Deployment Architecture

### Production Setup (PM2)
```bash
# Process management with PM2
pm2 start ecosystem.config.js
pm2 startup  # Auto-start on system boot
pm2 save     # Save current process list
```

### SSL/HTTPS
- Runs on port 8443 with HTTPS
- SSL certificate management via Let's Encrypt or manual setup
- Secure headers via Helmet middleware

### Firewall Configuration
- UFW firewall with selective port access
- SSH (22), HTTP (80), HTTPS (443), Custom HTTPS (8443)
- Intrusion prevention and monitoring

## Integration Points

### WordPress REST API
- `/wp-json/ais/v1/health` - Health check endpoint
- `/wp-json/ais/v1/search` - Search endpoint with WordPress-style responses
- Custom functions.php integration for proxy functionality

### Google Analytics (Optional)
- Event tracking for search queries
- Result click tracking
- User engagement analytics

### External APIs
- Google Gemini API for AI recommendations
- BYU Library catalog integration
- LibGuides API for resource metadata

## Development vs. Production

### Development Features
- Debug endpoints with detailed diagnostics
- Raw AI response inspection
- Whitelist bypass options
- Enhanced logging

### Production Optimizations
- PM2 process management with auto-restart
- Log rotation and monitoring
- Performance metrics collection
- Health check endpoints for load balancers

## Future Enhancements

### Potential Improvements
1. **Redis Integration**: Distributed rate limiting and caching
2. **Database Migration**: Move from JSON files to proper database
3. **Advanced Analytics**: User behavior tracking and search optimization
4. **Multi-language Support**: Internationalization for global use
5. **API Rate Tiers**: Different limits for different user types
6. **Machine Learning**: Improve search relevance based on user feedback

### Scalability Considerations
- Horizontal scaling with load balancers
- Database clustering for high availability
- CDN integration for static assets
- Microservice architecture for component separation

## Project Impact

### For Researchers
- Faster discovery of relevant legal resources
- Reduced research time through AI-powered recommendations
- Access to comprehensive legal database collection
- Ethical guidance away from unauthorized legal advice

### For BYU Law Library
- Enhanced digital services portfolio
- Improved resource utilization and discovery
- Modern interface for traditional library services
- Analytics insight into user research patterns

### For Legal Education
- Demonstrates AI integration in legal research
- Showcases ethical AI implementation
- Provides practical experience with legal technology
- Bridges traditional library services with modern AI tools

This system represents a significant advancement in legal research technology, combining the power of AI with the expertise of professional law librarians to create a more efficient and ethical research experience.