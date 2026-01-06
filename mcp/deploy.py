#!/usr/bin/env python3
"""
Vibe Kanban Deployment Script

Deploy frontend and/or backend to Fly.io.

Usage:
    ./mcp/deploy.py                    # Deploy both frontend and backend
    ./mcp/deploy.py --backend          # Deploy backend only
    ./mcp/deploy.py --frontend         # Deploy frontend only
    ./mcp/deploy.py --backend --build-only  # Only build backend, don't deploy
    ./mcp/deploy.py --check            # Check prerequisites

Backend deployment:
    1. Cross-compile Rust binary for Linux (cargo-zigbuild)
    2. Build minimal Docker image with pre-built binary
    3. Deploy to Fly.io (vibe-kanban-api.fly.dev)

Frontend deployment:
    1. Build with Vite (includes VITE_API_URL pointing to backend)
    2. Deploy to Fly.io (scho1ar.fly.dev)

Prerequisites:
    - Rust toolchain with x86_64-unknown-linux-musl target
    - cargo-zigbuild (cargo install cargo-zigbuild)
    - zig (brew install zig)
    - flyctl (brew install flyctl)
    - Docker (for local image build)
    - Node.js/pnpm (for frontend)
"""

import subprocess
import sys
import os
import time
import argparse
from pathlib import Path

# Configuration
PROJECT_ROOT = Path(__file__).parent.parent
TARGET = "x86_64-unknown-linux-musl"
BINARY_NAME = "server"
CARGO_BIN = Path.home() / ".cargo" / "bin"

# Fly.io configs
BACKEND_CONFIG = "fly.api.toml"
BACKEND_DOCKERFILE = "Dockerfile.prebuilt"
BACKEND_URL = "https://vibe-kanban-api.fly.dev"

FRONTEND_CONFIG = "fly.frontend.toml"
FRONTEND_URL = "https://scho1ar.fly.dev"

# Add cargo bin to PATH if not already there
if str(CARGO_BIN) not in os.environ.get("PATH", ""):
    os.environ["PATH"] = f"{CARGO_BIN}:{os.environ.get('PATH', '')}"


class Colors:
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    BOLD = '\033[1m'
    END = '\033[0m'


def log(msg: str, color: str = Colors.GREEN):
    print(f"{color}{Colors.BOLD}==>{Colors.END} {msg}")


def log_step(msg: str):
    print(f"  {Colors.BLUE}→{Colors.END} {msg}")


def log_error(msg: str):
    print(f"{Colors.RED}{Colors.BOLD}ERROR:{Colors.END} {msg}")


def log_warning(msg: str):
    print(f"{Colors.YELLOW}{Colors.BOLD}WARN:{Colors.END} {msg}")


def log_section(msg: str):
    print(f"\n{Colors.CYAN}{Colors.BOLD}{'─' * 50}{Colors.END}")
    print(f"{Colors.CYAN}{Colors.BOLD}{msg}{Colors.END}")
    print(f"{Colors.CYAN}{Colors.BOLD}{'─' * 50}{Colors.END}\n")


def run_command(cmd: list[str], cwd: Path = None, check: bool = True, capture: bool = False) -> subprocess.CompletedProcess:
    """Run a command and handle errors."""
    cwd = cwd or PROJECT_ROOT
    log_step(f"Running: {' '.join(cmd)}")

    try:
        result = subprocess.run(
            cmd,
            cwd=cwd,
            check=check,
            capture_output=capture,
            text=True
        )
        return result
    except subprocess.CalledProcessError as e:
        log_error(f"Command failed with exit code {e.returncode}")
        if capture and e.stderr:
            print(e.stderr)
        raise


def check_prerequisites(backend: bool = True, frontend: bool = True) -> bool:
    """Check all required tools are installed."""
    log("Checking prerequisites...")

    all_ok = True

    # Common checks
    common_checks = [
        ("flyctl", ["flyctl", "version"]),
        ("docker", ["docker", "--version"]),
    ]

    # Backend-specific checks
    backend_checks = [
        ("rustc", ["rustc", "--version"]),
        ("cargo", ["cargo", "--version"]),
        ("cargo-zigbuild", ["cargo-zigbuild", "--version"]),
        ("zig", ["zig", "version"]),
    ]

    # Frontend-specific checks
    frontend_checks = [
        ("node", ["node", "--version"]),
        ("pnpm", ["pnpm", "--version"]),
    ]

    checks = common_checks
    if backend:
        checks.extend(backend_checks)
    if frontend:
        checks.extend(frontend_checks)

    for name, cmd in checks:
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            version = result.stdout.strip().split('\n')[0]
            log_step(f"✓ {name}: {version}")
        except (subprocess.CalledProcessError, FileNotFoundError):
            log_error(f"✗ {name} not found")
            all_ok = False

    # Check musl target for backend
    if backend:
        log_step("Checking musl target...")
        result = subprocess.run(
            ["rustup", "target", "list", "--installed"],
            capture_output=True, text=True
        )
        if TARGET not in result.stdout:
            log_warning(f"Target {TARGET} not installed. Installing...")
            run_command(["rustup", "target", "add", TARGET])
        else:
            log_step(f"✓ Target {TARGET} installed")

    return all_ok


# ============================================================================
# Backend Deployment
# ============================================================================

def build_backend_binary() -> Path:
    """Cross-compile the Rust binary for Linux."""
    log("Building Linux binary with cargo-zigbuild...")

    start_time = time.time()

    run_command([
        "cargo", "zigbuild",
        "--release",
        "--bin", BINARY_NAME,
        "--target", TARGET
    ])

    elapsed = time.time() - start_time
    binary_path = PROJECT_ROOT / "target" / TARGET / "release" / BINARY_NAME

    if not binary_path.exists():
        log_error(f"Binary not found at {binary_path}")
        sys.exit(1)

    size_mb = binary_path.stat().st_size / (1024 * 1024)
    log_step(f"✓ Binary built: {binary_path}")
    log_step(f"✓ Size: {size_mb:.1f} MB")
    log_step(f"✓ Build time: {elapsed:.1f}s")

    return binary_path


def verify_backend_binary(binary_path: Path) -> bool:
    """Verify the binary is a valid Linux executable."""
    log("Verifying binary...")

    result = subprocess.run(
        ["file", str(binary_path)],
        capture_output=True, text=True
    )

    output = result.stdout
    log_step(output.strip())

    if "ELF 64-bit" not in output or "x86-64" not in output:
        log_error("Binary is not a valid Linux x86_64 executable")
        return False

    if "statically linked" in output:
        log_step("✓ Statically linked (good for Alpine)")

    return True


def deploy_backend() -> bool:
    """Deploy backend to Fly.io."""
    log("Deploying backend to Fly.io...")

    config_path = PROJECT_ROOT / BACKEND_CONFIG
    if not config_path.exists():
        log_error(f"Fly config not found: {config_path}")
        return False

    dockerfile_path = PROJECT_ROOT / BACKEND_DOCKERFILE
    if not dockerfile_path.exists():
        log_error(f"Dockerfile not found: {dockerfile_path}")
        return False

    start_time = time.time()

    try:
        run_command([
            "flyctl", "deploy",
            "--config", BACKEND_CONFIG,
            "--local-only"
        ])

        elapsed = time.time() - start_time
        log_step(f"✓ Backend deployed in {elapsed:.1f}s")
        return True

    except subprocess.CalledProcessError:
        log_error("Backend deployment failed")
        return False


def verify_backend() -> bool:
    """Verify the backend deployment."""
    log("Verifying backend deployment...")

    import urllib.request
    import json

    endpoints = [
        (f"{BACKEND_URL}/", "Backend API Running"),
        (f"{BACKEND_URL}/api/health", None),
    ]

    for url, expected in endpoints:
        try:
            log_step(f"Testing {url}")
            with urllib.request.urlopen(url, timeout=10) as response:
                data = response.read().decode()

                if expected and expected not in data:
                    log_warning(f"Unexpected response: {data[:100]}")
                else:
                    try:
                        parsed = json.loads(data)
                        if parsed.get("success"):
                            log_step(f"✓ {url} - OK")
                        else:
                            log_warning(f"Response: {data[:100]}")
                    except json.JSONDecodeError:
                        log_step(f"✓ {url} - {data[:50]}")

        except Exception as e:
            log_error(f"Failed to reach {url}: {e}")
            return False

    return True


# ============================================================================
# Frontend Deployment
# ============================================================================

def deploy_frontend() -> bool:
    """Deploy frontend to Fly.io."""
    log("Deploying frontend to Fly.io...")

    config_path = PROJECT_ROOT / FRONTEND_CONFIG
    if not config_path.exists():
        log_error(f"Fly config not found: {config_path}")
        return False

    start_time = time.time()

    try:
        run_command([
            "flyctl", "deploy",
            "--config", FRONTEND_CONFIG
        ])

        elapsed = time.time() - start_time
        log_step(f"✓ Frontend deployed in {elapsed:.1f}s")
        return True

    except subprocess.CalledProcessError:
        log_error("Frontend deployment failed")
        return False


def verify_frontend() -> bool:
    """Verify the frontend deployment."""
    log("Verifying frontend deployment...")

    import urllib.request

    try:
        log_step(f"Testing {FRONTEND_URL}")
        with urllib.request.urlopen(FRONTEND_URL, timeout=10) as response:
            if response.status == 200:
                log_step(f"✓ {FRONTEND_URL} - OK")
                return True
            else:
                log_warning(f"Unexpected status: {response.status}")
                return False
    except Exception as e:
        log_error(f"Failed to reach {FRONTEND_URL}: {e}")
        return False


# ============================================================================
# Main
# ============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Deploy Vibe Kanban to Fly.io",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    ./mcp/deploy.py                    # Deploy both
    ./mcp/deploy.py --backend          # Backend only
    ./mcp/deploy.py --frontend         # Frontend only
    ./mcp/deploy.py --backend --build-only  # Build backend only
    ./mcp/deploy.py --check            # Check prerequisites

URLs:
    Backend:  https://vibe-kanban-api.fly.dev
    Frontend: https://scho1ar.fly.dev
"""
    )

    parser.add_argument("--backend", action="store_true", help="Deploy backend only")
    parser.add_argument("--frontend", action="store_true", help="Deploy frontend only")
    parser.add_argument("--build-only", action="store_true", help="Only build backend, don't deploy")
    parser.add_argument("--deploy-only", action="store_true", help="Only deploy backend (use existing binary)")
    parser.add_argument("--check", action="store_true", help="Only check prerequisites")
    parser.add_argument("--no-verify", action="store_true", help="Skip deployment verification")

    args = parser.parse_args()

    # Default: deploy both if neither specified
    deploy_backend_flag = args.backend or (not args.backend and not args.frontend)
    deploy_frontend_flag = args.frontend or (not args.backend and not args.frontend)

    os.chdir(PROJECT_ROOT)

    print(f"\n{Colors.BOLD}Vibe Kanban Deployment{Colors.END}")
    print(f"{'=' * 40}")

    targets = []
    if deploy_backend_flag:
        targets.append("Backend")
    if deploy_frontend_flag:
        targets.append("Frontend")
    print(f"Targets: {', '.join(targets)}\n")

    # Check prerequisites
    if not check_prerequisites(backend=deploy_backend_flag, frontend=deploy_frontend_flag):
        log_error("Prerequisites check failed")
        sys.exit(1)

    if args.check:
        log("All prerequisites satisfied!")
        sys.exit(0)

    # ========== Backend ==========
    if deploy_backend_flag:
        log_section("BACKEND DEPLOYMENT")

        # Build binary
        if not args.deploy_only:
            binary_path = build_backend_binary()
            if not verify_backend_binary(binary_path):
                sys.exit(1)
        else:
            binary_path = PROJECT_ROOT / "target" / TARGET / "release" / BINARY_NAME
            if not binary_path.exists():
                log_error(f"Binary not found. Run without --deploy-only first.")
                sys.exit(1)
            log("Using existing binary...")
            verify_backend_binary(binary_path)

        if args.build_only:
            log("Backend build complete! Use --deploy-only to deploy.")
        else:
            # Deploy
            if not deploy_backend():
                sys.exit(1)

            # Verify
            if not args.no_verify:
                log("Waiting for backend to start...")
                time.sleep(5)
                if not verify_backend():
                    log_warning("Backend verification had issues")

    # ========== Frontend ==========
    if deploy_frontend_flag and not args.build_only:
        log_section("FRONTEND DEPLOYMENT")

        if not deploy_frontend():
            sys.exit(1)

        # Verify
        if not args.no_verify:
            log("Waiting for frontend to start...")
            time.sleep(3)
            if not verify_frontend():
                log_warning("Frontend verification had issues")

    # ========== Summary ==========
    print(f"\n{Colors.GREEN}{Colors.BOLD}{'=' * 40}{Colors.END}")
    print(f"{Colors.GREEN}{Colors.BOLD}✓ Deployment complete!{Colors.END}")
    print(f"{Colors.GREEN}{Colors.BOLD}{'=' * 40}{Colors.END}")

    if deploy_backend_flag and not args.build_only:
        print(f"  Backend:  {BACKEND_URL}")
    if deploy_frontend_flag and not args.build_only:
        print(f"  Frontend: {FRONTEND_URL}")
    print()


if __name__ == "__main__":
    main()
