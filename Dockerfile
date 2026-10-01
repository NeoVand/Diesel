# Build on the deployment OS/CPU; the SDK installs its matching optional native binary.
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN npm install --global pnpm@12.4.2
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json vite.config.ts ./
COPY src ./src
COPY static ./static
RUN pnpm build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 BODY_SIZE_LIMIT=1M DIESEL_MCP_ORIGIN=http://127.0.0.1:3000
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/* \
    && npm install --global pnpm@12.4.2
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile
COPY --from=build /app/build ./build
USER node
EXPOSE 3000
CMD ["node", "build"]
