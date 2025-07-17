#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const { getPorts } = require('./setup-dev-environment');
const { setupTauriDev } = require('./setup-tauri-dev');

// Helper function to check if a port is accessible
function checkPort(port, retries = 10) {
  return new Promise((resolve, reject) => {
    const attempt = (retriesLeft) => {
      const req = http.request({
        hostname: 'localhost',
        port: port,
        path: '/',
        method: 'GET',
        timeout: 1000
      }, (res) => {
        resolve(true);
      });
      
      req.on('error', () => {
        if (retriesLeft > 0) {
          setTimeout(() => attempt(retriesLeft - 1), 1000);
        } else {
          resolve(false);
        }
      });
      
      req.on('timeout', () => {
        req.destroy();
        if (retriesLeft > 0) {
          setTimeout(() => attempt(retriesLeft - 1), 1000);
        } else {
          resolve(false);
        }
      });
      
      req.end();
    };
    
    attempt(retries);
  });
}

async function runDesktopDev() {
  console.log('🚀 Starting Vibe Kanban Desktop Development Environment...');
  
  try {
    // Setup Tauri configuration with dynamic ports
    await setupTauriDev();
    
    // Get the ports
    const ports = await getPorts();
    
    console.log(`📱 Frontend will run on: http://localhost:${ports.frontend}`);
    console.log(`🔧 Backend will run on: http://localhost:${ports.backend}`);
    
    // Set environment variables
    process.env.FRONTEND_PORT = ports.frontend;
    process.env.BACKEND_PORT = ports.backend;
    process.env.VITE_BACKEND_PORT = ports.backend;
    
    // Start the backend first
    console.log('🔧 Starting backend server...');
    const backend = spawn('npm', ['run', 'backend:dev:watch'], {
      stdio: 'inherit',
      env: { ...process.env, BACKEND_PORT: ports.backend }
    });
    
    // Give the backend a moment to start
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Start the frontend dev server with explicit port
    console.log('📱 Starting frontend dev server...');
    const frontend = spawn('npm', ['run', 'frontend:dev'], {
      stdio: 'inherit',
      env: { 
        ...process.env, 
        FRONTEND_PORT: ports.frontend.toString(),
        VITE_BACKEND_PORT: ports.backend.toString(),
        NODE_ENV: 'development'
      }
    });
    
    // Wait for frontend to be ready
    console.log('⏳ Waiting for frontend dev server to be ready...');
    const frontendReady = await checkPort(ports.frontend);
    if (!frontendReady) {
      console.error('❌ Frontend dev server failed to start');
      process.exit(1);
    }
    console.log('✅ Frontend dev server is ready');
    
    // Start Tauri dev
    console.log('🖥️  Starting Tauri desktop application...');
    const tauri = spawn('npx', ['tauri', 'dev'], {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..', 'src-tauri')
    });
    
    // Handle cleanup
    process.on('SIGINT', () => {
      console.log('\n🛑 Shutting down development environment...');
      backend.kill('SIGINT');
      frontend.kill('SIGINT');
      tauri.kill('SIGINT');
      process.exit(0);
    });
    
    // Wait for Tauri to exit
    tauri.on('exit', (code) => {
      console.log(`🖥️  Tauri exited with code ${code}`);
      backend.kill('SIGINT');
      frontend.kill('SIGINT');
      process.exit(code);
    });
    
    backend.on('exit', (code) => {
      console.log(`🔧 Backend exited with code ${code}`);
      frontend.kill('SIGINT');
      tauri.kill('SIGINT');
      process.exit(code);
    });
    
    frontend.on('exit', (code) => {
      console.log(`📱 Frontend exited with code ${code}`);
      backend.kill('SIGINT');
      tauri.kill('SIGINT');
      process.exit(code);
    });
    
  } catch (error) {
    console.error('❌ Failed to start desktop development environment:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  runDesktopDev();
}

module.exports = { runDesktopDev };