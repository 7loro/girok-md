#!/bin/sh
# Container entrypoint script
# Flow: sync markdown → build site → start web server
set -e

# 1. Verify markdown source directory is mounted
if [ ! -d "/source" ]; then
  echo "Error: /source directory not found."
  echo "Mount your markdown folder:"
  echo "  docker run -v /path/to/markdown-folder:/source:ro ..."
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
