# Toolchain for cross-compiling the Linux (musl) and Windows (MSVC) npx
# binaries from a Mac. Mirrors the build-backend job of
# .github/workflows/pre-release.yml: cargo-zigbuild for Linux, cargo-xwin for
# Windows. Built and run by scripts/release-local.sh.
FROM ubuntu:24.04

ARG RUST_TOOLCHAIN
ARG ZIG_VERSION=0.15.2
ARG CARGO_ZIGBUILD_VERSION=0.20.1
ARG CARGO_XWIN_VERSION=0.20.2

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates curl git xz-utils build-essential pkg-config \
    clang libclang-dev lld llvm nasm cmake ninja-build \
    clang-19 clang-tools-19 llvm-19 lld-19 \
  && rm -rf /var/lib/apt/lists/*

RUN arch="$(uname -m)" \
  && curl -fsSL "https://ziglang.org/download/${ZIG_VERSION}/zig-${arch}-linux-${ZIG_VERSION}.tar.xz" \
    | tar -xJ -C /opt \
  && ln -s "/opt/zig-${arch}-linux-${ZIG_VERSION}/zig" /usr/local/bin/zig

ENV RUSTUP_HOME=/opt/rustup \
    CARGO_HOME=/opt/cargo \
    PATH=/opt/cargo/bin:$PATH
RUN test -n "$RUST_TOOLCHAIN" \
  && curl -fsSL https://sh.rustup.rs \
    | sh -s -- -y --profile minimal --default-toolchain "$RUST_TOOLCHAIN" \
  && rustup component add --toolchain "$RUST_TOOLCHAIN" \
    rustfmt rust-src rust-analyzer \
  && rustup target add --toolchain "$RUST_TOOLCHAIN" \
    x86_64-unknown-linux-musl aarch64-unknown-linux-musl \
    x86_64-pc-windows-msvc aarch64-pc-windows-msvc \
  && cargo install --locked cargo-zigbuild --version "$CARGO_ZIGBUILD_VERSION" \
  && cargo install --locked cargo-xwin --version "$CARGO_XWIN_VERSION" \
  && rm -rf "$CARGO_HOME/registry" "$CARGO_HOME/git"

ENV CARGO_TARGET_DIR=/target \
    XWIN_CACHE_DIR=/xwin-cache
WORKDIR /src
