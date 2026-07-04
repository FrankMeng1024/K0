// GLM service — Sprint 2 STORY-00020
// Calls GLM-4-flash via OpenAI-compatible API to generate SnapshotObject
// Model note: SPIKE-003 used glm-4-flash (user confirmed due to glm-4-plus balance)

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const GLM_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const GLM_MODEL = process.env.GLM_MODEL || 'glm-4-flash';
const TIMEOUT_MS = 25_000;

// Load prompt files at startup (fail fast if missing)
const PROMPTS = {
  zh: readFileSync(join(__dirname, '../../prompts/snapshot.zh.md'), 'utf8'),
  en: readFileSync(join(__dirname, '../../prompts/snapshot.en.md'), 'utf8'),
};

const PACK_PROMPTS = {
  zh: readFileSync(join(__dirname, '../../prompts/generate-pack.zh.md'), 'utf8'),
  en: readFileSync(join(__dirname, '../../prompts/generate-pack.en.md'), 'utf8'),
};

/**
 * Extract system prompt from a prompt markdown file.
 * Looks for the first ```...``` block after "## System Prompt"
 */
function extractSystemPrompt(md) {
  const section = md.split('## System Prompt')[1];
  if (!section) throw new Error('Prompt file missing ## System Prompt section');
  const match = section.match(/```\n([\s\S]*?)```/);
  if (!match) throw new Error('Prompt file missing fenced code block in System Prompt section');
  return match[1].trim();
}

/**
 * Extract user prompt template from a prompt markdown file.
 * Looks for the first ```...``` block after "## User Prompt"
 */
function extractUserPromptTemplate(md) {
  const section = md.split('## User Prompt')[1];
  if (!section) throw new Error('Prompt file missing ## User Prompt section');
  const match = section.match(/```\n([\s\S]*?)```/);
  if (!match) throw new Error('Prompt file missing fenced code block in User Prompt section');
  return match[1].trim();
}

const SYSTEM_PROMPTS = {
  zh: extractSystemPrompt(PROMPTS.zh),
  en: extractSystemPrompt(PROMPTS.en),
};

const USER_PROMPT_TEMPLATES = {
  zh: extractUserPromptTemplate(PROMPTS.zh),
  en: extractUserPromptTemplate(PROMPTS.en),
};

const PACK_SYSTEM_PROMPTS = {
  zh: extractSystemPrompt(PACK_PROMPTS.zh),
  en: extractSystemPrompt(PACK_PROMPTS.en),
};

const PACK_USER_TEMPLATES = {
  zh: extractUserPromptTemplate(PACK_PROMPTS.zh),
  en: extractUserPromptTemplate(PACK_PROMPTS.en),
};

/**
 * Validate SnapshotObject shape.
 * Returns an array of validation errors (empty = valid).
 */
function validateSnapshot(obj) {
  const errors = [];

  if (typeof obj.oneSentence !== 'string' || obj.oneSentence.trim() === '') {
    errors.push('oneSentence must be a non-empty string');
  }

  if (!Array.isArray(obj.corePoints) || obj.corePoints.length !== 3) {
    errors.push('corePoints must be an array of exactly 3 items');
  } else {
    for (let i = 0; i < obj.corePoints.length; i++) {
      const cp = obj.corePoints[i];
      if (typeof cp.point !== 'string') errors.push(`corePoints[${i}].point must be string`);
      if (typeof cp.timestamp !== 'number') errors.push(`corePoints[${i}].timestamp must be number`);
    }
  }

  if (!Array.isArray(obj.audience)) {
    errors.push('audience must be an array');
  }

  if (!obj.valueScore || typeof obj.valueScore !== 'object') {
    errors.push('valueScore must be an object');
  } else {
    for (const key of ['density', 'novelty', 'actionability']) {
      const v = obj.valueScore[key];
      if (!Number.isInteger(v) || v < 1 || v > 10) {
        errors.push(`valueScore.${key} must be integer 1-10`);
      }
    }
  }

  if (!Number.isInteger(obj.estimatedCostMinutes) || obj.estimatedCostMinutes < 1) {
    errors.push('estimatedCostMinutes must be a positive integer');
  }

  if (!Array.isArray(obj.worthListening) || obj.worthListening.length !== 3) {
    errors.push('worthListening must be an array of exactly 3 items');
  }

  if (!Array.isArray(obj.skippable)) {
    errors.push('skippable must be an array');
  }

  return errors;
}

/**
 * Generate a learning snapshot for a podcast episode.
 *
 * @param {{ text: string, language: 'en' | 'zh' | 'unknown', title?: string, source?: string, duration?: number }} params
 * @returns {Promise<SnapshotObject>}
 * @throws {{ error: 'GLM_TIMEOUT' | 'GLM_MALFORMED_JSON' }} on failure
 */
export async function generateSnapshot({ text, language, title = '', source = '', duration = 0 }) {
  const apiKey = process.env.GLM_API_KEY;
  if (!apiKey) throw new Error('GLM_API_KEY not configured');

  // Use zh prompt for Chinese content, en prompt for everything else
  const lang = language === 'zh' ? 'zh' : 'en';
  const systemPrompt = SYSTEM_PROMPTS[lang];

  const userPromptTemplate = USER_PROMPT_TEMPLATES[lang];
  const userPrompt = userPromptTemplate
    .replace('{title}', title || '(untitled)')
    .replace('{source}', source || '(unknown)')
    .replace('{duration}', String(duration || 0))
    .replace('{transcript}', text);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let rawText;
  try {
    const response = await fetch(GLM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GLM_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        top_p: 0.7,
        max_tokens: 2048,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      const err = new Error(`GLM API error ${response.status}: ${errBody}`);
      err.glmError = 'GLM_API_ERROR';
      throw err;
    }

    const data = await response.json();
    rawText = data.choices?.[0]?.message?.content;
    if (!rawText) {
      const err = new Error('GLM returned empty content');
      err.glmError = 'GLM_MALFORMED_JSON';
      throw err;
    }
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      const e = new Error('GLM request timed out');
      e.glmError = 'GLM_TIMEOUT';
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  // Parse JSON
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    const err = new Error(`GLM returned invalid JSON: ${rawText.slice(0, 200)}`);
    err.glmError = 'GLM_MALFORMED_JSON';
    throw err;
  }

  // Validate shape
  const validationErrors = validateSnapshot(parsed);
  if (validationErrors.length > 0) {
    const err = new Error(`GLM snapshot validation failed: ${validationErrors.join('; ')}`);
    err.glmError = 'GLM_MALFORMED_JSON';
    throw err;
  }

  return parsed;
}

/** Validate full PackObject shape returned by GLM */
function validatePack(obj) {
  const errors = [];

  // snapshot
  if (!obj.snapshot) { errors.push('missing snapshot'); return errors; }
  const snapErrors = validateSnapshot(obj.snapshot);
  errors.push(...snapErrors.map(e => `snapshot.${e}`));

  // steps
  if (!Array.isArray(obj.steps) || obj.steps.length !== 6) {
    errors.push('steps must be array of exactly 6');
  } else {
    for (let i = 0; i < 6; i++) {
      const s = obj.steps[i];
      if (s.stepNumber !== i + 1) errors.push(`steps[${i}].stepNumber must be ${i + 1}`);
      if (typeof s.title !== 'string' || !s.title) errors.push(`steps[${i}].title required`);
      if (typeof s.content !== 'string' || !s.content) errors.push(`steps[${i}].content required`);
      if (!Array.isArray(s.citations)) errors.push(`steps[${i}].citations must be array`);
    }
  }

  // cards
  const validCardTypes = ['opinion', 'method', 'case', 'reflection', 'action'];
  if (!Array.isArray(obj.cards) || obj.cards.length < 3 || obj.cards.length > 5) {
    errors.push('cards must be array of 3-5 items');
  } else {
    for (let i = 0; i < obj.cards.length; i++) {
      const c = obj.cards[i];
      if (!validCardTypes.includes(c.type)) errors.push(`cards[${i}].type invalid`);
      if (typeof c.title !== 'string' || !c.title) errors.push(`cards[${i}].title required`);
      if (typeof c.explanation !== 'string' || !c.explanation) errors.push(`cards[${i}].explanation required`);
    }
  }

  // actions
  if (!obj.actions) { errors.push('missing actions'); }
  else {
    for (const key of ['today', 'thisWeek', 'longTerm']) {
      if (typeof obj.actions[key] !== 'string' || !obj.actions[key]) {
        errors.push(`actions.${key} required`);
      }
    }
  }

  return errors;
}

/**
 * Generate a full learning pack for a podcast episode.
 *
 * @param {{ text: string, language: 'en' | 'zh' | 'unknown', title?: string, source?: string, duration?: number, goal: string }} params
 * @returns {Promise<{ snapshot, steps, cards, actions }>}
 */
export async function generatePack({ text, language, title = '', source = '', duration = 0, goal }) {
  const apiKey = process.env.GLM_API_KEY;
  if (!apiKey) throw new Error('GLM_API_KEY not configured');

  const lang = language === 'zh' ? 'zh' : 'en';
  const systemPrompt = PACK_SYSTEM_PROMPTS[lang];
  const userPrompt = PACK_USER_TEMPLATES[lang]
    .replace('{title}', title || '(untitled)')
    .replace('{source}', source || '(unknown)')
    .replace('{duration}', String(duration || 0))
    .replace('{goal}', goal)
    .replace('{transcript}', text);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let rawText;
  try {
    const response = await fetch(GLM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GLM_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        top_p: 0.7,
        max_tokens: 4096,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      const err = new Error(`GLM API error ${response.status}: ${errBody}`);
      err.glmError = 'GLM_API_ERROR';
      throw err;
    }

    const data = await response.json();
    rawText = data.choices?.[0]?.message?.content;
    if (!rawText) {
      const err = new Error('GLM returned empty content');
      err.glmError = 'GLM_MALFORMED_JSON';
      throw err;
    }
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      const e = new Error('GLM request timed out');
      e.glmError = 'GLM_TIMEOUT';
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    const err = new Error(`GLM returned invalid JSON: ${rawText.slice(0, 200)}`);
    err.glmError = 'GLM_MALFORMED_JSON';
    throw err;
  }

  const validationErrors = validatePack(parsed);
  if (validationErrors.length > 0) {
    const err = new Error(`GLM pack validation failed: ${validationErrors.join('; ')}`);
    err.glmError = 'GLM_MALFORMED_JSON';
    throw err;
  }

  return parsed;
}
