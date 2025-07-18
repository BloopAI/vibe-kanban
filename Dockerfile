FROM node:18-alpine

# Install Rust and dependencies
RUN apk add --no-cache curl build-base perl tini
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

# Set working directory
WORKDIR /app

# Copy package files first for dependency caching
COPY package*.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package*.json ./frontend/
COPY npx-cli/package*.json ./npx-cli/

# Install pnpm and dependencies (cached if package files unchanged)
RUN npm install -g pnpm
RUN pnpm install

# Copy Rust dependencies for cargo cache
COPY backend/ ./backend/
COPY Cargo.toml ./
RUN cargo build --release --manifest-path backend/Cargo.toml

COPY frontend/ ./frontend/
COPY shared/ ./shared/
RUN pnpm run frontend:build

# Copy scripts for build
COPY scripts/ ./scripts/
RUN pnpm run backend:build

# Expose port
ENV BACKEND_PORT=8000
ENV FRONTEND_PORT=3000
ENV HOST=0.0.0.0
EXPOSE 8000
EXPOSE 3000

# Run the application
WORKDIR /repos
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/app/target/release/vibe-kanban"]
