# Production-ready Dockerfile for UB Bank Scraper v2
FROM mcr.microsoft.com/playwright:v1.47.0-jammy

WORKDIR /app

# Copy package files (no package-lock.json)
COPY package.json ./
COPY client/package.json ./client/

# Install backend dependencies
RUN npm install --force

# Cache bust for Render
ARG CACHEBUST=1

# Copy all source files
COPY . .

# Install and build frontend (skip tsc, only vite build)
WORKDIR /app/client
RUN npm install --force
RUN npx vite build

# Setup static files
WORKDIR /app
RUN mkdir -p static && cp -r client/dist/* static/

# Environment
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["npx", "ts-node", "-T", "src/server.ts"]