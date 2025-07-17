#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { getPorts } = require('./setup-dev-environment');

async function setupTauriDev() {
  console.log('Setting up Tauri development environment...');
  
  // Get or allocate ports
  const ports = await getPorts();
  
  console.log(`Frontend port: ${ports.frontend}`);
  console.log(`Backend port: ${ports.backend}`);
  
  // Read the Tauri configuration
  const tauriConfigPath = path.join(__dirname, '..', 'src-tauri', 'tauri.conf.json');
  const config = JSON.parse(fs.readFileSync(tauriConfigPath, 'utf8'));
  
  // Update devUrl with the correct port
  config.build.devUrl = `http://localhost:${ports.frontend}`;
  
  // Write the updated configuration
  fs.writeFileSync(tauriConfigPath, JSON.stringify(config, null, 2));
  
  console.log(`Updated Tauri devUrl to: ${config.build.devUrl}`);
  console.log('✅ Tauri development environment setup complete!');
}

if (require.main === module) {
  setupTauriDev().catch(console.error);
}

module.exports = { setupTauriDev };