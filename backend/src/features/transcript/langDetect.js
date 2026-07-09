// Language detection — Sprint 2 STORY-00013
// Rule-based detection: no external deps, no ML
// Rules:
//   < 20 chars        → 'unknown'
//   CJK ratio > 30%   → 'zh'
//   ASCII letter ratio > 60% → 'en'
//   otherwise         → 'unknown'

const MIN_CHARS = 20;
const CJK_ZH_THRESHOLD = 0.30;
const ASCII_EN_THRESHOLD = 0.60;

// CJK Unified Ideographs + Extension A/B + CJK Compatibility Ideographs
// U+4E00–U+9FFF (core), U+3400–U+4DBF (Ext A), U+F900–U+FAFF (Compat)
const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g;

// ASCII letter a–z A–Z
const ASCII_LETTER_RE = /[a-zA-Z]/g;

// Strip HTML tags before analysis (preserve spacing, do not collapse)
function stripHtml(str) {
  return str.replace(/<[^>]*>/g, ' ');
}

/**
 * Detect language from text.
 *
 * @param {string} text - Raw text (may contain HTML)
 * @returns {'en' | 'zh' | 'unknown'}
 */
export function detectLanguage(text) {
  if (!text || typeof text !== 'string') return 'unknown';

  const clean = stripHtml(text);
  if (clean.trim().length < MIN_CHARS) return 'unknown';

  const total = clean.length;

  // Count CJK characters
  const cjkMatches = clean.match(CJK_RE);
  const cjkCount = cjkMatches ? cjkMatches.length : 0;
  const cjkRatio = cjkCount / total;

  const asciiMatches = clean.match(ASCII_LETTER_RE);
  const asciiCount = asciiMatches ? asciiMatches.length : 0;
  const asciiRatio = asciiCount / total;

  // Sprint 6: mixed 检测 — CJK > 15% AND ASCII 单词 > 5%（有明显中英夹杂）
  // 英文单词计数（≥3 字母连续的 token）
  const wordMatches = clean.match(/[a-zA-Z]{3,}/g);
  const wordCount = wordMatches ? wordMatches.length : 0;
  const wordDensity = wordCount / (total / 100);  // 每 100 字符里的英文单词数

  if (cjkRatio > 0.15 && wordDensity > 1.0) return 'mixed';

  if (cjkRatio > CJK_ZH_THRESHOLD) return 'zh';

  if (asciiRatio > ASCII_EN_THRESHOLD) return 'en';

  return 'unknown';
}
