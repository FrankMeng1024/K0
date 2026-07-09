// K0 格式化工具 — 单一来源
// 原 fmtTs 在 K0Card / snapshot / episode 各写一份 (Phase A 收敛)

/**
 * 秒 → "m:ss" 时间戳显示
 * null/undefined → 空串 (卡片无时间戳时隐藏);
 * 0 及正数 → 正常格式化 (skippable/worth 段 0:00 起点必须显示为 "0:00")
 * 秒数四舍五入
 */
export function fmtTs(sec?: number | null): string {
  if (sec == null || sec < 0) return '';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
