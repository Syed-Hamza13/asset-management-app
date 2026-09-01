# =========================================================
# Stage 1: Build React frontend
# =========================================================
FROM node:bookworm-slim AS frontend-builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json client/package-lock.json ./client/

WORKDIR /app/client
RUN npm ci

COPY client/ ./

ARG VITE_TURNSTILE_SITE_KEY
ENV VITE_TURNSTILE_SITE_KEY=$VITE_TURNSTILE_SITE_KEY

RUN npm run build

# =========================================================
# Stage 2: Production backend
# =========================================================
FROM node:bookworm-slim AS production

ENV NODE_ENV=production

WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/package-lock.json ./server/

WORKDIR /app/server
RUN npm ci --omit=dev

COPY server/src ./src
COPY server/migrations ./migrations

COPY --from=frontend-builder /app/client/dist /app/client/dist

EXPOSE 8073

CMD ["node", "src/server.js"]
