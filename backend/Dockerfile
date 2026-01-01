# =====================================================================
# Kilusi Bill - Backend Dockerfile
# =====================================================================

FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    postgresql-client \
    wget \
    curl

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --production=false && \
    npm cache clean --force

# Copy application files
COPY . .

# Install production dependencies only
RUN npm prune --production

# Create logs directory
RUN mkdir -p /app/logs

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

# Start the application
CMD ["npm", "start"]
