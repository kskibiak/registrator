# ─── Stage 1: build ───────────────────────────────────────────────────────────
FROM node:20-slim AS builder

# native build tools needed for better-sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
# npm ci compiles native modules for the target architecture (arm64 on RPi)
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npx tsc

# ─── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM node:20-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
    libstdc++6 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled JS
COPY --from=builder /app/dist ./dist

# Persistent data directory (mount a volume here)
RUN mkdir -p /app/data

EXPOSE 3000
CMD ["node", "dist/main.js"]
