#!/bin/bash

# GitHub Pages Preparation Script
# This script helps prepare your repository for GitHub Pages deployment

echo "🚀 Preparing AI Law Library Search for GitHub Pages..."
echo ""

# Create a .gitignore file
echo "📝 Creating .gitignore file..."
cat > .gitignore << 'EOF'
# Environment files (keep API keys secret!)
.env
.env.local
.env.production

# Node modules
node_modules/

# Logs
logs/
*.log
*.log.*
.pm2/

# OS generated files
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db

# Editor files
.vscode/
.idea/
*.swp
*.swo
*~

# Temporary files
tmp/
temp/
.tmp/
EOF

# Check if this is a git repository
if [ ! -d ".git" ]; then
    echo ""
    echo "⚠️  This is not a git repository. Initializing..."
    git init
    echo "✅ Git repository initialized"
fi

# Check for required files
echo ""
echo "🔍 Checking required files..."

required_files=("index.html" "demo.html" "README.md" "GITHUB_PAGES_GUIDE.md")
for file in "${required_files[@]}"; do
    if [ -f "$file" ]; then
        echo "✅ $file exists"
    else
        echo "❌ $file missing"
    fi
done

# Check file sizes (GitHub has 100MB limit)
echo ""
echo "📊 Checking file sizes..."
large_files=$(find . -type f -size +10M -not -path "./node_modules/*" -not -path "./.git/*")
if [ -n "$large_files" ]; then
    echo "⚠️  Large files found (>10MB):"
    echo "$large_files"
    echo "Consider using Git LFS for these files"
else
    echo "✅ No large files found"
fi

# Count total files and size
echo ""
echo "📈 Repository statistics:"
total_files=$(find . -type f -not -path "./node_modules/*" -not -path "./.git/*" | wc -l)
total_size=$(du -sh . --exclude=node_modules --exclude=.git | cut -f1)
echo "   Files: $total_files"
echo "   Size: $total_size"

# Prepare deployment options
echo ""
echo "🛠️  Deployment Options:"
echo ""
echo "1. Demo Version (Recommended for public GitHub Pages)"
echo "   - Safe: No API keys exposed"
echo "   - Works with sample data"
echo "   - Perfect for showcasing the interface"
echo ""
echo "2. Production Version (Advanced users)"
echo "   - Requires CORS configuration on your server"
echo "   - API keys will be visible in client code"
echo "   - Full functionality with live AI search"
echo ""

read -p "Which version do you want as your main page? (1 for Demo, 2 for Production): " choice

if [ "$choice" = "1" ]; then
    echo ""
    echo "📋 Setting up Demo version..."
    if [ -f "index.html" ]; then
        mv index.html index-production.html
        echo "✅ Renamed index.html to index-production.html"
    fi
    if [ -f "demo.html" ]; then
        cp demo.html index.html
        echo "✅ Copied demo.html to index.html"
    fi
    echo "✅ Demo version is now the main page"
    
elif [ "$choice" = "2" ]; then
    echo ""
    echo "🔧 Setting up Production version..."
    echo "⚠️  Remember to:"
    echo "   1. Update API_BASE and API_KEY in index.html"
    echo "   2. Configure CORS on your server for GitHub Pages"
    echo "   3. Never commit real API keys to public repos"
    
else
    echo "No changes made. You can manually configure later."
fi

# Final instructions
echo ""
echo "🎯 Next steps to deploy to GitHub:"
echo ""
echo "1. Create repository at: https://github.com/garrettstephen/libguidesearch"
echo ""
echo "2. Add and commit files:"
echo "   git add ."
echo "   git commit -m 'Initial commit: AI Law Library Search'"
echo ""
echo "3. Connect to GitHub:"
echo "   git remote add origin https://github.com/garrettstephen/libguidesearch.git"
echo "   git branch -M main"
echo "   git push -u origin main"
echo ""
echo "4. Enable GitHub Pages in repository Settings > Pages"
echo ""
echo "5. Your site will be available at:"
echo "   https://garrettstephen.github.io/libguidesearch/"
echo ""
echo "📖 For detailed instructions, see: GITHUB_PAGES_GUIDE.md"
echo ""
echo "🎉 Ready for GitHub Pages deployment!"