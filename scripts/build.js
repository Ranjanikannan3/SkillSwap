const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// 1. Copy static frontend files to dist
const staticFiles = ['index.html', 'style.css', 'app.js', 'community-hub.js'];
for (const file of staticFiles) {
  const src = path.join(rootDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(distDir, file));
  }
}

// 2. Copy api/index.js as entrypoints in dist (both index.js and server.js)
const apiEntry = path.join(rootDir, 'api', 'index.js');
if (fs.existsSync(apiEntry)) {
  fs.copyFileSync(apiEntry, path.join(distDir, 'index.js'));
  fs.copyFileSync(apiEntry, path.join(distDir, 'server.js'));
  fs.copyFileSync(apiEntry, path.join(distDir, 'app.js'));
}

// 3. Helper to copy directories recursively
function copyDir(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Copy src into dist/src so local requires resolve either way
const srcDir = path.join(rootDir, 'src');
if (fs.existsSync(srcDir)) {
  copyDir(srcDir, path.join(distDir, 'src'));
}

console.log('[Build] Successfully generated dist directory with server entrypoints and static frontend files.');
