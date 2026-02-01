#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');

// Get arguments passed to this script (skip node and script path)
const args = process.argv.slice(2);

// Path to the shell script
const scriptPath = path.join(__dirname, 'sync.sh');

// Spawn the shell script with arguments
const child = spawn(scriptPath, args, {
  stdio: 'inherit', // Pipe stdin/out/err to parent
  shell: true       // Use shell to execute
});

child.on('error', (err) => {
  console.error(`Failed to start subprocess: ${err}`);
  process.exit(1);
});

child.on('close', (code) => {
  process.exit(code);
});
