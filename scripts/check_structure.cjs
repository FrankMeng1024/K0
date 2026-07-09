#!/usr/bin/env node
// 前端结构防劣化检查 (Phase F guardrail — 无 ESLint 时的轻量替代)
// 用法: node scripts/check_structure.cjs
// 规则:
//  1. CARD_TYPE_COLORS / CARD_TYPE_LABELS 字面量定义只能出现在 constants/
//  2. app/** 不得直接 import apiFetch/apiGet/apiPost (业务读取须走 hooks/)
//     — 例外: 允许 import apiFetch 做 mutation (PATCH/POST/DELETE), 只禁 GET 读取直连
//     简化实现: 只警告 app/** 里出现裸 apiGet import (读取应走 hook)
//  3. 被 2+ app 页复用的子组件不得留在 app/ (人工约定, 此处不自动查)
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let violations = 0;

function walk(dir, cb) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === '.git') continue;
      walk(p, cb);
    } else if (/\.(ts|tsx)$/.test(name)) {
      cb(p);
    }
  }
}

// 规则 1: CARD_TYPE_COLORS/LABELS 定义只能在 constants/
walk(path.join(ROOT, 'app'), (file) => {
  const src = fs.readFileSync(file, 'utf-8');
  if (/const\s+CARD_TYPE_(COLORS|LABELS)\s*[:=]/.test(src)) {
    console.error(`❌ [规则1] ${path.relative(ROOT, file)}: 定义了 CARD_TYPE_* 字面量, 应改为 import from '@/constants/cardTypes'`);
    violations++;
  }
});
walk(path.join(ROOT, 'components'), (file) => {
  const src = fs.readFileSync(file, 'utf-8');
  if (/const\s+CARD_TYPE_(COLORS|LABELS)\s*[:=]/.test(src)) {
    console.error(`❌ [规则1] ${path.relative(ROOT, file)}: 定义了 CARD_TYPE_* 字面量, 应改为 import from '@/constants/cardTypes'`);
    violations++;
  }
});

// 规则 2: app/** 读取应走 hook (裸 apiGet import 警告)
walk(path.join(ROOT, 'app'), (file) => {
  const src = fs.readFileSync(file, 'utf-8');
  // 只检查 import 里有 apiGet (读取). apiFetch/apiPost 允许 (mutation)。
  const importLine = src.split('\n').find(l => /import\s*\{[^}]*\bapiGet\b[^}]*\}\s*from\s*['"]@\/lib\/api['"]/.test(l));
  if (importLine) {
    console.error(`⚠️  [规则2] ${path.relative(ROOT, file)}: 直接 import apiGet — 服务端读取建议走 hooks/ (React Query drop-in)`);
    // 警告不计入 violations (渐进迁移, 不硬失败)
  }
});

if (violations > 0) {
  console.error(`\n结构检查失败: ${violations} 处违规`);
  process.exit(1);
}
console.log('✅ 结构检查通过');
