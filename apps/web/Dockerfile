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

    # Build output, named after a hash of its own content: the same URL can
    # never mean anything else, so a browser may keep it and stop asking. No
    # header was sent before, which left every visitor without a service
    # worker revalidating the whole shell on each load.
    location ~ "^/assets/.+-[A-Za-z0-9_-]{8,}\.(js|css|woff2?)$" {
        try_files $uri =404;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
    }

    # A hashed asset that no longer exists must 404, never fall through to
    # the SPA shell. Answering index.html under a .js URL makes the browser
    # try to execute HTML as a module, and - far worse - lets the service
    # worker cache that HTML under the .js URL, after which no reload,
    # however hard, can recover the tab.
    #
    # The rest of /assets/ keeps its name from one build to the next (the
    # emoji and icon sprites, the app images, the fonts), so it is held for a
    # day only: long enough to stop the repeated requests, short enough that
    # a replaced image reaches everyone the next day.
    location /assets/ {
        try_files $uri =404;
        add_header Cache-Control "public, max-age=86400" always;
    }

    # The shell and the service worker decide what every other file is, so
    # they are always revalidated.
    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache" always;
    }
}
EOF

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
