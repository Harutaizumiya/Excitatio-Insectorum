FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS builder
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm db:generate
RUN pnpm --filter @repo/database build
RUN pnpm --filter @repo/server build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PATH="/app/packages/database/node_modules/.bin:/app/node_modules/.bin:$PATH"
COPY --from=builder --chown=node:node /app ./
RUN rm -f /app/packages/database/prisma/sqlite/dev.db /app/packages/database/prisma/sqlite/dev.db-journal \
    && mkdir -p /app/packages/database/prisma/sqlite \
    && chown -R node:node /app/packages/database/prisma/sqlite
USER node
EXPOSE 3000
CMD ["sh", "-c", "node packages/database/scripts/run-sqlite-prisma.mjs migrate deploy --schema prisma/sqlite/schema.prisma && node apps/server/dist/main.js"]
