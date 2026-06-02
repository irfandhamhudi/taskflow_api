# Stage 1: Install production dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# Stage 2: Final runner image
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

# Copy node_modules and app files
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY server.js ./
COPY src ./src

# Create logs directory and set ownership to node user
RUN mkdir -p logs && chown -R node:node /app

# Switch to non-root user
USER node

# Expose server port
EXPOSE 5000

# Start server
CMD ["node", "server.js"]
