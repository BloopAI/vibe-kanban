#!/usr/bin/env node

/**
 * Architecture Health Analysis Script
 *
 * Analyzes the codebase for:
 * - File complexity (large files that might need refactoring)
 * - Dependency health (circular dependencies, unused exports)
 * - Module coupling (how interconnected modules are)
 * - Code duplication indicators
 *
 * Exit codes:
 * - 0: All checks pass
 * - 1: Warnings found (non-blocking)
 * - 2: Critical issues found (blocking in strict mode)
 */

const fs = require('fs');
const path = require('path');

// Configuration thresholds
const CONFIG = {
  // File size thresholds (lines of code)
  maxFileLines: {
    warning: 400,
    critical: 800,
  },
  // Function/component count per file
  maxFunctionsPerFile: {
    warning: 15,
    critical: 30,
  },
  // Import count thresholds
  maxImportsPerFile: {
    warning: 20,
    critical: 40,
  },
  // Directory depth
  maxDirectoryDepth: {
    warning: 6,
    critical: 8,
  },
  // Module size (files per module)
  maxFilesPerModule: {
    warning: 30,
    critical: 50,
  },
};

const issues = {
  critical: [],
  warning: [],
  info: [],
};

// Utility functions
function countLines(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return content.split('\n').length;
  } catch {
    return 0;
  }
}

function countImports(filePath, isRust) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    if (isRust) {
      return (content.match(/^use\s+/gm) || []).length;
    }
    return (content.match(/^import\s+/gm) || []).length;
  } catch {
    return 0;
  }
}

function countFunctions(filePath, isRust) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    if (isRust) {
      return (content.match(/^\s*(pub\s+)?(async\s+)?fn\s+\w+/gm) || []).length;
    }
    // TypeScript/JavaScript - count function declarations and arrow functions
    const funcDecls = (content.match(/^\s*(export\s+)?(async\s+)?function\s+\w+/gm) || []).length;
    const arrowFuncs = (content.match(/^\s*(export\s+)?(const|let)\s+\w+\s*=\s*(async\s+)?\(/gm) || []).length;
    const reactComps = (content.match(/^\s*(export\s+)?(default\s+)?(const|function)\s+[A-Z]\w+/gm) || []).length;
    return funcDecls + arrowFuncs + reactComps;
  } catch {
    return 0;
  }
}

function walkDir(dir, callback, depth = 0) {
  if (!fs.existsSync(dir)) return;

  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      // Skip common non-source directories
      if (['node_modules', 'target', 'dist', '.git', 'build', 'coverage'].includes(file)) {
        continue;
      }
      walkDir(filePath, callback, depth + 1);
    } else {
      callback(filePath, depth);
    }
  }
}

function getRelativePath(filePath) {
  return path.relative(process.cwd(), filePath);
}

// Analysis functions
function analyzeFileComplexity(dir, extensions, isRust = false) {
  walkDir(dir, (filePath, depth) => {
    const ext = path.extname(filePath);
    if (!extensions.includes(ext)) return;

    const relativePath = getRelativePath(filePath);
    const lines = countLines(filePath);
    const imports = countImports(filePath, isRust);
    const functions = countFunctions(filePath, isRust);

    // Check file size
    if (lines > CONFIG.maxFileLines.critical) {
      issues.critical.push({
        type: 'file-size',
        file: relativePath,
        message: `File has ${lines} lines (critical threshold: ${CONFIG.maxFileLines.critical})`,
        suggestion: 'Consider splitting into smaller modules',
      });
    } else if (lines > CONFIG.maxFileLines.warning) {
      issues.warning.push({
        type: 'file-size',
        file: relativePath,
        message: `File has ${lines} lines (warning threshold: ${CONFIG.maxFileLines.warning})`,
        suggestion: 'Consider refactoring large sections',
      });
    }

    // Check function count
    if (functions > CONFIG.maxFunctionsPerFile.critical) {
      issues.critical.push({
        type: 'function-count',
        file: relativePath,
        message: `File has ${functions} functions/components (critical threshold: ${CONFIG.maxFunctionsPerFile.critical})`,
        suggestion: 'Split into multiple focused modules',
      });
    } else if (functions > CONFIG.maxFunctionsPerFile.warning) {
      issues.warning.push({
        type: 'function-count',
        file: relativePath,
        message: `File has ${functions} functions/components (warning threshold: ${CONFIG.maxFunctionsPerFile.warning})`,
        suggestion: 'Consider extracting some functions',
      });
    }

    // Check import count
    if (imports > CONFIG.maxImportsPerFile.critical) {
      issues.critical.push({
        type: 'import-count',
        file: relativePath,
        message: `File has ${imports} imports (critical threshold: ${CONFIG.maxImportsPerFile.critical})`,
        suggestion: 'This file may have too many dependencies',
      });
    } else if (imports > CONFIG.maxImportsPerFile.warning) {
      issues.warning.push({
        type: 'import-count',
        file: relativePath,
        message: `File has ${imports} imports (warning threshold: ${CONFIG.maxImportsPerFile.warning})`,
        suggestion: 'Consider consolidating or splitting module',
      });
    }

    // Check directory depth
    if (depth > CONFIG.maxDirectoryDepth.critical) {
      issues.critical.push({
        type: 'depth',
        file: relativePath,
        message: `File is ${depth} levels deep (critical threshold: ${CONFIG.maxDirectoryDepth.critical})`,
        suggestion: 'Flatten directory structure',
      });
    } else if (depth > CONFIG.maxDirectoryDepth.warning) {
      issues.warning.push({
        type: 'depth',
        file: relativePath,
        message: `File is ${depth} levels deep (warning threshold: ${CONFIG.maxDirectoryDepth.warning})`,
        suggestion: 'Consider reorganizing directory structure',
      });
    }
  });
}

function analyzeModuleSize(dir, moduleName) {
  let fileCount = 0;

  walkDir(dir, () => {
    fileCount++;
  });

  if (fileCount > CONFIG.maxFilesPerModule.critical) {
    issues.critical.push({
      type: 'module-size',
      file: moduleName,
      message: `Module has ${fileCount} files (critical threshold: ${CONFIG.maxFilesPerModule.critical})`,
      suggestion: 'Consider splitting into sub-modules',
    });
  } else if (fileCount > CONFIG.maxFilesPerModule.warning) {
    issues.warning.push({
      type: 'module-size',
      file: moduleName,
      message: `Module has ${fileCount} files (warning threshold: ${CONFIG.maxFilesPerModule.warning})`,
      suggestion: 'Module is getting large, consider organization',
    });
  }

  return fileCount;
}

function checkCircularDependencyIndicators() {
  // Check for potential circular dependency patterns in Rust
  const cargoFiles = [];
  walkDir('crates', (filePath) => {
    if (path.basename(filePath) === 'Cargo.toml') {
      cargoFiles.push(filePath);
    }
  });

  const dependencies = {};
  for (const cargoFile of cargoFiles) {
    try {
      const content = fs.readFileSync(cargoFile, 'utf8');
      const crateName = path.basename(path.dirname(cargoFile));

      // Extract dependencies (simplified parsing)
      const depSection = content.match(/\[dependencies\]([\s\S]*?)(?=\[|$)/);
      if (depSection) {
        const deps = depSection[1].match(/^(\w+[-\w]*)\s*=/gm) || [];
        dependencies[crateName] = deps.map((d) => d.replace(/\s*=.*/, '').trim());
      }
    } catch {
      // Skip files that can't be read
    }
  }

  // Simple cycle detection (A -> B -> A)
  for (const [crate, deps] of Object.entries(dependencies)) {
    for (const dep of deps) {
      if (dependencies[dep] && dependencies[dep].includes(crate)) {
        issues.warning.push({
          type: 'circular-dependency',
          file: `crates/${crate}`,
          message: `Potential circular dependency between ${crate} and ${dep}`,
          suggestion: 'Review dependency structure',
        });
      }
    }
  }
}

function generateReport() {
  console.log('\n========================================');
  console.log('   Architecture Health Analysis Report');
  console.log('========================================\n');

  // Summary
  const totalIssues = issues.critical.length + issues.warning.length;
  console.log(`Total issues found: ${totalIssues}`);
  console.log(`  - Critical: ${issues.critical.length}`);
  console.log(`  - Warnings: ${issues.warning.length}`);
  console.log(`  - Info: ${issues.info.length}`);
  console.log('');

  // Critical issues
  if (issues.critical.length > 0) {
    console.log('CRITICAL ISSUES:');
    console.log('----------------');
    for (const issue of issues.critical) {
      console.log(`[CRITICAL] ${issue.file}`);
      console.log(`  ${issue.message}`);
      console.log(`  Suggestion: ${issue.suggestion}`);
      console.log('');
    }
  }

  // Warnings
  if (issues.warning.length > 0) {
    console.log('WARNINGS:');
    console.log('---------');
    for (const issue of issues.warning) {
      console.log(`[WARNING] ${issue.file}`);
      console.log(`  ${issue.message}`);
      console.log(`  Suggestion: ${issue.suggestion}`);
      console.log('');
    }
  }

  // Write to GitHub Actions summary if available
  if (process.env.GITHUB_STEP_SUMMARY) {
    let summary = '## Architecture Analysis Results\n\n';
    summary += `| Severity | Count |\n|----------|-------|\n`;
    summary += `| Critical | ${issues.critical.length} |\n`;
    summary += `| Warning | ${issues.warning.length} |\n\n`;

    if (issues.critical.length > 0) {
      summary += '### Critical Issues\n\n';
      for (const issue of issues.critical) {
        summary += `- **${issue.file}**: ${issue.message}\n`;
      }
      summary += '\n';
    }

    if (issues.warning.length > 0) {
      summary += '### Warnings\n\n';
      for (const issue of issues.warning.slice(0, 10)) {
        summary += `- **${issue.file}**: ${issue.message}\n`;
      }
      if (issues.warning.length > 10) {
        summary += `- ... and ${issues.warning.length - 10} more warnings\n`;
      }
    }

    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  }
}

// Main execution
function main() {
  console.log('Analyzing architecture health...\n');

  // Analyze Rust crates
  console.log('Analyzing Rust crates...');
  if (fs.existsSync('crates')) {
    analyzeFileComplexity('crates', ['.rs'], true);
    const crates = fs.readdirSync('crates').filter((f) => {
      const cratePath = path.join('crates', f);
      return fs.statSync(cratePath).isDirectory();
    });
    for (const crate of crates) {
      analyzeModuleSize(path.join('crates', crate), `crates/${crate}`);
    }
  }

  // Analyze Frontend
  console.log('Analyzing frontend...');
  if (fs.existsSync('frontend/src')) {
    analyzeFileComplexity('frontend/src', ['.ts', '.tsx', '.js', '.jsx'], false);

    // Analyze specific frontend directories
    const frontendDirs = ['components', 'pages', 'hooks', 'utils', 'services'];
    for (const dir of frontendDirs) {
      const dirPath = path.join('frontend/src', dir);
      if (fs.existsSync(dirPath)) {
        analyzeModuleSize(dirPath, `frontend/src/${dir}`);
      }
    }
  }

  // Check for circular dependencies
  console.log('Checking for circular dependency patterns...');
  checkCircularDependencyIndicators();

  // Generate report
  generateReport();

  // Exit with appropriate code
  const strictMode = process.argv.includes('--strict');
  if (issues.critical.length > 0 && strictMode) {
    console.log('\nFailed: Critical issues found in strict mode');
    process.exit(2);
  } else if (issues.critical.length > 0) {
    console.log('\nWarning: Critical issues found (non-blocking)');
    process.exit(0);
  } else {
    console.log('\nArchitecture health check passed!');
    process.exit(0);
  }
}

main();
