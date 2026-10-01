FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN npm install --global pnpm@12.4.2
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY tsconfig.json vite.config.ts ./
COPY scripts ./scripts
COPY src ./src
COPY static ./static
ARG ENGINE_ASSET_PACKAGE_KEY=
ENV ENGINE_ASSET_PACKAGE_KEY=$ENGINE_ASSET_PACKAGE_KEY
RUN pnpm prepare && pnpm build

# Only static files ship. No application Node/Python process or AI key.
FROM nginx:stable-alpine
COPY deployment/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build /usr/share/nginx/html
EXPOSE 8080
