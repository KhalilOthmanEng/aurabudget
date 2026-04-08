/**
 * AuraBudget — Copy Frontend Build
 * Copies the built React frontend into backend/frontend_dist
 * so it can be served by the FastAPI backend and bundled by PyInstaller.
 */

const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "frontend", "dist");
const DEST = path.join(__dirname, "..", "backend", "frontend_dist");

function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    console.error(`❌ Source not found: ${src}`);
    console.error("   Run 'cd frontend && npm run build' first.");
    process.exit(1);
  }

  // Clean destination
  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true });
  }
  fs.mkdirSync(dest, { recursive: true });

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

console.log("📂 Copying frontend build to backend/frontend_dist...");
copyDir(SRC, DEST);
console.log("✅ Frontend copied successfully!");
