// Vibe Kanban — Electron main process
// Manages the full sidecar lifecycle: spawn → discover port → health check → window → shutdown

const { app, BrowserWindow, dialog, Menu, ipcMain, session } = require('electron');
const { autoUpdater } = require('electron-updater');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');

const CONTENT_SECURITY_POLICY =
  "default-src 'self' 'unsafe-inline' 'unsafe-eval' http://127.0.0.1:* ws://127.0.0.1:*; " +
  "style-src 'self' 'unsafe-inline' http://127.0.0.1:* https://fonts.googleapis.com; " +
  "font-src 'self' data: http://127.0.0.1:* https://fonts.gstatic.com; " +
  "img-src 'self' data: blob: http://127.0.0.1:*; " +
  "connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:*";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let mainWindow = null;
let backendProcess = null;
let backendPort = null;
let isShuttingDown = false;
let backendLogStream = null;
let electronLogStream = null;
let autoUpdateInitialized = false;

// ---------------------------------------------------------------------------
// (k) Logging infrastructure
// ---------------------------------------------------------------------------

function ensureLogDir() {
  const logDir = app.getPath('logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  return logDir;
}

function initLogging() {
  const logDir = ensureLogDir();
  backendLogStream = fs.createWriteStream(path.join(logDir, 'backend.log'), { flags: 'a' });
  electronLogStream = fs.createWriteStream(path.join(logDir, 'electron.log'), { flags: 'a' });
  logElectron('Electron main process started');
  logElectron(`App version: ${app.getVersion()}`);
  logElectron(`Platform: ${process.platform} ${process.arch}`);
  logElectron(`Packaged: ${app.isPackaged}`);
}

function logElectron(message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}\n`;
  if (electronLogStream) {
    electronLogStream.write(line);
  }
  if (!app.isPackaged) {
    console.log(`[electron] ${message}`);
  }
}

function logBackend(data) {
  if (backendLogStream) {
    backendLogStream.write(data);
  }
}

// ---------------------------------------------------------------------------
// (b) Sidecar binary resolution
// ---------------------------------------------------------------------------

function getPlatformDir() {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === 'darwin' && arch === 'arm64') return 'macos-arm64';
  if (platform === 'darwin' && arch === 'x64') return 'macos-x64';
  if (platform === 'win32' && arch === 'x64') return 'windows-x64';
  if (platform === 'win32' && arch === 'arm64') return 'windows-arm64';
  if (platform === 'linux' && arch === 'x64') return 'linux-x64';
  if (platform === 'linux' && arch === 'arm64') return 'linux-arm64';

  return null;
}

function getBinaryName(base) {
  return process.platform === 'win32' ? `${base}.exe` : base;
}

function resolveBinaryPath(baseName) {
  const binaryName = getBinaryName(baseName);

  if (app.isPackaged) {
    // Production: electron-builder copies platform binaries into resources/bin/
    return path.join(process.resourcesPath, 'bin', binaryName);
  }

  // Development: binaries live under electron/resources/bin/{platform-arch}/
  const platformDir = getPlatformDir();
  if (!platformDir) {
    return null;
  }
  return path.join(__dirname, 'resources', 'bin', platformDir, binaryName);
}

// ---------------------------------------------------------------------------
// (o) Startup orphan detection
// ---------------------------------------------------------------------------

function getPortFilePath() {
  return path.join(os.tmpdir(), 'vibe-kanban', 'vibe-kanban.port');
}

async function checkForOrphanProcess() {
  const portFilePath = getPortFilePath();

  if (!fs.existsSync(portFilePath)) {
    return false;
  }

  let port;
  try {
    const content = (await fs.promises.readFile(portFilePath, 'utf-8')).trim();
    port = parseInt(content, 10);
    if (isNaN(port) || port <= 0 || port > 65535) {
      // Invalid port file — remove it and continue
      fs.unlinkSync(portFilePath);
      return false;
    }
  } catch {
    return false;
  }

  // Check if something is actually listening on that port
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/api/health`, (res) => {
      req.destroy();
      res.resume();
      if (res.statusCode === 200) {
        resolve(port);
      } else {
        // Port file exists but service isn't healthy — stale file
        try { fs.unlinkSync(portFilePath); } catch { /* ignore */ }
        resolve(false);
      }
    });
    req.on('error', () => {
      // Nothing listening — stale port file
      try { fs.unlinkSync(portFilePath); } catch { /* ignore */ }
      resolve(false);
    });
    req.setTimeout(300, () => {
      req.destroy();
      try { fs.unlinkSync(portFilePath); } catch { /* ignore */ }
      resolve(false);
    });
  });
}

// ---------------------------------------------------------------------------
// (d) Health check readiness polling
// ---------------------------------------------------------------------------

function waitForHealth(port, retries = 30, interval = 100, requestTimeout = 300) {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    function poll() {
      attempts++;
      const req = http.get(`http://127.0.0.1:${port}/api/health`, (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else if (attempts < retries) {
          setTimeout(poll, interval);
        } else {
          reject(new Error(`Health check failed after ${retries} attempts (last status: ${res.statusCode})`));
        }
        // Consume response data to free up memory
        res.resume();
      });
      req.on('error', () => {
        if (attempts < retries) {
          setTimeout(poll, interval);
        } else {
          reject(new Error(`Health check failed after ${retries} attempts`));
        }
      });
      req.setTimeout(requestTimeout, () => {
        req.destroy();
        if (attempts < retries) {
          setTimeout(poll, interval);
        } else {
          reject(new Error(`Health check timed out after ${retries} attempts`));
        }
      });
    }

    poll();
  });
}

// ---------------------------------------------------------------------------
// (c) Sidecar spawning + port discovery
// ---------------------------------------------------------------------------

function startBackend() {
  const binaryPath = resolveBinaryPath('vibe-kanban');

  // (j) Binary not found error handling
  if (!binaryPath) {
    dialog.showErrorBox(
      'Unsupported Platform',
      `Vibe Kanban does not support ${process.platform}-${process.arch}.\nPlease check for a compatible version.`
    );
    app.quit();
    return;
  }

  if (!fs.existsSync(binaryPath)) {
    dialog.showErrorBox(
      'Binary Not Found',
      `Could not find backend at ${binaryPath}.\nPlease reinstall the application.`
    );
    app.quit();
    return;
  }

  logElectron(`Starting backend: ${binaryPath}`);

  backendProcess = spawn(binaryPath, [], {
    env: {
      ...process.env,
      SKIP_BROWSER_OPEN: '1',
      BACKEND_PORT: '0',
      HOST: '127.0.0.1',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: false,
  });

  // Port discovery: parse stdout for "Server running on http://127.0.0.1:{port}"
  const portRegex = /Server running on http:\/\/127\.0\.0\.1:(\d+)/;
  let portDiscovered = false;

  backendProcess.stdout.setEncoding('utf8');
  backendProcess.stderr.setEncoding('utf8');

  backendProcess.stdout.on('data', (text) => {
    logBackend(text);

    if (!portDiscovered) {
      const match = text.match(portRegex);
      if (match) {
        portDiscovered = true;
        backendPort = parseInt(match[1], 10);
        logElectron(`Backend port discovered: ${backendPort}`);
        onPortDiscovered(backendPort);
      }
    }
  });

  backendProcess.stderr.on('data', (text) => {
    logBackend(text);
  });

  // (g) Backend crash monitoring
  backendProcess.on('exit', (code, signal) => {
    logElectron(`Backend exited with code=${code} signal=${signal}`);
    if (!isShuttingDown && code !== 0) {
      dialog.showErrorBox(
        'Backend Crashed',
        `The backend process exited unexpectedly (code: ${code}, signal: ${signal}).\nPlease restart the application.`
      );
      app.quit();
    }
  });

  backendProcess.on('error', (err) => {
    logElectron(`Backend spawn error: ${err.message}`);
    dialog.showErrorBox(
      'Backend Error',
      `Failed to start the backend process: ${err.message}\nPlease reinstall the application.`
    );
    app.quit();
  });

  // Timeout for port discovery (7 seconds)
  setTimeout(() => {
    if (!portDiscovered) {
      logElectron('Port discovery timed out after 7 seconds');
      dialog.showErrorBox(
        'Startup Timeout',
        'The backend did not report its port within 7 seconds.\nPlease check the logs and restart.'
      );
      shutdownBackend();
      app.quit();
    }
  }, 7000);
}

async function onPortDiscovered(port) {
  try {
    await waitForHealth(port);
    logElectron(`Backend healthy on port ${port}`);
    createWindow(port);
  } catch (err) {
    logElectron(`Health check failed: ${err.message}`);
    dialog.showErrorBox(
      'Backend Not Ready',
      `The backend started but failed health checks:\n${err.message}\nPlease restart the application.`
    );
    shutdownBackend();
    app.quit();
  }
}

// ---------------------------------------------------------------------------
// (e) BrowserWindow creation
// ---------------------------------------------------------------------------

function createWindow(port) {
  const windowOptions = {
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Vibe Kanban',
    backgroundColor: '#1f1f1f',
    show: false,
    paintWhenInitiallyHidden: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      backgroundThrottling: true,
      spellcheck: false,
    },
  };

  if (process.platform === 'darwin') {
    windowOptions.titleBarStyle = 'hiddenInset';
    windowOptions.trafficLightPosition = { x: 14, y: 14 };
  }

  mainWindow = new BrowserWindow(windowOptions);

  mainWindow.loadURL(`http://127.0.0.1:${port}`);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.once('did-finish-load', () => {
    setupAutoUpdate();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  logElectron(`Window created, loading http://127.0.0.1:${port}`);
}

// ---------------------------------------------------------------------------
// (h) Graceful shutdown
// ---------------------------------------------------------------------------

function shutdownBackend() {
  if (!backendProcess || backendProcess.killed) {
    return;
  }

  logElectron('Shutting down backend process');

  if (process.platform === 'win32') {
    // On Windows, Node translates SIGINT to a console control event
    // which tokio::signal::ctrl_c() catches in the Rust backend
    backendProcess.kill('SIGINT');
  } else {
    backendProcess.kill('SIGTERM');
  }

  // Force kill after 5 seconds if graceful shutdown fails
  const killTimeout = setTimeout(() => {
    if (backendProcess && !backendProcess.killed) {
      logElectron('Force killing backend (SIGKILL) after timeout');
      backendProcess.kill('SIGKILL');
    }
  }, 5000);

  backendProcess.on('exit', () => {
    clearTimeout(killTimeout);
  });
}

// ---------------------------------------------------------------------------
// (f) MCP server binary path exposure
// ---------------------------------------------------------------------------

function getMcpBinaryPath() {
  return resolveBinaryPath('vibe-kanban-mcp');
}

ipcMain.handle('get-mcp-binary-path', () => {
  return getMcpBinaryPath();
});

ipcMain.handle('get-backend-port', () => {
  return backendPort;
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

// ---------------------------------------------------------------------------
// (m) Content Security Policy
// ---------------------------------------------------------------------------

function setupContentSecurityPolicy() {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [CONTENT_SECURITY_POLICY],
      },
    });
  });
}

// ---------------------------------------------------------------------------
// (l) Minimal menu bar
// ---------------------------------------------------------------------------

function setupMenu() {
  const template = [
    ...(process.platform === 'darwin'
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ]
      : []),
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------------------------------------------------------------------------
// (n) Auto-update via electron-updater
// ---------------------------------------------------------------------------

function setupAutoUpdate() {
  if (autoUpdateInitialized) {
    return;
  }
  autoUpdateInitialized = true;

  if (!app.isPackaged) {
    logElectron('Skipping auto-update in development mode');
    return;
  }

  setTimeout(() => {
  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    logElectron(`Auto-update check failed: ${err.message}`);
  });
  }, 15000);

  autoUpdater.on('update-downloaded', () => {
    logElectron('Update downloaded, prompting user');
    dialog
      .showMessageBox({
        type: 'info',
        title: 'Update Ready',
        message: 'A new version has been downloaded. Restart to apply the update?',
        buttons: ['Restart', 'Later'],
      })
      .then(({ response }) => {
        if (response === 0) {
          autoUpdater.quitAndInstall();
        }
      });
  });

  autoUpdater.on('error', (err) => {
    logElectron(`Auto-update error: ${err.message}`);
  });
}

// ---------------------------------------------------------------------------
// (a) Single-instance lock
// ---------------------------------------------------------------------------

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // -------------------------------------------------------------------------
  // App lifecycle
  // -------------------------------------------------------------------------

  app.on('ready', async () => {
    initLogging();
    setupMenu();
    setupContentSecurityPolicy();

    // (o) Orphan detection — check if a backend is already running
    const orphanPort = await checkForOrphanProcess();
    if (orphanPort) {
      logElectron(`Detected existing backend on port ${orphanPort}`);
      const { response } = await dialog.showMessageBox({
        type: 'question',
        title: 'Existing Instance Detected',
        message: `A Vibe Kanban backend is already running on port ${orphanPort}.\nWould you like to connect to it or start a new instance?`,
        buttons: ['Connect to Existing', 'Start Fresh'],
        defaultId: 0,
      });

      if (response === 0) {
        // Connect to the existing backend
        backendPort = orphanPort;
        createWindow(orphanPort);
        return;
      }
      // Start fresh — the new backend will use a different port (port 0)
    }

    startBackend();
  });

  // (h) Graceful shutdown
  app.on('before-quit', (event) => {
    if (isShuttingDown) return;
    event.preventDefault();
    isShuttingDown = true;
    logElectron('App quitting — initiating graceful shutdown');

    if (backendProcess && !backendProcess.killed) {
      shutdownBackend();
      backendProcess.on('exit', () => {
        logElectron('Backend exited, closing app');
        if (backendLogStream) backendLogStream.end();
        if (electronLogStream) electronLogStream.end();
        app.exit(0);
      });
    } else {
      if (backendLogStream) backendLogStream.end();
      if (electronLogStream) electronLogStream.end();
      app.exit(0);
    }
  });

  // (i) macOS dock behavior
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && backendPort) {
      createWindow(backendPort);
    }
  });
}
