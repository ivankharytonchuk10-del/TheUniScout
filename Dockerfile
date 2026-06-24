# UniScout backend (serves the app API + the daily news-digest endpoint).
FROM node:20-slim

WORKDIR /app/server

# Install deps first (better build caching). better-sqlite3 needs build tools.
COPY server/package*.json ./
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
 && npm install --omit=dev \
 && apt-get purge -y python3 make g++ && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

# App code (server/) + the frontend it serves (design/) and review data.
COPY server/ ./
COPY design/ /app/design/

ENV PORT=4242
EXPOSE 4242
CMD ["node", "server.js"]
