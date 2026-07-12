// embedding.service.js — 概念向量语义匹配 (路 A, #116 多篇脑图)
//
// ⚠️ 计费端点物理隔离 (2026-07-12):
//   embedding-3 是向量模型, Coding Plan Lite **不含** (实测 /coding/ 端点报 1113)。
//   所以本文件写死走 **按量付费端点** EMBED_BASE_URL (/api/paas/v4, 无 /coding/),
//   从账户 API 余额扣钱 (Frank 已充 5 元, 够几十万次)。
//   chat 生成 (packGenerator) 永远走 GLM_BASE_URL (/coding/paas/v4) 扣 Lite —— 两条线不交叉。
//   本文件 **绝不** import 或复用 GLM_BASE_URL, 从代码上杜绝 chat 误走按量端点。
//
// 省钱设计:
//   - 批量: 一次请求塞多个概念 (embedding-3 支持 input 数组)
//   - 内存缓存: 同一进程内相同概念不重复调 (LRU 上限, 防内存涨)
//   - 失败静默: 1113/超时/任何错 → 返回 null, 调用方回退字面匹配, 绝不 throw 崩接口
import pino from 'pino';

const log = pino({ level: process.env.LOG_LEVEL || 'info' }).child({ mod: 'embedding' });

// 按量端点 (无 /coding/) —— 与 chat 的 coding 端点物理隔离
const EMBED_BASE_URL = process.env.GLM_EMBED_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4';
const EMBED_MODEL = process.env.GLM_EMBED_MODEL || 'embedding-3';
const EMBED_DIM = 1024;
const EMBED_TIMEOUT_MS = 20_000;
// 语义"讲同一个东西"阈值: 实测 embedding-3 无关词基线~0.64, 强相关(人工智能↔AI创业)0.80,
//   中等相关(大模型↔人工智能/神经网络↔大模型)0.69-0.72 → 取 0.72 兼顾召回不误连
export const SEMANTIC_THRESHOLD = 0.72;

// 断言: 若有人误把 coding 端点塞进来, 立即报错 (防串线花错钱)
if (EMBED_BASE_URL.includes('/coding/')) {
  throw new Error('[embedding] FATAL: embedding 端点不得含 /coding/ (会误扣 Lite 且 embedding 不被 coding 支持)');
}

// ── 内存缓存 (概念文本 → 向量) ──
const cache = new Map(); // key: normalized term, val: number[]
const CACHE_MAX = 5000;
const normKey = (s) => String(s || '').trim().toLowerCase();

function cachePut(term, vec) {
  const k = normKey(term);
  if (cache.has(k)) cache.delete(k);
  cache.set(k, vec);
  if (cache.size > CACHE_MAX) {
    const first = cache.keys().next().value;
    cache.delete(first);
  }
}

/**
 * 批量取概念向量。命中缓存的不重复调 API。
 * @param {string[]} terms
 * @returns {Promise<Map<string, number[]>>} term → vector (失败的 term 不在 map 里)
 */
export async function embedConcepts(terms) {
  const out = new Map();
  const uniq = [...new Set(terms.map(t => String(t || '').trim()).filter(Boolean))];
  const need = [];
  for (const t of uniq) {
    const cached = cache.get(normKey(t));
    if (cached) out.set(t, cached);
    else need.push(t);
  }
  if (need.length === 0) return out;

  const apiKey = process.env.GLM_API_KEY;
  if (!apiKey) {
    log.warn('GLM_API_KEY 缺失, embedding 跳过 (回退字面匹配)');
    return out;
  }

  // 分批 (embedding-3 单次 input 上限保守取 64)
  const BATCH = 64;
  for (let i = 0; i < need.length; i += BATCH) {
    const chunk = need.slice(i, i + BATCH);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), EMBED_TIMEOUT_MS);
    try {
      const resp = await fetch(`${EMBED_BASE_URL}/embeddings`, {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: EMBED_MODEL, input: chunk, dimensions: EMBED_DIM }),
      });
      clearTimeout(timer);
      if (!resp.ok) {
        const body = await resp.text().catch(() => '');
        log.warn({ status: resp.status, body: body.slice(0, 120) }, 'embedding 调用失败, 回退字面匹配');
        // 1113 余额不足 / 任何错 → 静默返回已有的, 调用方回退
        return out;
      }
      const json = await resp.json();
      (json.data || []).forEach((d, idx) => {
        const term = chunk[idx];
        if (Array.isArray(d.embedding)) {
          out.set(term, d.embedding);
          cachePut(term, d.embedding);
        }
      });
    } catch (err) {
      clearTimeout(timer);
      log.warn({ err: String(err?.message || err) }, 'embedding 异常, 回退字面匹配');
      return out;
    }
  }
  return out;
}

/** 余弦相似度 */
export function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
