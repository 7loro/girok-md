#!/bin/sh
# Container entrypoint script
# Flow: sync markdown → build site → start web server
set -e

# 1. Verify markdown source directory is mounted
if [ ! -d "/source" ]; then
  echo "Error: /source directory not found."
  echo ""
  echo "Please update docker-compose.yml with your markdown folder path:"
  echo "  volumes:"
  echo "    - /your/actual/path:/source:ro"
  echo ""
  echo "Example paths:"
  echo "  macOS:   /Users/username/Documents/ObsidianVault"
  echo "  Linux:   /home/username/Documents/ObsidianVault"
  echo "  Windows: C:/Users/username/Documents/ObsidianVault"
  exit 1
fi

# 2. Sync markdown files into blog posts
echo "Syncing markdown files..."
npm run sync

# 3. Build static HTML site (+ pagefind search index)
echo "Building site..."
npm run build

# 4. Start Nginx web server (serves built HTML to browsers)
#    "daemon off": run in foreground so the container stays alive
echo "Starting web server on port 8080..."
exec nginx -g "daemon off;"
