#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Preparing database for SQLx...');

// Change to backend directory
const backendDir = path.join(__dirname, '..', 'backend');
process.chdir(backendDir);

// Create temporary database file
const dbFile = path.join(backendDir, 'prepare_db.sqlite');
fs.writeFileSync(dbFile, '');

try {
  // Get absolute path (cross-platform)
  const dbPath = path.resolve(dbFile);
  const databaseUrl = `sqlite:${dbPath}`;
  
  console.log(`Using database: ${databaseUrl}`);
  
  // Run migrations
  console.log('Running migrations...');
  execSync('cargo sqlx migrate run', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl }
  });
  
  // Prepare queries
  console.log('Preparing queries...');
  execSync('cargo sqlx prepare', {
    stdio: 'inherit', 
    env: { ...process.env, DATABASE_URL: databaseUrl }
  });
  
  console.log('Database preparation complete!');
  
} finally {
  // Clean up temporary file
  if (fs.existsSync(dbFile)) {
    fs.unlinkSync(dbFile);
  }
}