# MUSO API image. Build from the REPO ROOT (it needs the pnpm workspace):
#   docker build -f apps/backend/Dockerfile .
# Railway uses this via /railway.json.
FROM node:22-bookworm-slim

# ffmpeg/ffprobe: video derivatives (media worker). openssl: Prisma engines.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable

WORKDIR /app
COPY . .

# Only the API and the workspace packages it depends on (skips the mobile app).
RUN pnpm install --frozen-lockfile --filter "@muso/backend..."
RUN pnpm --filter @muso/database db:generate \
  && pnpm --filter "@muso/backend..." run build

ENV NODE_ENV=production
EXPOSE 4000
# Railway injects PORT; migrations run as the pre-deploy step (see railway.json).
CMD ["node", "apps/backend/dist/main.js"]
