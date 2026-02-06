# girok-md Docker Image
# Builds the site with Node.js, then serves static HTML via Nginx.
#
# Usage:
#   docker build -t girok-md .
#   docker run -p 8080:8080 \
#     -v /path/to/markdown-folder:/source:ro \
#     -v ./setting.toml:/app/setting.toml:ro \
#     girok-md

# Node.js 22 on Alpine Linux (lightweight base image)
FROM node:22-alpine

# Nginx: web server that serves the built static files to browsers
RUN apk add --no-cache nginx

# Set working directory
WORKDIR /app

# Install dependencies (cached as long as package.json doesn't change)
COPY package.json package-lock.json ./
RUN npm ci

# Copy project source
COPY astro.config.mjs tsconfig.json ./
COPY src/ src/
COPY scripts/ scripts/

# Copy Nginx config
COPY docker/nginx.conf /etc/nginx/http.d/default.conf

# Pre-create directories generated during sync
# (src/content/posts: markdown-to-HTML targets, public/assets: images and static files)
RUN mkdir -p src/content/posts public/assets

# Copy container entrypoint script
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Use unprivileged port instead of 80 for better security
EXPOSE 8080

# Run entrypoint script on container start
ENTRYPOINT ["/entrypoint.sh"]
