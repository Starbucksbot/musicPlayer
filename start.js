const { spawn } = require('child_process');
const path = require('path');

// Function to spawn a process and log its output
function spawnProcess(command, args, cwd) {
  const proc = spawn(command, args, { cwd, stdio: 'inherit' });
  proc.on('error', (err) => console.error(`${command} failed:`, err));
  proc.on('exit', (code) => console.log(`${command} exited with code ${code}`));
  return proc;
}

// Start the Next.js frontend
const nextPath = path.join(__dirname, 'node_modules', '.bin', 'next');
const nextProcess = spawnProcess('node', [nextPath, 'start', '-p', '4200'], __dirname);

// Start the backend server
const backendPath = path.join(__dirname, 'backend', 'server.js');
const backendProcess = spawnProcess('node', [backendPath], __dirname);

// Handle process termination
process.on('SIGTERM', () => {
  nextProcess.kill();
  backendProcess.kill();
  process.exit(0);
});

console.log('Started Next.js frontend on port 4200 and backend server on port 4300');