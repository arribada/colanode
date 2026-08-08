FROM node:22-alpine AS build

WORKDIR /app

# Toolchain for native deps (better-sqlite3) when a prebuilt binary is unavailable
RUN apk add --no-cache python3 make g++

# Copy root workspace files
COPY package.json package-lock.json ./

# Copy scripts
COPY ../../scripts scripts

# Copy assets
COPY ../../assets assets

# Copy all package.json files first
COPY ../../packages/core/package.json packages/core/package.json
COPY ../../packages/crdt/package.json packages/crdt/package.json
COPY ../../packages/client/package.json packages/client/package.json
COPY ../../packages/ui/package.json packages/ui/package.json
COPY ../../apps/web/package.json apps/web/package.json

# Install dependencies
RUN npm ci

# Copy source files
COPY ../../packages/core packages/core
COPY ../../packages/crdt packages/crdt
COPY ../../packages/client packages/client
COPY ../../packages/ui packages/ui
COPY ../../apps/web apps/web
COPY ../../tsconfig.base.json ./

# Build packages
RUN npm run build -w @colanode/core && \
    npm run build -w @colanode/crdt && \
    npm run build -w @colanode/client && \
    npm run build -w @colanode/ui && \
    npm run build -w @colanode/web

# Run unit tests as a build gate: a failing test fails `docker build`, so a
# regression can never reach the deploy on an otherwise-green build (the way
# the v161 sidebar-menu break shipped, because the image build only ran tsc).
# better-sqlite3 is compiled for this musl image by the toolchain above, so the
# native FTS test runs here too. Must precede the prune, which removes vitest.
RUN (cd packages/core && npx vitest run) && \
    (cd packages/client && npx vitest run) && \
    (cd packages/ui && npx vitest run)

# Strip dev dependencies from the final artifact
RUN npm prune --production


FROM nginx:1.27-alpine

COPY --from=build /app/apps/web/dist /usr/share/nginx/html

RUN cat <<'EOF' > /etc/nginx/conf.d/default.conf
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
