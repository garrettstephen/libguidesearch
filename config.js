// Configuration for GitHub Pages deployment
// This file contains settings that can be easily modified for different hosting scenarios

const CONFIG = {
    // Production server (your current setup)
    PRODUCTION: {
        API_BASE: 'https://128.187.43.25:8443',
        API_KEY: 'your-production-api-key-here', // Set this to your actual API key
        DESCRIPTION: 'Points to your production Node.js server'
    },
    
    // Alternative: Direct Google Gemini API calls (client-side only)
    // Note: This would require exposing your API key, not recommended for production
    CLIENT_SIDE: {
        API_BASE: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent',
        API_KEY: 'your-google-api-key-here',
        DESCRIPTION: 'Direct client-side calls to Google Gemini API (not recommended - exposes API key)'
    },
    
    // Mock/Demo mode for GitHub Pages demo
    DEMO: {
        API_BASE: null,
        API_KEY: null,
        DESCRIPTION: 'Demo mode with sample data for GitHub Pages preview'
    }
};

// Current active configuration
const ACTIVE_CONFIG = CONFIG.PRODUCTION; // Change this to switch modes

// Export for use in main application
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CONFIG, ACTIVE_CONFIG };
}