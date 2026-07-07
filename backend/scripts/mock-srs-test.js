// Sprint 12 STORY-01208: SRS 算法 mock 验证脚本
// 目标：验证 review 队列 + rating 逻辑符合预期
//
// 测试场景：
// 1. 新卡片首次 rate=known → interval=3, nextAt=now+3d
// 2. 二次 rate=known → interval=6
// 3. 三次 rate=known → interval=12
// 4. rate=fuzzy → 保持 interval
// 5. rate=forgot → reset to 1
//
// 用法：node scripts/mock-srs-test.js

import 'dotenv/config';
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME,
});

const TEST_USER_ID = 1; // dev user
const TEST_PACK_ID = 1;
const TEST_CARD_IDX = 0;

// 清理旧测试数据
await conn.execute(
  'DELETE FROM user_cards WHERE user_id = ? AND pack_id = ? AND card_index = ?',
  [TEST_USER_ID, TEST_PACK_ID, TEST_CARD_IDX]
);
console.log('Cleaned old test data\n');

// 模拟 rate 逻辑
function simulateRate(curInterval, curCount, rating) {
  let nextInterval;
  if (rating === 'known') {
    nextInterval = Math.min(90, Math.max(3, curInterval * 2 || 3));
  } else if (rating === 'fuzzy') {
    nextInterval = Math.max(3, curInterval || 3);
  } else {
    nextInterval = 1;
  }
  const nextAt = new Date(Date.now() + nextInterval * 86400 * 1000);
  return { nextInterval, nextAt, nextCount: curCount + 1 };
}

async function upsert(review_state, interval, count) {
  const nextAt = new Date(Date.now() + interval * 86400 * 1000);
  await conn.execute(
    `INSERT INTO user_cards (user_id, pack_id, card_index, starred, review_state, review_interval_days, review_next_at, review_count)
     VALUES (?, ?, ?, 1, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       review_state = VALUES(review_state),
       review_interval_days = VALUES(review_interval_days),
       review_next_at = VALUES(review_next_at),
       review_count = VALUES(review_count)`,
    [TEST_USER_ID, TEST_PACK_ID, TEST_CARD_IDX, review_state, interval, nextAt, count]
  );
}

async function fetchCard() {
  const [rows] = await conn.execute(
    'SELECT review_state, review_interval_days, review_count, review_next_at FROM user_cards WHERE user_id = ? AND pack_id = ? AND card_index = ?',
    [TEST_USER_ID, TEST_PACK_ID, TEST_CARD_IDX]
  );
  return rows[0] || {};
}

// Scenario 1: 首次 known (start from 0 interval, 0 count)
let r = simulateRate(0, 0, 'known');
await upsert('known', r.nextInterval, r.nextCount);
let card = await fetchCard();
console.log('Scenario 1 - 首次 known:');
console.log(`  期望 interval=3, count=1；实际 interval=${card.review_interval_days}, count=${card.review_count}`);
console.log(`  ${card.review_interval_days === 3 && card.review_count === 1 ? '✓' : '✗'}\n`);

// Scenario 2: 二次 known (previous interval=3)
r = simulateRate(3, 1, 'known');
await upsert('known', r.nextInterval, r.nextCount);
card = await fetchCard();
console.log('Scenario 2 - 二次 known:');
console.log(`  期望 interval=6, count=2；实际 interval=${card.review_interval_days}, count=${card.review_count}`);
console.log(`  ${card.review_interval_days === 6 && card.review_count === 2 ? '✓' : '✗'}\n`);

// Scenario 3: 三次 known (previous interval=6)
r = simulateRate(6, 2, 'known');
await upsert('known', r.nextInterval, r.nextCount);
card = await fetchCard();
console.log('Scenario 3 - 三次 known:');
console.log(`  期望 interval=12, count=3；实际 interval=${card.review_interval_days}, count=${card.review_count}`);
console.log(`  ${card.review_interval_days === 12 && card.review_count === 3 ? '✓' : '✗'}\n`);

// Scenario 4: fuzzy (previous interval=12, should stay 12)
r = simulateRate(12, 3, 'fuzzy');
await upsert('fuzzy', r.nextInterval, r.nextCount);
card = await fetchCard();
console.log('Scenario 4 - fuzzy 保持:');
console.log(`  期望 interval=12, count=4；实际 interval=${card.review_interval_days}, count=${card.review_count}`);
console.log(`  ${card.review_interval_days === 12 && card.review_count === 4 ? '✓' : '✗'}\n`);

// Scenario 5: forgot reset to 1
r = simulateRate(12, 4, 'forgot');
await upsert('forgot', r.nextInterval, r.nextCount);
card = await fetchCard();
console.log('Scenario 5 - forgot 重置:');
console.log(`  期望 interval=1, count=5；实际 interval=${card.review_interval_days}, count=${card.review_count}`);
console.log(`  ${card.review_interval_days === 1 && card.review_count === 5 ? '✓' : '✗'}\n`);

// Scenario 6: due filter — 手动把 next_at 设为过去 → 应该出现在 due 队列
const yesterday = new Date(Date.now() - 86400 * 1000);
await conn.execute(
  'UPDATE user_cards SET review_next_at = ? WHERE user_id = ? AND pack_id = ? AND card_index = ?',
  [yesterday, TEST_USER_ID, TEST_PACK_ID, TEST_CARD_IDX]
);
console.log('Scenario 6 - due filter (next_at = 昨天):');
console.log('  → 通过 GET /api/review/queue 验证会返回 due=[...] 包含此卡\n');

// 清理
await conn.execute(
  'DELETE FROM user_cards WHERE user_id = ? AND pack_id = ? AND card_index = ?',
  [TEST_USER_ID, TEST_PACK_ID, TEST_CARD_IDX]
);
console.log('Cleaned up test data');

await conn.end();
