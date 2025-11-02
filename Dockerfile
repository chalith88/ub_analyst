# ---------- Stage 1: Build the React frontend ----------
FROM node:20-bullseye AS ui-build
WORKDIR /ui

# Copy frontend package files
COPY client/package*.json ./
RUN npm ci

# Copy frontend source and build
COPY client/ ./
RUN npm run build

# ---------- Stage 2: Runtime with Playwright + Node backend ----------
FROM mcr.microsoft.com/playwright:v1.47.0-jammy
WORKDIR /app

# Optional OCR support (uncomment if using tesseract.js with local OCR)
# RUN apt-get update && apt-get install -y tesseract-ocr && rm -rf /var/lib/apt/lists/*

# Copy backend package files
COPY package*.json ./
RUN npm ci --omit=dev

# Copy backend source
COPY src/ ./src/
COPY tsconfig.json ./

# Copy built frontend into /app/static
COPY --from=ui-build /ui/dist ./static

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Run the TypeScript server directly with ts-node
CMD ["npx", "ts-node", "-T", "src/server.ts"]