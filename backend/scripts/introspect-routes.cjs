#!/usr/bin/env node
// scripts/introspect-routes.cjs
// 扫 backend/src/routes/ 下所有 .js 文件，列出每个 endpoint 的 method + path + 挂载点。
// Refactor Phase 1.5 (2026-07-09)

const fs = require('fs');
const path = require('path');

const ROUTES_DIR = path.join(__dirname, '..', 'src', 'routes');
const INDEX_FILE = path.join(__dirname, '..', 'src', 'index.js');

// 1. 从 index.js 读挂载点：app.use('/api/xxx', xxxRouter)
const indexContent = fs.readFileSync(INDEX_FILE, 'utf-8');
const mountRegex = /app\.use\(['"`]([^'"`]+)['"`],\s*(\w+)\)/g;
const mounts = {};  // routerVarName -> mountPath
let m;
while ((m = mountRegex.exec(indexContent)) !== null) {
  mounts[m[2]] = m[1];
}

// 2. import 关系：routerVarName -> filePath
const importRegex = /import\s+(\w+)\s+from\s+['"`]\.\/routes\/([^'"`]+)['"`]/g;
const routerFiles = {};
while ((m = importRegex.exec(indexContent)) !== null) {
  routerFiles[m[1]] = m[2];
}

// 3. 每个 route file 扫 router.<method>('/path', ...)
const endpoints = [];
for (const [varName, mountPath] of Object.entries(mounts)) {
  const file = routerFiles[varName];
  if (!file) continue;
  const filePath = path.join(ROUTES_DIR, file);
  if (!fs.existsSync(filePath)) continue;
  const content = fs.readFileSync(filePath, 'utf-8');
  const routeRegex = /router\.(get|post|put|patch|delete)\(['"`]([^'"`]+)['"`]/gi;
  let r;
  while ((r = routeRegex.exec(content)) !== null) {
    const method = r[1].toUpperCase();
    const localPath = r[2];
    const fullPath = (mountPath + (localPath === '/' ? '' : localPath)).replace(/\/+/g, '/');
    endpoints.push({ method, path: fullPath, file, router: varName });
  }
}

// 4. Output as markdown
console.log('# K0 API Endpoints Inventory');
console.log('');
console.log('_自动生成 by `scripts/introspect-routes.cjs` — 从 backend/src/routes 扫出_');
console.log('');
console.log(`**Total endpoints**: ${endpoints.length}`);
console.log('');
console.log('| Method | Path | Router | File |');
console.log('|--------|------|--------|------|');
endpoints.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
for (const e of endpoints) {
  console.log(`| ${e.method} | \`${e.path}\` | ${e.router} | routes/${e.file} |`);
}
