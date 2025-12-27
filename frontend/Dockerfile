# =====================================================================
# Kilusi Bill - Frontend Dockerfile (Next.js Standalone)
# =====================================================================

# Build arguments (must be declared before use)
ARG NEXT_PUBLIC_API_URL=http://localhost:3001

# Build stage
FROM node:20-alpine AS builder

# Declare build arg again in this stage
ARG NEXT_PUBLIC_API_URL=http://localhost:3001

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci && \
    npm cache clean --force

# Copy application files
COPY . .

# Set environment variable at build time
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Build the application (standalone mode)
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Install dependencies for health check
RUN apk add --no-cache \
    wget \
    curl

# Copy built application
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Create .next directory structure
RUN mkdir -p .next

# Expose port (run on port 80 directly)
ENV PORT=80
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost/ || exit 1

# Start the Next.js server on port 80
CMD ["node", "server.js"]
