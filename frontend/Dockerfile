# ─── Stage 1: build Angular ───────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx ng build --configuration production

# ─── Stage 2: serve with Nginx ────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

# Copy compiled Angular app (Angular 17+ builder outputs to browser/ subfolder)
COPY --from=builder /app/dist/frontend/browser /usr/share/nginx/html

# Nginx config is injected by docker-compose from the root nginx.conf
EXPOSE 80
