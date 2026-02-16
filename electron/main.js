const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

let serverProcess = null;
let mainWindow = null;

function getServerBinaryPath() {
  // When packaged: binary is in resources/
  const packagedPath = path.join(process.resourcesPath, 'server');
  if (fs.existsSync(packagedPath)) return packagedPath;

  // Dev: use cargo build output
  const devPath = path.join(__dirname, '..', 'target', 'release', 'server');
  if (fs.existsSync(devPath)) return devPath;

  const debugPath = path.join(__dirname, '..', 'target', 'debug', 'server');
  if (fs.existsSync(debugPath)) return debugPath;

  throw new Error(
    'Server binary not found. Run `cargo build --release --bin server` first.'
  );
}

function startServer() {
  return new Promise((resolve, reject) => {
    const binaryPath = getServerBinaryPath();
    console.log(`Starting server: ${binaryPath}`);

    serverProcess = spawn(binaryPath, [], {
      env: { ...process.env, RUST_LOG: process.env.RUST_LOG || 'info' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const rl = readline.createInterface({ input: serverProcess.stdout });
    const portRegex = /Server running on http:\/\/127\.0\.0\.1:(\d+)/;

    rl.on('line', (line) => {
      console.log(`[server] ${line}`);
      const match = line.match(portRegex);
      if (match) {
        rl.close();
        resolve(parseInt(match[1], 10));
      }
    });

    serverProcess.stderr.on('data', (data) => {
      console.error(`[server] ${data.toString()}`);
    });

    serverProcess.on('error', (err) => {
      reject(new Error(`Failed to start server: ${err.message}`));
    });

    serverProcess.on('exit', (code) => {
      if (code !== null && code !== 0) {
        reject(new Error(`Server exited with code ${code}`));
      }
    });

    // Timeout after 30 seconds
    setTimeout(() => reject(new Error('Server startup timed out')), 30000);
  });
}

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'vibe-kanban',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}`);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', async () => {
  try {
    const port = await startServer();
    console.log(`Server ready on port ${port}`);
    createWindow(port);
  } catch (err) {
    console.error(err.message);
    app.quit();
  }
});

app.on('will-quit', () => {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill('SIGTERM');
  }
});

app.on('window-all-closed', () => {
  app.quit();
});
