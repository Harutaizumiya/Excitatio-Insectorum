FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS manifests
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server-elysia/package.json ./apps/server-elysia/package.json
COPY packages/database/package.json ./packages/database/package.json
COPY packages/eslint-config/package.json ./packages/eslint-config/package.json
COPY packages/typescript-config/package.json ./packages/typescript-config/package.json

FROM manifests AS builder
RUN pnpm --filter @repo/server-elysia... install --frozen-lockfile --ignore-scripts
COPY apps/server-elysia ./apps/server-elysia
COPY packages/database ./packages/database
COPY packages/typescript-config ./packages/typescript-config
RUN pnpm --filter @repo/database db:generate
RUN pnpm --filter @repo/database build
RUN pnpm --filter @repo/server-elysia build

# Install into a clean workspace so no frontend or development dependencies survive.
FROM manifests AS production-deps
RUN pnpm --filter @repo/server-elysia --filter @repo/database install --prod --frozen-lockfile --ignore-scripts
COPY packages/database/scripts ./packages/database/scripts
COPY packages/database/prisma ./packages/database/prisma
RUN pnpm --filter @repo/database db:generate
COPY deploy/split-pnpm-store.mjs ./deploy/split-pnpm-store.mjs
RUN node ./deploy/split-pnpm-store.mjs \
    /app/node_modules/.pnpm \
    /tmp/pnpm-groups \
    /tmp/root-node-modules \
    8

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PATH="/app/packages/database/node_modules/.bin:/app/node_modules/.bin:$PATH"
COPY --from=production-deps --chown=node:node /tmp/pnpm-groups/0/ ./node_modules/.pnpm/
COPY --from=production-deps --chown=node:node /tmp/pnpm-groups/1/ ./node_modules/.pnpm/
COPY --from=production-deps --chown=node:node /tmp/pnpm-groups/2/ ./node_modules/.pnpm/
COPY --from=production-deps --chown=node:node /tmp/pnpm-groups/3/ ./node_modules/.pnpm/
COPY --from=production-deps --chown=node:node /tmp/pnpm-groups/4/ ./node_modules/.pnpm/
COPY --from=production-deps --chown=node:node /tmp/pnpm-groups/5/ ./node_modules/.pnpm/
COPY --from=production-deps --chown=node:node /tmp/pnpm-groups/6/ ./node_modules/.pnpm/
COPY --from=production-deps --chown=node:node /tmp/pnpm-groups/7/ ./node_modules/.pnpm/
COPY --from=production-deps --chown=node:node /tmp/root-node-modules/ ./node_modules/
COPY --from=production-deps --chown=node:node /app/apps/server-elysia/node_modules ./apps/server-elysia/node_modules
COPY --from=production-deps --chown=node:node /app/packages/database/node_modules ./packages/database/node_modules
COPY --from=builder --chown=node:node /app/apps/server-elysia/dist ./apps/server-elysia/dist
COPY --from=builder --chown=node:node /app/packages/database/dist ./packages/database/dist
COPY --chown=node:node apps/server-elysia/package.json ./apps/server-elysia/package.json
COPY --chown=node:node packages/database/package.json ./packages/database/package.json
COPY --chown=node:node packages/database/scripts ./packages/database/scripts
COPY --chown=node:node packages/database/prisma ./packages/database/prisma
USER node
EXPOSE 3000
CMD ["sh", "-c", "node packages/database/scripts/run-sqlite-prisma.mjs migrate deploy --schema prisma/sqlite/schema.prisma && node apps/server-elysia/dist/index.js"]
