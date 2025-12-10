# WordPress AI Search Integration Guide

## Overview

The `wpsearch.js` script intercepts search queries from the main BYU Law Library homepage when users are on the "Search All" tab and routes them to your AI-powered search endpoint at `https://lawlibrary.byu.edu/wp-json/ais/v1/search`.

## Installation Steps

### 1. Upload the Script

Upload `wpsearch.js` to your WordPress theme directory. Recommended location:
```
/wp-content/themes/your-theme/js/wpsearch.js
```

### 2. Enqueue the Script in functions.php

Add this code to your theme's `functions.php` file:

```php
function byu_law_enqueue_ai_search() {
    wp_enqueue_script(
        'byu-ai-search',
        get_template_directory_uri() . '/js/wpsearch.js',
        array(), // No dependencies
        '1.0.0',
        true // Load in footer
    );
}

// Load on homepage only (adjust the conditional as needed)
add_action('wp_enqueue_scripts', function() {
    if (is_front_page()) {
        byu_law_enqueue_ai_search();
    }
});
```

### 3. Verify Your Search Form Structure

The script looks for these elements:
- **Search input**: `input[name="q"]`, `input.search-field`, or `input[type="search"]`
- **Search form**: `form.search-form`, `form[role="search"]`, or `#search-form`

If your homepage uses different selectors, update lines 45-46 in `wpsearch.js`:

```javascript
const searchInput = document.querySelector('YOUR-INPUT-SELECTOR');
const searchForm = document.querySelector('YOUR-FORM-SELECTOR');
```

### 4. Test the Integration

1. Go to your homepage at `https://lawlibrary.byu.edu`
2. Make sure you're on the "Search All" tab
3. Enter a query (at least 3 characters)
4. Press Enter or click Search
5. You should see AI-powered results displayed below the search box

## How It Works

1. **Tab Detection**: The script checks if the user is on the "Search All" tab
2. **Form Intercept**: When the user submits a search, the script intercepts it
3. **AI Search**: Sends the query to your WordPress REST API endpoint
4. **Results Display**: Shows formatted results with:
   - Result cards with titles, descriptions, and relevance scores
   - Type badges (Database, Research Guide, Legal Referral, etc.)
   - Special notice for legal help queries
   - Pagination for results (10 per page)

## Features

- ✅ **Seamless Integration**: Works with your existing search form
- ✅ **Smart Detection**: Only intercepts "Search All" tab queries
- ✅ **Beautiful UI**: Styled results with BYU Law Library branding
- ✅ **Legal Help Detection**: Special notices for users needing legal referrals
- ✅ **Pagination**: Handles large result sets
- ✅ **Error Handling**: Graceful fallback if API is unavailable
- ✅ **Mobile Responsive**: Works on all device sizes
- ✅ **XSS Protection**: Escapes all user input and API responses

## Customization

### Styling

The script injects its own CSS automatically. To customize colors, edit the `injectStyles()` function around line 330 in `wpsearch.js`.

Key CSS classes:
- `.ai-search-results` - Main results container
- `.ai-result-item` - Individual result card
- `.result-title` - Result heading
- `.result-type` - Type badge
- `.legal-help-notice` - Legal referral banner

### Configuration

Modify the CONFIG object at the top of `wpsearch.js`:

```javascript
const CONFIG = {
  aiSearchEndpoint: 'https://lawlibrary.byu.edu/wp-json/ais/v1/search',
  minQueryLength: 3,      // Minimum characters before searching
  resultsPerPage: 10      // Results per page
};
```

## Debugging

Check browser console for these messages:
- `Initializing BYU Law Library AI Search Integration` - Script loaded
- `AI Search: Attached to search input` - Found search form
- `AI Search: Intercepting search for: [query]` - Search intercepted
- `AI Search: Received X results` - Got results from API

If you see warnings about elements not found, adjust the selectors in `attachSearchHandler()`.

## Troubleshooting

### Search not being intercepted
- Check browser console for error messages
- Verify you're on the "Search All" tab
- Make sure query is at least 3 characters

### No results displaying
- Check Network tab in browser dev tools for API calls
- Verify the API endpoint is accessible
- Check that `wordpress-widget-fixed.html` normalization is working

### Styling issues
- Check for CSS conflicts with your theme
- Try adjusting z-index values in the injected styles
- Use browser dev tools to inspect element classes

## Additional Notes

- The script only activates on the "Search All" tab - other tabs work normally
- Results open in new tabs to preserve the search page
- The script includes the same `normalizeResults()` fix for the "undefined" bug
- All network requests include proper error handling

## Support

For issues or questions, check:
1. Browser console for JavaScript errors
2. WordPress REST API endpoint status at `/wp-json/ais/v1/search?query=test`
3. Server logs for PHP errors in `functions-enhanced.php`
