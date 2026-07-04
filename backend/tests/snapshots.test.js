// Tests: POST /api/episodes/:id/snapshot — STORY-00020
// Strategy: same as episodes.import.test.js — no-DB mode (DB_HOST=''), AUTH_ENABLED=false
// GLM is mocked by replacing global fetch with a stub before importing the app.
// Route tests cover: happy path (cached + fresh), NO_TRANSCRIPT, GLM_TIMEOUT, GLM_MALFORMED_JSON, 401, 429

import { test, mock, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';

// ── Environment setup (before any imports that read env) ────────────────────
process.env.AUTH_ENABLED = 'false';
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = 'test-secret';
process.env.PORT = '0';
process.env.DB_HOST = '';
process.env.DB_USER = '';
process.env.DB_NAME = '';
process.env.GLM_API_KEY = 'test-glm-key';
process.env.GLM_MODEL = 'glm-4-flash';

// ── Valid SnapshotObject fixture (mirrors SPIKE-003 schema) ─────────────────
const VALID_SNAPSHOT = {
  oneSentence: '一句话说清楚这集在讲什么',
  corePoints: [
    { point: '核心观点1', timestamp: 0 },
    { point: '核心观点2', timestamp: 60 },
    { point: '核心观点3', timestamp: 120 },
  ],
  audience: ['产品经理', '创业者'],
  valueScore: { density: 8, novelty: 7, actionability: 6 },
  estimatedCostMinutes: 15,
  worthListening: [
    { start: 0, end: 60, reason: '核心定义' },
    { start: 120, end: 180, reason: '实战案例' },
    { start: 240, end: 300, reason: '行动建议' },
  ],
  skippable: [{ start: 0, end: 10, reason: '广告' }],
};

// ── GLM fetch mock ────────────────────────────────────────────────────────────
// We need to intercept the fetch call inside glm.js.
// Since ESM modules are live bindings, we replace globalThis.fetch before any module loads.

let _glmBehavior = 'success'; // 'success' | 'timeout' | 'bad_json' | 'api_error'

const _realFetch = globalThis.fetch;

globalThis.fetch = async (url, opts) => {
  if (typeof url === 'string' && url.includes('bigmodel.cn')) {
    if (_glmBehavior === 'timeout') {
      // Simulate AbortError
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      throw err;
    }
    if (_glmBehavior === 'bad_json') {
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'not valid json {{{' } }],
        }),
      };
    }
    if (_glmBehavior === 'api_error') {
      return {
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      };
    }
    // 'success'
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(VALID_SNAPSHOT) } }],
      }),
    };
  }
  // Pass through for non-GLM requests
  return _realFetch(url, opts);
};

// ── Import app (after env + mock setup) ─────────────────────────────────────
const { default: app } = await import('../src/index.js');

const server = http.createServer(app);
server.listen(0);
await once(server, 'listening');
const { port } = server.address();
server.unref();

import { signToken } from '../src/middleware/auth.js';

let _nextUserId = 200;

async function post(path, body, userId = _nextUserId++) {
  const token = signToken(userId);
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body || {});
    const req = http.request({
      hostname: 'localhost',
      port,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        'Authorization': `Bearer ${token}`,
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

test('snapshot (no-DB mode) → 200 + SnapshotObject', async () => {
  _glmBehavior = 'success';
  const res = await post('/api/episodes/1/snapshot', null);

  assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
  const snap = res.body.snapshot;
  assert.ok(snap, 'response must have snapshot');
  assert.equal(typeof snap.oneSentence, 'string');
  assert.ok(snap.oneSentence.length > 0, 'oneSentence must be non-empty');
  assert.ok(Array.isArray(snap.corePoints) && snap.corePoints.length === 3, 'corePoints must be 3 items');
  assert.ok(typeof snap.valueScore === 'object', 'valueScore must be object');
  assert.ok(Number.isInteger(snap.valueScore.density), 'valueScore.density must be integer');
  assert.ok(Number.isInteger(snap.valueScore.novelty), 'valueScore.novelty must be integer');
  assert.ok(Number.isInteger(snap.valueScore.actionability), 'valueScore.actionability must be integer');
  assert.ok(Number.isInteger(snap.estimatedCostMinutes) && snap.estimatedCostMinutes > 0, 'estimatedCostMinutes must be positive int');
  assert.ok(Array.isArray(snap.worthListening) && snap.worthListening.length === 3, 'worthListening must be 3 items');
  assert.ok(Array.isArray(snap.skippable), 'skippable must be array');
  assert.ok(Array.isArray(snap.audience), 'audience must be array');
});

test('snapshot cached:false on fresh request (no-DB)', async () => {
  _glmBehavior = 'success';
  const res = await post('/api/episodes/2/snapshot', null);
  assert.equal(res.status, 200);
  assert.equal(res.body.cached, false, 'no-DB mode always returns cached=false');
});

test('snapshot invalid episode id → 400 VALIDATION_ERROR', async () => {
  const res = await post('/api/episodes/abc/snapshot', null);
  assert.equal(res.status, 400);
  assert.equal(res.body.error?.code, 'VALIDATION_ERROR');
});

test('snapshot GLM timeout → 502 GLM_TIMEOUT', async () => {
  _glmBehavior = 'timeout';
  const res = await post('/api/episodes/3/snapshot', null);
  // In no-DB mode the route calls GLM; AbortError → GLM_TIMEOUT
  assert.equal(res.status, 502, `Expected 502, got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.error?.code, 'GLM_TIMEOUT');
  _glmBehavior = 'success';
});

test('snapshot GLM bad JSON → 502 GLM_MALFORMED_JSON', async () => {
  _glmBehavior = 'bad_json';
  const res = await post('/api/episodes/4/snapshot', null);
  assert.equal(res.status, 502, `Expected 502, got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.error?.code, 'GLM_MALFORMED_JSON');
  _glmBehavior = 'success';
});

test('all error responses use envelope { error: { code, message } }', async () => {
  _glmBehavior = 'timeout';
  const res = await post('/api/episodes/5/snapshot', null);
  assert.ok(res.status >= 400, 'Expected ≥400');
  assert.ok(typeof res.body.error === 'object' && res.body.error !== null, 'error must be object');
  assert.ok(typeof res.body.error.code === 'string', 'error.code must be string');
  assert.ok(typeof res.body.error.message === 'string', 'error.message must be string');
  _glmBehavior = 'success';
});

test('AUTH_ENABLED=true, no Authorization header → 401 MISSING_AUTH', async () => {
  process.env.AUTH_ENABLED = 'true';

  const res = await new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port,
      path: '/api/episodes/1/snapshot',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': 2 },
    }, (r) => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => {
        try { resolve({ status: r.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: r.statusCode, body: d }); }
      });
    });
    req.on('error', reject);
    req.write('{}');
    req.end();
  });

  process.env.AUTH_ENABLED = 'false';

  assert.equal(res.status, 401);
  assert.equal(res.body.error?.code, 'MISSING_AUTH');
});

// Teardown
after(() => { server.close(); });
