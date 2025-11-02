# Production-ready Dockerfile for UB Bank Scraper
FROM mcr.microsoft.com/playwright:v1.47.0-jammy

WORKDIR /app

# Copy package files (no package-lock.json)
COPY package.json ./
COPY client/package.json ./client/

# Install backend dependencies
RUN npm install --force

# Install and build frontend
WORKDIR /app/client
RUN npm install --force
RUN npm run build

# Setup static files and copy source
WORKDIR /app
COPY . .
RUN mkdir -p static && cp -r client/dist/* static/

# Environment
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["npx", "ts-node", "-T", "src/server.ts"]