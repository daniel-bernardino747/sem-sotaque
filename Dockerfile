# The image that runs in development (docker-compose.yml) and in production
# (Coolify builds it on every push to main, docs/deploy.md): the
# Next.js app beside the render toolchain — Tectonic for Selection → PDF, and
# poppler's pdftotext + Python's pypdf for scripts/measure-resume.py.

# Pinned, with .nvmrc and package.json's engines: the version production runs on.
# Bump all three together.
ARG NODE_VERSION=24.22.1

# ---- toolchain: what the render needs at runtime -----------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS toolchain

# Same version as the machine the template was tuned on: a Tectonic upgrade can
# move line breaks, and the page rules are measured to the line.
ARG TECTONIC_VERSION=0.16.9
ARG TARGETARCH

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl poppler-utils python3 python3-pypdf \
 && rm -rf /var/lib/apt/lists/*

RUN case "${TARGETARCH:-amd64}" in \
      amd64) triple=x86_64-unknown-linux-musl ;; \
      arm64) triple=aarch64-unknown-linux-musl ;; \
      *) echo "unsupported arch: ${TARGETARCH}" >&2; exit 1 ;; \
    esac \
 && curl -fsSL "https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%40${TECTONIC_VERSION}/tectonic-${TECTONIC_VERSION}-${triple}.tar.gz" \
    | tar -xz -C /usr/local/bin tectonic \
 && tectonic --version

# ---- deps --------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- build -------------------------------------------------------------------
FROM deps AS build
COPY . .
RUN npm run build

# ---- runtime -----------------------------------------------------------------
FROM toolchain AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
# Tectonic keeps its bundle (packages and the lmroman10 fonts) here. A fixed
# path, owned by the user the app runs as, so the cache warmed below is the one
# every render reads.
ENV TECTONIC_CACHE_DIR=/app/.cache/tectonic

COPY --from=build --chown=node:node /app ./
# WORKDIR made /app as root; COPY --chown covers only what it copied, and
# Tectonic must be able to create its cache directory under /app.
RUN chown node:node /app
USER node

# Warm the cache: one full render of the fixture downloads everything the
# template uses, so the first render in production fetches nothing.
RUN npm run render:fixture

EXPOSE 3000
# The migrations first, on every start: a deploy never serves code ahead of its
# database (the passo 26 deploy did, when the pre-deployment command did not
# apply them). Idempotent; a failure stops the container before it serves.
# Then `next start` itself through `exec`, not `npm start`: as PID 1 it gets the
# deploy's SIGTERM, drains open requests and exits 0. Behind npm, the container
# exits 1. `tsx` straight, not `npm run db:migrate`, which looks for a .env.
CMD ["sh", "-c", "node_modules/.bin/tsx scripts/db-migrate.ts && exec node_modules/.bin/next start"]
