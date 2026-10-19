# Build once, run anywhere. Produces dist/index.cjs (server bundle) +
# dist/public (client). Build context is the REPO ROOT:
#   docker build -f app/Dockerfile .
# SQLite works out of the box; set DATABASE_URL for Postgres.
FROM node:22-slim AS build
WORKDIR /app
COPY app/package.json app/package-lock.json* ./
RUN npm ci
COPY app/tsconfig.json ./
COPY app/shared ./shared
COPY app/server ./server
COPY app/client ./client
COPY app/script ./script
COPY app/vite.config.ts app/postcss.config.js app/tailwind.config.ts app/components.json ./
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
# Chromium for the browser rung (playwright-core drives it via OPA_CHROME_PATH).
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-liberation \
 && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# Policy file is read at boot from disk (see policy.ts POLICY_FILE resolution).
COPY spec ./spec
EXPOSE 5000
CMD ["node", "dist/index.cjs"]
