// K0 Backend — 复习提醒调度器 (#102-A)
// 每天扫一遍: 谁有到期的知识卡片 或 到期的主动回忆题 → 发一条合并推送。
// 每用户每天最多一条 (reminder_log 去重), 只在设定时段发, 避免打扰。
//
// 设计取舍:
//   - in-process setInterval (每小时醒一次, 命中发送时段 + 当天未发过才发)。
//     systemd 常驻, 重启后自动重新 arm; 错过某小时不补发(每天只发一次, 无所谓)。
//   - 不引入 node-cron 依赖 (保持 deps 精简, 与项目"能不加就不加"一致)。
//   - 复用 pushService.sendExpoPush + push_tokens。
import pino from 'pino';
import { db } from './db.js';
import { sendExpoPush } from './pushService.js';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' }).child({ mod: 'reminder' });

// 发送时段 (本地小时). 默认 每天 20 点前后扫一次发提醒 (晚上复习场景)。
const SEND_HOUR = parseInt(process.env.REMINDER_HOUR || '20', 10);
const CHECK_INTERVAL_MS = 60 * 60 * 1000;   // 每小时醒一次

// 本地日期字符串 YYYY-MM-DD
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 扫一遍所有有到期复习内容的用户, 每人发一条合并提醒 (当天未发过)。
 * 返回 { scanned, sent } 便于测试/日志。
 */
export async function runReminderSweep({ force = false } = {}) {
  if (!db) return { scanned: 0, sent: 0, reason: 'no-db' };
  const today = todayStr();

  // 到期卡片: user_cards starred=1 archived=0 且 review_next_at<=now
  // 到期回忆题: user_recall kind=question 且 next_at<=now
  // 合并成 per-user 计数
  let rows;
  try {
    [rows] = await db.execute(
      `SELECT u.user_id,
              SUM(u.due_cards) AS due_cards,
              SUM(u.due_recall) AS due_recall
       FROM (
         SELECT user_id, COUNT(*) AS due_cards, 0 AS due_recall
           FROM user_cards
          WHERE starred = 1 AND archived = 0 AND review_next_at IS NOT NULL AND review_next_at <= NOW()
          GROUP BY user_id
         UNION ALL
         SELECT user_id, 0 AS due_cards, COUNT(*) AS due_recall
           FROM user_recall
          WHERE kind = 'question' AND next_at IS NOT NULL AND next_at <= NOW()
          GROUP BY user_id
       ) u
       GROUP BY u.user_id`
    );
  } catch (e) {
    logger.error({ err: e?.message }, 'reminder_sweep_query_failed');
    return { scanned: 0, sent: 0, reason: 'query-failed' };
  }

  let sent = 0;
  for (const r of rows) {
    const userId = r.user_id;
    const dueCards = Number(r.due_cards) || 0;
    const dueRecall = Number(r.due_recall) || 0;
    if (dueCards + dueRecall === 0) continue;

    // 当天去重: 尝试插 reminder_log, 唯一键冲突=今天已发过, 跳过
    try {
      const [ins] = await db.execute(
        `INSERT IGNORE INTO reminder_log (user_id, sent_date, kind, due_cards, due_recall)
         VALUES (?, ?, 'review', ?, ?)`,
        [userId, today, dueCards, dueRecall]
      );
      if (!force && ins.affectedRows === 0) continue;   // 今天已发过
    } catch (e) {
      logger.warn({ err: e?.message, userId }, 'reminder_log_insert_failed');
      continue;
    }

    // 拉 token
    let tokens = [];
    try {
      const [tk] = await db.execute(
        `SELECT token FROM push_tokens WHERE user_id = ? ORDER BY updated_at DESC LIMIT 10`,
        [userId]
      );
      tokens = tk.map(t => t.token);
    } catch { /* ignore */ }
    if (!tokens.length) continue;

    // 文案
    const parts = [];
    if (dueCards > 0) parts.push(`${dueCards} 张卡片`);
    if (dueRecall > 0) parts.push(`${dueRecall} 道回忆题`);
    const body = `今天有 ${parts.join(' 和 ')} 到复习时间了，花几分钟巩固一下？`;

    const messages = tokens.map(token => ({
      to: token,
      title: '该复习啦',
      body,
      sound: 'default',
      data: { kind: 'review_due', dueCards, dueRecall },
    }));
    const res = await sendExpoPush(messages);
    if (res.ok) { sent++; logger.info({ userId, dueCards, dueRecall }, 'reminder_sent'); }
  }
  logger.info({ scanned: rows.length, sent }, 'reminder_sweep_done');
  return { scanned: rows.length, sent };
}

let timer = null;
/**
 * 启动调度器: 每小时醒一次, 到 SEND_HOUR 那个小时且今天没发过就扫一遍。
 * reminder_log 的当天去重保证一天只发一次, 即使这个小时被多次触发。
 */
export function startReminderScheduler() {
  if (timer) return;
  const tick = async () => {
    try {
      const hour = new Date().getHours();
      if (hour === SEND_HOUR) {
        await runReminderSweep();
      }
    } catch (e) {
      logger.error({ err: e?.message }, 'reminder_tick_failed');
    }
  };
  timer = setInterval(tick, CHECK_INTERVAL_MS);
  timer.unref?.();
  logger.info({ sendHour: SEND_HOUR }, 'reminder_scheduler_started');
  // 启动时若正好在发送时段, 立刻跑一次
  tick();
}

export function stopReminderScheduler() {
  if (timer) { clearInterval(timer); timer = null; }
}
