# syntax=docker/dockerfile:1.6

FROM node:24-alpine AS fe-builder

ARG POSTHOG_API_KEY=""
ARG POSTHOG_API_ENDPOINT=""

WORKDIR /app

ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}
ENV VITE_PUBLIC_POSTHOG_KEY=${POSTHOG_API_KEY}
ENV VITE_PUBLIC_POSTHOG_HOST=${POSTHOG_API_ENDPOINT}
ENV NODE_OPTIONS=--max-old-space-size=4096

RUN corepack enable
RUN pnpm config set store-dir /pnpm/store

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/local-web/package.json packages/local-web/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/web-core/package.json packages/web-core/package.json

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

COPY packages/local-web/ packages/local-web/
COPY packages/public/ packages/public/
COPY packages/ui/ packages/ui/
COPY packages/web-core/ packages/web-core/
COPY shared/ shared/

RUN pnpm -C packages/local-web build

FROM rust:1.93-slim-bookworm AS builder

ARG POSTHOG_API_KEY=""
ARG POSTHOG_API_ENDPOINT=""
ARG SENTRY_DSN=""
ARG VK_SHARED_API_BASE=""

ENV CARGO_REGISTRIES_CRATES_IO_PROTOCOL=sparse
ENV CARGO_NET_GIT_FETCH_WITH_CLI=true
ENV CARGO_TARGET_DIR=/app/target
ENV POSTHOG_API_KEY=${POSTHOG_API_KEY}
ENV POSTHOG_API_ENDPOINT=${POSTHOG_API_ENDPOINT}
ENV SENTRY_DSN=${SENTRY_DSN}
ENV VK_SHARED_API_BASE=${VK_SHARED_API_BASE}

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    build-essential \
    ca-certificates \
    git \
    libclang-dev \
    libssl-dev \
    pkg-config \
  && rm -rf /var/lib/apt/lists/*

COPY rust-toolchain.toml ./
RUN cargo --version >/dev/null

COPY Cargo.toml Cargo.lock ./
COPY crates/api-types/Cargo.toml crates/api-types/Cargo.toml
COPY crates/db/Cargo.toml crates/db/Cargo.toml
COPY crates/deployment/Cargo.toml crates/deployment/Cargo.toml
COPY crates/executors/Cargo.toml crates/executors/Cargo.toml
COPY crates/git/Cargo.toml crates/git/Cargo.toml
COPY crates/git-host/Cargo.toml crates/git-host/Cargo.toml
COPY crates/local-deployment/Cargo.toml crates/local-deployment/Cargo.toml
COPY crates/mcp/Cargo.toml crates/mcp/Cargo.toml
COPY crates/relay-control/Cargo.toml crates/relay-control/Cargo.toml
COPY crates/relay-hosts/Cargo.toml crates/relay-hosts/Cargo.toml
COPY crates/relay-protocol/Cargo.toml crates/relay-protocol/Cargo.toml
COPY crates/relay-tunnel-core/Cargo.toml crates/relay-tunnel-core/Cargo.toml
COPY crates/relay-webrtc/Cargo.toml crates/relay-webrtc/Cargo.toml
COPY crates/relay-ws/Cargo.toml crates/relay-ws/Cargo.toml
COPY crates/review/Cargo.toml crates/review/Cargo.toml
COPY crates/server/Cargo.toml crates/server/Cargo.toml
COPY crates/server-info/Cargo.toml crates/server-info/Cargo.toml
COPY crates/services/Cargo.toml crates/services/Cargo.toml
COPY crates/tauri-app/Cargo.toml crates/tauri-app/Cargo.toml
COPY crates/trusted-key-auth/Cargo.toml crates/trusted-key-auth/Cargo.toml
COPY crates/utils/Cargo.toml crates/utils/Cargo.toml
COPY crates/workspace-manager/Cargo.toml crates/workspace-manager/Cargo.toml
COPY crates/worktree-manager/Cargo.toml crates/worktree-manager/Cargo.toml
COPY crates/ws-bridge/Cargo.toml crates/ws-bridge/Cargo.toml

COPY crates/api-types/ crates/api-types/
COPY crates/db/ crates/db/
COPY crates/deployment/ crates/deployment/
COPY crates/executors/ crates/executors/
COPY crates/git/ crates/git/
COPY crates/git-host/ crates/git-host/
COPY crates/local-deployment/ crates/local-deployment/
COPY crates/mcp/ crates/mcp/
COPY crates/relay-control/ crates/relay-control/
COPY crates/relay-hosts/ crates/relay-hosts/
COPY crates/relay-protocol/ crates/relay-protocol/
COPY crates/relay-tunnel-core/ crates/relay-tunnel-core/
COPY crates/relay-webrtc/ crates/relay-webrtc/
COPY crates/relay-ws/ crates/relay-ws/
COPY crates/review/ crates/review/
COPY crates/server/ crates/server/
COPY crates/server-info/ crates/server-info/
COPY crates/services/ crates/services/
COPY crates/trusted-key-auth/ crates/trusted-key-auth/
COPY crates/utils/ crates/utils/
COPY crates/workspace-manager/ crates/workspace-manager/
COPY crates/worktree-manager/ crates/worktree-manager/
COPY crates/ws-bridge/ crates/ws-bridge/
COPY assets/ assets/
COPY --from=fe-builder /app/packages/local-web/dist packages/local-web/dist

RUN --mount=type=cache,id=cargo-registry,target=/usr/local/cargo/registry \
    --mount=type=cache,id=cargo-git,target=/usr/local/cargo/git \
    --mount=type=cache,id=workspace-target,target=/app/target \
    cargo build --locked --release --bin server \
 && cp /app/target/release/server /usr/local/bin/server

FROM debian:bookworm-slim AS runtime

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    git \
    openssh-client \
    tini \
    wget \
  && rm -rf /var/lib/apt/lists/* \
  && useradd --system --create-home --uid 10001 appuser

WORKDIR /repos

COPY --from=builder /usr/local/bin/server /usr/local/bin/server

RUN mkdir -p /repos \
  && chown -R appuser:appuser /repos

USER appuser

ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["/bin/sh", "-c", "wget --spider -q http://127.0.0.1:${PORT:-3000}/health"]

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/server"]
