#!/usr/bin/env python3
"""
Vibe Kanban Deployment Script (Railway)

Deploy frontend and/or backend to Railway.

Usage:
    ./mcp/deploy.py                    # Deploy both frontend and backend
    ./mcp/deploy.py --backend          # Deploy backend only
    ./mcp/deploy.py --frontend         # Deploy frontend only
    ./mcp/deploy.py --check            # Check prerequisites

Backend deployment:
    1. Deploy to Railway (uses Dockerfile in project root)
    2. Railway builds and deploys automatically

Frontend deployment:
    1. Build with Vite
    2. Deploy to Railway frontend service

Prerequisites:
    - Railway CLI (brew install railway)
    - Node.js/pnpm (for frontend build)
    - Docker (optional, Railway can build remotely)
"""

import subprocess
import sys
import os
import time
import argparse
import json
from pathlib import Path

# Configuration
PROJECT_ROOT = Path(__file__).parent.parent

# Railway configs - Backend
RAILWAY_PROJECT_ID = "9661a956-d8c2-4bd2-a16b-05e320b85965"
BACKEND_SERVICE_ID = "db8a22cf-beb2-4d00-bc0e-0e80c1e1e661"
BACKEND_ENVIRONMENT_ID = "439b9533-a138-4982-8407-ada14aca9a1f"
BACKEND_URL = "https://api.scho1ar.com"

# Railway configs - Frontend (separate project)
FRONTEND_PROJECT_ID = "af8b1a5e-f0e0-4640-96ba-298335a85d48"
FRONTEND_SERVICE_ID = "fd827df3-1f51-483c-a798-7c5d39610c46"
FRONTEND_ENVIRONMENT_ID = "7dd40b1a-0e61-4069-9f41-e008d9444e85"
FRONTEND_URL = "https://app.scho1ar.com"

RAILWAY_ENVIRONMENT = "production"


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


def run_command(cmd: list[str], cwd: Path = None, check: bool = True, capture: bool = False, env: dict = None) -> subprocess.CompletedProcess:
    """Run a command and handle errors."""
    cwd = cwd or PROJECT_ROOT
    cmd_env = os.environ.copy()
    if env:
        cmd_env.update(env)

    log_step(f"Running: {' '.join(cmd)}")

    try:
        result = subprocess.run(
            cmd,
            cwd=cwd,
            check=check,
            capture_output=capture,
            text=True,
            env=cmd_env
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
        ("railway", ["railway", "--version"]),
    ]

    # Frontend-specific checks
    frontend_checks = [
        ("node", ["node", "--version"]),
        ("pnpm", ["pnpm", "--version"]),
    ]

    checks = common_checks
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

    # Check Railway auth
    log_step("Checking Railway authentication...")
    try:
        result = subprocess.run(
            ["railway", "whoami"],
            capture_output=True, text=True, check=True
        )
        log_step(f"✓ Logged in as: {result.stdout.strip()}")
    except subprocess.CalledProcessError:
        log_error("Not logged in to Railway. Run: railway login")
        all_ok = False

    # Check Railway project link
    log_step("Checking Railway project link...")
    try:
        result = subprocess.run(
            ["railway", "status"],
            capture_output=True, text=True, check=True, cwd=PROJECT_ROOT
        )
        if "Project:" in result.stdout:
            log_step(f"✓ Project linked")
        else:
            log_warning("No project linked. Run: railway link")
    except subprocess.CalledProcessError:
        log_warning("Could not check project status")

    return all_ok


# ============================================================================
# Backend Deployment
# ============================================================================

def deploy_backend(detach: bool = False) -> bool:
    """Deploy backend to Railway."""
    log("Deploying backend to Railway...")

    start_time = time.time()

    # Set environment variables for Railway service linking
    env = {
        "RAILWAY_PROJECT_ID": RAILWAY_PROJECT_ID,
        "RAILWAY_SERVICE_ID": BACKEND_SERVICE_ID,
        "RAILWAY_ENVIRONMENT_ID": BACKEND_ENVIRONMENT_ID
    }

    try:
        cmd = ["railway", "up"]
        if detach:
            cmd.append("--detach")

        run_command(cmd, env=env)

        elapsed = time.time() - start_time
        log_step(f"✓ Backend deployment initiated in {elapsed:.1f}s")

        if detach:
            log_step("Deployment running in background. Check Railway dashboard for status.")

        return True

    except subprocess.CalledProcessError:
        log_error("Backend deployment failed")
        return False


def verify_backend() -> bool:
    """Verify the backend deployment."""
    log("Verifying backend deployment...")

    import urllib.request

    endpoints = [
        (f"{BACKEND_URL}/api/teams", "teams"),
    ]

    for url, name in endpoints:
        try:
            log_step(f"Testing {url}")
            req = urllib.request.Request(url, headers={'User-Agent': 'deploy-verify'})
            with urllib.request.urlopen(req, timeout=30) as response:
                data = response.read().decode()
                try:
                    parsed = json.loads(data)
                    if parsed.get("success"):
                        log_step(f"✓ {name} endpoint - OK")
                    else:
                        log_warning(f"Response: {data[:100]}")
                except json.JSONDecodeError:
                    log_step(f"✓ {name} - {data[:50]}")

        except Exception as e:
            log_error(f"Failed to reach {url}: {e}")
            return False

    return True


# ============================================================================
# Frontend Deployment
# ============================================================================

def build_frontend() -> bool:
    """Build frontend for production."""
    log("Building frontend...")

    frontend_dir = PROJECT_ROOT / "frontend"

    # Install dependencies
    try:
        run_command(["pnpm", "install"], cwd=PROJECT_ROOT)
    except subprocess.CalledProcessError:
        log_error("Failed to install dependencies")
        return False

    # Build frontend with Railway backend URL
    try:
        env = {
            "VITE_API_URL": BACKEND_URL
        }
        run_command(["pnpm", "run", "build"], cwd=frontend_dir, env=env)
        log_step("✓ Frontend built successfully")
        return True
    except subprocess.CalledProcessError:
        log_error("Frontend build failed")
        return False


def deploy_frontend(detach: bool = False) -> bool:
    """Deploy frontend to Railway."""

    if not FRONTEND_SERVICE_ID:
        log_warning("No frontend service configured. Frontend deployment skipped.")
        log_step("To deploy frontend, either:")
        log_step("  1. Create a Railway frontend service and set FRONTEND_SERVICE_ID")
        log_step("  2. Use a static hosting service (Vercel, Netlify, etc.)")
        return True  # Not a failure, just not configured

    log("Deploying frontend to Railway...")

    start_time = time.time()

    # Set environment variables for Railway service linking (frontend is in separate project)
    env = {
        "RAILWAY_PROJECT_ID": FRONTEND_PROJECT_ID,
        "RAILWAY_SERVICE_ID": FRONTEND_SERVICE_ID,
        "RAILWAY_ENVIRONMENT_ID": FRONTEND_ENVIRONMENT_ID
    }

    try:
        cmd = ["railway", "up"]
        if detach:
            cmd.append("--detach")

        run_command(cmd, cwd=PROJECT_ROOT / "frontend", env=env)

        elapsed = time.time() - start_time
        log_step(f"✓ Frontend deployment initiated in {elapsed:.1f}s")
        return True

    except subprocess.CalledProcessError:
        log_error("Frontend deployment failed")
        return False


def verify_frontend() -> bool:
    """Verify the frontend deployment."""
    if not FRONTEND_SERVICE_ID:
        return True  # Skip if not configured

    log("Verifying frontend deployment...")

    import urllib.request

    try:
        log_step(f"Testing {FRONTEND_URL}")
        req = urllib.request.Request(FRONTEND_URL, headers={'User-Agent': 'deploy-verify'})
        with urllib.request.urlopen(req, timeout=30) as response:
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
# Logs
# ============================================================================

def show_logs(service: str = "backend", lines: int = 50):
    """Show Railway logs for a service."""
    log(f"Fetching {service} logs...")

    if service == "backend":
        env = {
            "RAILWAY_PROJECT_ID": RAILWAY_PROJECT_ID,
            "RAILWAY_SERVICE_ID": BACKEND_SERVICE_ID,
            "RAILWAY_ENVIRONMENT_ID": BACKEND_ENVIRONMENT_ID
        }
    else:
        env = {
            "RAILWAY_PROJECT_ID": FRONTEND_PROJECT_ID,
            "RAILWAY_SERVICE_ID": FRONTEND_SERVICE_ID,
            "RAILWAY_ENVIRONMENT_ID": FRONTEND_ENVIRONMENT_ID
        }

    try:
        run_command(["railway", "logs"], env=env)
    except subprocess.CalledProcessError:
        log_error("Failed to fetch logs")


# ============================================================================
# Main
# ============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Deploy Vibe Kanban to Railway",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=f"""
Examples:
    ./mcp/deploy.py                    # Deploy backend (and frontend if configured)
    ./mcp/deploy.py --backend          # Backend only
    ./mcp/deploy.py --frontend         # Frontend only
    ./mcp/deploy.py --check            # Check prerequisites
    ./mcp/deploy.py --logs             # Show backend logs
    ./mcp/deploy.py --detach           # Deploy and don't wait for completion

URLs:
    Backend:  {BACKEND_URL}
    Frontend: {FRONTEND_URL if FRONTEND_SERVICE_ID else '(not configured)'}
"""
    )

    parser.add_argument("--backend", action="store_true", help="Deploy backend only")
    parser.add_argument("--frontend", action="store_true", help="Deploy frontend only")
    parser.add_argument("--check", action="store_true", help="Only check prerequisites")
    parser.add_argument("--no-verify", action="store_true", help="Skip deployment verification")
    parser.add_argument("--detach", action="store_true", help="Deploy in background (don't wait)")
    parser.add_argument("--logs", action="store_true", help="Show backend logs")

    args = parser.parse_args()

    # Handle logs command
    if args.logs:
        os.chdir(PROJECT_ROOT)
        show_logs("backend")
        return

    # Default: deploy both if neither specified
    deploy_backend_flag = args.backend or (not args.backend and not args.frontend)
    deploy_frontend_flag = args.frontend or (not args.backend and not args.frontend)

    os.chdir(PROJECT_ROOT)

    print(f"\n{Colors.BOLD}Vibe Kanban Railway Deployment{Colors.END}")
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

        if not deploy_backend(detach=args.detach):
            sys.exit(1)

        # Verify
        if not args.no_verify and not args.detach:
            log("Waiting for backend to start...")
            time.sleep(10)
            if not verify_backend():
                log_warning("Backend verification had issues")

    # ========== Frontend ==========
    if deploy_frontend_flag:
        log_section("FRONTEND DEPLOYMENT")

        if FRONTEND_SERVICE_ID:
            # Build first
            if not build_frontend():
                sys.exit(1)

            if not deploy_frontend(detach=args.detach):
                sys.exit(1)

            # Verify
            if not args.no_verify and not args.detach:
                log("Waiting for frontend to start...")
                time.sleep(5)
                if not verify_frontend():
                    log_warning("Frontend verification had issues")
        else:
            log_warning("No frontend service configured on Railway")
            log_step("Frontend is served by the backend (SPA mode)")

    # ========== Summary ==========
    print(f"\n{Colors.GREEN}{Colors.BOLD}{'=' * 40}{Colors.END}")
    print(f"{Colors.GREEN}{Colors.BOLD}✓ Deployment complete!{Colors.END}")
    print(f"{Colors.GREEN}{Colors.BOLD}{'=' * 40}{Colors.END}")

    if deploy_backend_flag:
        print(f"  Backend:  {BACKEND_URL}")
    if deploy_frontend_flag and FRONTEND_SERVICE_ID:
        print(f"  Frontend: {FRONTEND_URL}")

    if args.detach:
        print(f"\n  Check status: railway status")
        print(f"  View logs:    ./mcp/deploy.py --logs")
    print()


if __name__ == "__main__":
    main()
