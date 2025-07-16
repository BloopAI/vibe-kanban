#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

/**
 * Setup script to prepare agent worktrees for development
 * This copies necessary production setup files and ensures npm run dev works
 */

function log(message) {
	console.log(`[SETUP] ${message}`);
}

function error(message) {
	console.error(`[ERROR] ${message}`);
}

function copyFileIfExists(src, dest) {
	if (fs.existsSync(src)) {
		const destDir = path.dirname(dest);
		if (!fs.existsSync(destDir)) {
			fs.mkdirSync(destDir, { recursive: true });
		}
		fs.copyFileSync(src, dest);
		log(
			`Copied ${path.basename(src)} to ${path.relative(process.cwd(), dest)}`
		);
		return true;
	}
	return false;
}

function copyDirIfExists(src, dest) {
	if (fs.existsSync(src)) {
		if (!fs.existsSync(dest)) {
			fs.mkdirSync(dest, { recursive: true });
		}
		fs.cpSync(src, dest, { recursive: true });
		log(
			`Copied directory ${path.basename(src)} to ${path.relative(
				process.cwd(),
				dest
			)}`
		);
		return true;
	}
	return false;
}

function ensureCargoTools() {
	try {
		// Check if cargo-watch is installed
		execSync("cargo watch --version", { stdio: "pipe" });
		log("cargo-watch is already installed");
	} catch (e) {
		log("Installing cargo-watch...");
		try {
			execSync("cargo install cargo-watch", { stdio: "inherit" });
			log("cargo-watch installed successfully");
		} catch (installError) {
			error(
				"Failed to install cargo-watch. Please install manually: cargo install cargo-watch"
			);
			process.exit(1);
		}
	}

	try {
		// Check if sqlx-cli is installed
		execSync("sqlx --version", { stdio: "pipe" });
		log("sqlx-cli is already installed");
	} catch (e) {
		log("Installing sqlx-cli...");
		try {
			execSync("cargo install sqlx-cli", { stdio: "inherit" });
			log("sqlx-cli installed successfully");
		} catch (installError) {
			error(
				"Failed to install sqlx-cli. Please install manually: cargo install sqlx-cli"
			);
			process.exit(1);
		}
	}
}

function setupWorktree(worktreePath, mainRepoPath) {
	log(`Setting up worktree: ${worktreePath}`);
	log(`Main repo path: ${mainRepoPath}`);

	// Change to worktree directory
	process.chdir(worktreePath);

	// Essential files to copy from main repo
	const filesToCopy = [
		// Scripts
		"scripts/setup-dev-environment.js",
		"scripts/prepare-db.js",
		"scripts/cargo.js",

		// Development assets
		"dev_assets_seed",

		// SQLx query cache
		"backend/.sqlx",

		// Configuration files that might be missing
		".dev-ports.json",
		"dev_assets",
	];

	// Copy essential files
	for (const file of filesToCopy) {
		const srcPath = path.join(mainRepoPath, file);
		const destPath = path.join(worktreePath, file);

		if (fs.statSync(srcPath, { throwIfNoEntry: false })?.isDirectory()) {
			copyDirIfExists(srcPath, destPath);
		} else {
			copyFileIfExists(srcPath, destPath);
		}
	}

	// Ensure node_modules exists in root (for scripts)
	if (!fs.existsSync("node_modules")) {
		log("Installing root dependencies...");
		try {
			execSync("npm install", { stdio: "inherit" });
		} catch (e) {
			error("Failed to install root dependencies");
		}
	}

	// Ensure frontend dependencies
	if (fs.existsSync("frontend") && !fs.existsSync("frontend/node_modules")) {
		log("Installing frontend dependencies...");
		try {
			execSync("cd frontend && npm install", { stdio: "inherit" });
		} catch (e) {
			error("Failed to install frontend dependencies");
		}
	}

	// Ensure Rust tools are available
	ensureCargoTools();

	// Set unique CARGO_TARGET_DIR to avoid file lock conflicts
	const cargoTargetDir = path.join(worktreePath, "target");
	const cargoEnv = {
		...process.env,
		PATH: `${process.env.HOME}/.cargo/bin:${process.env.PATH}`,
		CARGO_TARGET_DIR: cargoTargetDir,
	};

	// Prepare database for SQLx
	log("Preparing database for SQLx...");
	try {
		execSync("npm run prepare-db", {
			stdio: "inherit",
			env: cargoEnv,
		});
		log("Database prepared successfully");
	} catch (e) {
		error("Failed to prepare database. This might cause compilation issues.");
	}

	// Create a worktree-specific cargo wrapper to avoid conflicts
	const cargoWrapperPath = path.join(
		worktreePath,
		"scripts",
		"cargo-worktree.js"
	);
	const cargoWrapperContent = `#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');

// Set unique target directory for this worktree to avoid file lock conflicts
const targetDir = path.join(__dirname, '..', 'target');
process.env.CARGO_TARGET_DIR = targetDir;

// Add cargo to PATH
process.env.PATH = \`\${process.env.HOME}/.cargo/bin:\${process.env.PATH}\`;

// Execute cargo with the provided arguments
const args = process.argv.slice(2);
const command = \`cargo \${args.join(' ')}\`;

try {
  execSync(command, { stdio: 'inherit', cwd: process.cwd() });
} catch (error) {
  process.exit(error.status || 1);
}
`;

	fs.writeFileSync(cargoWrapperPath, cargoWrapperContent);
	execSync(`chmod +x "${cargoWrapperPath}"`);
	log("Created worktree-specific cargo wrapper");

	// Update package.json to use the worktree-specific cargo wrapper
	const packageJsonPath = path.join(worktreePath, "package.json");
	if (fs.existsSync(packageJsonPath)) {
		try {
			const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

			// Update cargo script to use worktree-specific wrapper
			if (packageJson.scripts && packageJson.scripts.cargo) {
				packageJson.scripts.cargo = "node scripts/cargo-worktree.js";

				fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
				log("Updated package.json to use worktree-specific cargo wrapper");
			}
		} catch (e) {
			error("Failed to update package.json cargo script");
		}
	}

	log("Worktree setup complete!");
	log("You can now run: npm run dev");
	log("Note: This worktree uses an isolated build cache to avoid conflicts.");
}

// CLI interface
if (require.main === module) {
	const args = process.argv.slice(2);

	if (args.length === 0) {
		// Auto-detect if we're in a worktree
		try {
			const gitDir = execSync("git rev-parse --git-dir", {
				encoding: "utf8",
			}).trim();
			if (gitDir.includes("worktrees")) {
				// We're in a worktree, find the main repo
				const mainGitDir = execSync("git rev-parse --git-common-dir", {
					encoding: "utf8",
				}).trim();
				const mainRepoPath = path.dirname(mainGitDir);
				const currentPath = process.cwd();

				setupWorktree(currentPath, mainRepoPath);
			} else {
				error(
					"Not in a git worktree. Usage: node setup-agent-worktree.js [worktree-path] [main-repo-path]"
				);
				process.exit(1);
			}
		} catch (e) {
			error("Failed to detect git repository structure");
			process.exit(1);
		}
	} else if (args.length === 2) {
		const [worktreePath, mainRepoPath] = args;
		setupWorktree(path.resolve(worktreePath), path.resolve(mainRepoPath));
	} else {
		console.log("Usage:");
		console.log(
			"  node setup-agent-worktree.js                           - Auto-setup current worktree"
		);
		console.log(
			"  node setup-agent-worktree.js <worktree> <main-repo>    - Setup specific worktree"
		);
		process.exit(1);
	}
}

module.exports = { setupWorktree };
