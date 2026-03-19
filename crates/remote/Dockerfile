# syntax=docker/dockerfile:1.6

ARG APP_NAME=remote
ARG FEATURES=""
ARG VITE_RELAY_API_BASE_URL=""
ARG VITE_PUBLIC_REACT_VIRTUOSO_LICENSE_KEY=""

FROM node:20-alpine AS fe-builder
ARG VITE_RELAY_API_BASE_URL
ARG VITE_PUBLIC_REACT_VIRTUOSO_LICENSE_KEY
WORKDIR /repo
ENV VITE_RELAY_API_BASE_URL=${VITE_RELAY_API_BASE_URL}
ENV VITE_PUBLIC_REACT_VIRTUOSO_LICENSE_KEY=${VITE_PUBLIC_REACT_VIRTUOSO_LICENSE_KEY}

RUN corepack enable

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/local-web/package.json packages/local-web/package.json
COPY packages/remote-web/package.json packages/remote-web/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/web-core/package.json packages/web-core/package.json

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

COPY packages/remote-web/ packages/remote-web/
COPY packages/local-web/tailwind.new.config.js packages/local-web/tailwind.new.config.js
COPY packages/public/ packages/public/
COPY packages/ui/ packages/ui/
COPY packages/web-core/ packages/web-core/
COPY shared/ shared/

RUN pnpm -C packages/remote-web build

FROM rust:1.93-slim-bookworm AS builder
ARG APP_NAME
ARG FEATURES
ARG POSTHOG_API_KEY=""
ARG POSTHOG_API_ENDPOINT=""
ARG SENTRY_DSN_REMOTE=""

ENV CARGO_REGISTRIES_CRATES_IO_PROTOCOL=sparse
ENV CARGO_NET_GIT_FETCH_WITH_CLI=true
ENV CARGO_TARGET_DIR=/app/target
ENV POSTHOG_API_KEY=${POSTHOG_API_KEY}
ENV POSTHOG_API_ENDPOINT=${POSTHOG_API_ENDPOINT}
ENV SENTRY_DSN_REMOTE=${SENTRY_DSN_REMOTE}

# Install build dependencies, plus git and openssh-client for private repo access
RUN apt-get update \
  && apt-get install -y --no-install-recommends pkg-config libssl-dev ca-certificates git openssh-client \
  && mkdir -p -m 0700 /root/.ssh \
  && ssh-keyscan github.com >> /root/.ssh/known_hosts \
  && chmod 600 /root/.ssh/known_hosts \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY rust-toolchain.toml ./
RUN cargo --version >/dev/null
COPY Cargo.toml Cargo.lock ./
# Copy workspace member manifests so Cargo can resolve workspace-shared deps
# without invalidating the build on every unrelated source change.
COPY crates/server/Cargo.toml crates/server/Cargo.toml
COPY crates/trusted-key-auth/Cargo.toml crates/trusted-key-auth/Cargo.toml
COPY crates/mcp/Cargo.toml crates/mcp/Cargo.toml
COPY crates/db/Cargo.toml crates/db/Cargo.toml
COPY crates/executors/Cargo.toml crates/executors/Cargo.toml
COPY crates/services/Cargo.toml crates/services/Cargo.toml
COPY crates/worktree-manager/Cargo.toml crates/worktree-manager/Cargo.toml
COPY crates/workspace-manager/Cargo.toml crates/workspace-manager/Cargo.toml
COPY crates/relay-control/Cargo.toml crates/relay-control/Cargo.toml
COPY crates/server-info/Cargo.toml crates/server-info/Cargo.toml
COPY crates/git/Cargo.toml crates/git/Cargo.toml
COPY crates/git-host/Cargo.toml crates/git-host/Cargo.toml
COPY crates/local-deployment/Cargo.toml crates/local-deployment/Cargo.toml
COPY crates/deployment/Cargo.toml crates/deployment/Cargo.toml
COPY crates/review/Cargo.toml crates/review/Cargo.toml
COPY crates/api-types crates/api-types
COPY crates/relay-types crates/relay-types
COPY crates/remote crates/remote
COPY crates/utils crates/utils
COPY assets assets

RUN mkdir -p /app/bin

# When building without FEATURES (self-hosted), strip the private billing dependency
# and its feature flag from Cargo.toml so cargo doesn't try to fetch the private git repo.
# Also remove the Cargo.lock which references the private repo.
RUN if [ -z "${FEATURES}" ]; then \
      sed -i '/^billing = {.*vibe-kanban-private.*/d' crates/remote/Cargo.toml; \
      sed -i '/^# private crate for billing/d' crates/remote/Cargo.toml; \
      sed -i 's/^vk-billing = \["dep:billing"\]/vk-billing = []/' crates/remote/Cargo.toml; \
      rm -f crates/remote/Cargo.lock; \
    fi

RUN --mount=type=cache,id=cargo-registry,target=/usr/local/cargo/registry \
    --mount=type=cache,id=cargo-git,target=/usr/local/cargo/git \
    --mount=type=cache,id=remote-target,target=/app/target \
    --mount=type=ssh \
    cargo build ${FEATURES:+--locked} --release --manifest-path crates/remote/Cargo.toml ${FEATURES:+--features ${FEATURES}} \
 && cp /app/target/release/${APP_NAME} /app/bin/${APP_NAME}

FROM debian:bookworm-slim AS runtime
ARG APP_NAME

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates libssl3 wget git \
  && rm -rf /var/lib/apt/lists/* \
  && useradd --system --create-home --uid 10001 appuser

WORKDIR /srv

COPY --from=builder /app/bin/${APP_NAME} /usr/local/bin/${APP_NAME}
COPY --from=fe-builder /repo/packages/remote-web/dist /srv/static

USER appuser

ENV SERVER_LISTEN_ADDR=0.0.0.0:8081 \
    RUST_LOG=info

EXPOSE 8081

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["wget","--spider","-q","http://127.0.0.1:8081/v1/health"]

ENTRYPOINT ["/usr/local/bin/remote"]
