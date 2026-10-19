# syntax=docker/dockerfile:1.7
# One image: the API server (TypeScript run directly by Node's type stripping) serving the built web app.
FROM node:24-slim AS base
RUN npm install -g pnpm@12.9.1 && npm cache clean --force
WORKDIR /repo

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @scour/web...
COPY packages/core packages/core
COPY apps/web apps/web
RUN pnpm --filter @scour/web build

FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json packages/core/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --prod --filter @scour/server...

FROM node:24-slim AS runtime
ARG SCOUR_VERSION=dev
ENV NODE_ENV=production PORT=3120 SCOUR_DATA_DIR=/data SCOUR_WEB_DIST=/repo/apps/web/dist SCOUR_VERSION=${SCOUR_VERSION}
WORKDIR /repo/apps/server
COPY --from=prod-deps /repo/node_modules /repo/node_modules
COPY --from=prod-deps /repo/packages/core/node_modules /repo/packages/core/node_modules
COPY --from=prod-deps /repo/apps/server/node_modules ./node_modules
COPY packages/core/package.json /repo/packages/core/package.json
COPY packages/core/src /repo/packages/core/src
COPY apps/server/package.json ./package.json
COPY apps/server/src ./src
COPY --from=build /repo/apps/web/dist /repo/apps/web/dist
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3120
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "src/index.ts"]
