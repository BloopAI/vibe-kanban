# ===========================================
# Stage 1: Cargo Chef Planner
# Creates a "recipe" of dependencies for caching
# ===========================================
FROM lukemathwalker/cargo-chef:latest-rust-alpine AS planner

WORKDIR /app

# Copy Cargo files for dependency analysis
COPY Cargo.toml Cargo.lock ./
COPY crates/ ./crates/

# Create the recipe file (list of dependencies)
RUN cargo chef prepare --recipe-path recipe.json


# ===========================================
# Stage 2: Dependency Builder
# Builds ONLY dependencies (cached layer)
# ===========================================
FROM lukemathwalker/cargo-chef:latest-rust-alpine AS deps-builder

# Install build dependencies
# Note: sqlite-dev is required for unbundled SQLite to avoid linker conflicts
# between libsqlite3-sys (SQLx) and libsql-ffi (Turso)
RUN apk add --no-cache \
    curl \
    build-base \
    perl \
    llvm-dev \
    clang-dev \
    openssl-dev \
    openssl-libs-static \
    musl-dev \
    pkgconfig \
    sqlite-dev

# Allow linking on musl
# Note: --allow-multiple-definition is needed because both libsql-ffi (Turso) and
# libsqlite3-sys (SQLx) bundle SQLite, causing duplicate symbol conflicts.
# The linker will use the first definition found.
ENV RUSTFLAGS="-C target-feature=-crt-static -C link-arg=-Wl,--allow-multiple-definition"
ENV OPENSSL_STATIC=1
ENV OPENSSL_LIB_DIR=/usr/lib
ENV OPENSSL_INCLUDE_DIR=/usr/include

WORKDIR /app

# Copy ONLY the recipe (dependencies list)
COPY --from=planner /app/recipe.json recipe.json

# Build dependencies only - this layer is cached until Cargo.toml/Cargo.lock change
RUN cargo chef cook --release --recipe-path recipe.json


# ===========================================
# Stage 3: Application Builder
# Builds the actual application code
# ===========================================
FROM deps-builder AS builder

# Note: Node.js/Frontend build steps removed for backend-only deployment

WORKDIR /app

# Copy all source code
COPY . .

# Build the server binary (dependencies already cached from deps-builder)
RUN cargo build --release --bin server


# ===========================================
# Stage 4: Runtime
# Minimal production image
# ===========================================
FROM alpine:latest AS runtime

# Install runtime dependencies
# Note: sqlite-libs is required because we use unbundled SQLite (dynamic linking)
RUN apk add --no-cache \
    ca-certificates \
    tini \
    libgcc \
    wget \
    sqlite-libs

# Create app user for security
RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup

# Copy binary from builder
COPY --from=builder /app/target/release/server /usr/local/bin/server

# Copy seed database (will be copied to volume on first run)
COPY --from=builder /app/dev_assets/db.sqlite /seed/db.sqlite

# Copy entrypoint script
COPY --from=builder /app/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Create repos and data directories
RUN mkdir -p /repos /data && \
    chown -R appuser:appgroup /repos /data /seed

# Switch to non-root user
USER appuser

# Set runtime environment
ENV HOST=0.0.0.0
ENV PORT=3000
EXPOSE 3000

# Set working directory
WORKDIR /repos

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider "http://${HOST:-localhost}:${PORT:-3000}" || exit 1

# Run the application
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["docker-entrypoint.sh"]
