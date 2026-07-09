#!/usr/bin/env node
// K0 DB 备份工具 (mysqldump 不可用时的 JS 替代)
// 用法: node scripts/db_backup.cjs [输出路径]
// 产出: 可直接 mysql < file 恢复的 SQL (含 DROP + CREATE + INSERT)
// Risk review 强制: 每个 Phase Exit 前跑一次, 凝固可回滚 baseline
require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

function esc(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (Buffer.isBuffer(v)) return `0x${v.toString('hex')}`;
  if (v instanceof Date) return `'${v.toISOString().slice(0, 19).replace('T', ' ')}'`;
  return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r')}'`;
}

(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST, port: parseInt(process.env.DB_PORT || 3306),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  });

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = path.join(__dirname, '..', 'backups');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = process.argv[2] || path.join(outDir, `k0_v3_${ts}.sql`);

  const [tables] = await c.query('SHOW TABLES');
  const tableKey = Object.keys(tables[0])[0];
  const names = tables.map(t => t[tableKey]);

  let sql = `-- K0 DB backup ${ts} (db=${process.env.DB_NAME})\n`;
  sql += `-- 生成工具: scripts/db_backup.cjs (mysqldump 替代)\n`;
  sql += `SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS = 0;\n\n`;

  let totalRows = 0;
  for (const name of names) {
    const [[{ 'Create Table': ddl }]] = await c.query(`SHOW CREATE TABLE \`${name}\``);
    sql += `DROP TABLE IF EXISTS \`${name}\`;\n${ddl};\n\n`;
    const [rows] = await c.query(`SELECT * FROM \`${name}\``);
    if (rows.length) {
      const cols = Object.keys(rows[0]);
      const colList = cols.map(cn => `\`${cn}\``).join(', ');
      for (const r of rows) {
        const vals = cols.map(cn => esc(r[cn])).join(', ');
        sql += `INSERT INTO \`${name}\` (${colList}) VALUES (${vals});\n`;
      }
      sql += '\n';
      totalRows += rows.length;
    }
  }
  sql += `SET FOREIGN_KEY_CHECKS = 1;\n`;

  fs.writeFileSync(outPath, sql, 'utf-8');
  console.log(`✅ 备份完成: ${outPath}`);
  console.log(`   ${names.length} 张表, ${totalRows} 行数据, ${(sql.length / 1024).toFixed(1)} KB`);
  await c.end();
})().catch(e => { console.error('备份失败:', e.message); process.exit(1); });
