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
RUN cargo chef cook --release --recipe-path recipe.json --features turso


# ===========================================
# Stage 3: Application Builder
# Builds the actual application code
# ===========================================
FROM deps-builder AS builder

# Install Node.js for frontend build
RUN apk add --no-cache nodejs npm

# Install pnpm
RUN npm install -g pnpm

# Build args for frontend
ARG POSTHOG_API_KEY
ARG POSTHOG_API_ENDPOINT
ARG VITE_CLERK_PUBLISHABLE_KEY

ENV VITE_PUBLIC_POSTHOG_KEY=$POSTHOG_API_KEY
ENV VITE_PUBLIC_POSTHOG_HOST=$POSTHOG_API_ENDPOINT
ENV VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY

WORKDIR /app

# Copy package files for Node dependency caching
COPY package*.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package*.json ./frontend/
COPY npx-cli/package*.json ./npx-cli/

# Install Node dependencies
RUN pnpm install

# Copy all source code
COPY . .

# Generate TypeScript types from Rust
RUN npm run generate-types

# Build frontend
RUN cd frontend && pnpm run build

# Build the server binary (dependencies already cached from deps-builder)
RUN cargo build --release --bin server --features turso


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

# Create repos directory and set permissions
RUN mkdir -p /repos && \
    chown -R appuser:appgroup /repos

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
CMD ["server"]
