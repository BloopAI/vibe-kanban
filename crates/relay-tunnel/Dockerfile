# syntax=docker/dockerfile:1.6

FROM rust:1.93-slim-bookworm AS builder

RUN apt-get update \
  && apt-get install -y --no-install-recommends pkg-config libssl-dev ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY rust-toolchain.toml Cargo.toml Cargo.lock ./
COPY crates crates
COPY shared shared
COPY assets assets

RUN mkdir -p /app/bin

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/app/target \
    cargo build --locked --release --manifest-path crates/relay-tunnel/Cargo.toml --features server \
 && cp crates/relay-tunnel/target/release/relay-server /app/bin/relay-server

FROM debian:bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates libssl3 wget \
  && rm -rf /var/lib/apt/lists/* \
  && useradd --system --create-home --uid 10001 appuser

COPY --from=builder /app/bin/relay-server /usr/local/bin/relay-server

USER appuser

ENV RELAY_LISTEN_ADDR=0.0.0.0:8082 \
    RUST_LOG=info

EXPOSE 8082

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["wget","--spider","-q","http://127.0.0.1:8082/health"]

ENTRYPOINT ["/usr/local/bin/relay-server"]
