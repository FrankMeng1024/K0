// Tests: POST /api/episodes/import — STORY-00011
// Scope: validation errors, source routing errors, auth enforcement, text import (no-DB mode)
// Apple happy path is verified by QA (requires real iTunes API or test server with mocked network)
//
// Strategy: Start Express app in-process, AUTH_ENABLED=false, db=null (no-DB mode)
// Module mocking requires --experimental-test-module-mocks flag (not used here)
// Instead: tests cover all code paths that do NOT call fetchAppleMetadata externally

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { signToken } from '../src/middleware/auth.js';

// Force no-DB and dev mode before importing app.
// dotenv (loaded by index.js) does NOT override existing env vars,
// so unsetting DB_HOST/DB_USER/DB_NAME before import makes db.js return null (no-DB mode).
process.env.AUTH_ENABLED = 'false';
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = 'test-secret';
process.env.PORT = '0'; // random port
// Ensure DB is not configured so routes use the in-memory no-DB fallback
process.env.DB_HOST = '';
process.env.DB_USER = '';
process.env.DB_NAME = '';

const { default: app } = await import('../src/index.js');

const server = http.createServer(app);
server.listen(0);
await once(server, 'listening');
const { port } = server.address();
// Allow process to exit even if server is still listening (tests don't need persistent server)
server.unref();

// Each request uses a unique user_id to avoid hitting the 10-req/min import rate limit
// (rate limiter keys by user_id).
let _nextUserId = 100;

async function post(path, body, userId = _nextUserId++) {
  const token = signToken(userId);
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
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

// ── TEXT IMPORT (no network, no DB needed) ──────────────────────────────────

test('text import (≥200 chars) → 200 + EpisodeObject source=text importStatus=ready', async () => {
  const res = await post('/api/episodes/import', {
    source: 'text',
    text: 'A'.repeat(300),
  });

  assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
  const ep = res.body.episode;
  assert.ok(ep, 'response must have episode');
  assert.equal(ep.source, 'text');
  assert.equal(ep.importStatus, 'ready');
  assert.equal(ep.sourceUrl, null);
  assert.equal(ep.audioUrl, null);
  assert.ok(typeof ep.duration === 'number', 'duration must be a number');
  assert.ok(ep.title?.length > 0, 'title must be non-empty');
});

test('text import → language detected from content (ASCII text → en)', async () => {
  const res = await post('/api/episodes/import', {
    source: 'text',
    text: 'B'.repeat(250),
  });
  assert.equal(res.status, 200);
  // 'B'.repeat(250) is pure ASCII → detectLanguage returns 'en'
  assert.equal(res.body.episode?.language, 'en');
});

test('text import → id=0 in no-DB mode', async () => {
  const res = await post('/api/episodes/import', {
    source: 'text',
    text: 'C'.repeat(250),
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.episode?.id, 0, 'id must be 0 in no-DB mode');
});

// ── VALIDATION ERRORS ───────────────────────────────────────────────────────

test('text too short (< 200 chars) → 400 VALIDATION_ERROR', async () => {
  const res = await post('/api/episodes/import', {
    source: 'text',
    text: 'Too short',
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error?.code, 'VALIDATION_ERROR');
});

test('url missing for url-branch → 400 VALIDATION_ERROR', async () => {
  const res = await post('/api/episodes/import', {
    source: 'apple',
    // url required when source != 'text'
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error?.code, 'VALIDATION_ERROR');
});

test('invalid source enum → 400 VALIDATION_ERROR', async () => {
  const res = await post('/api/episodes/import', {
    url: 'https://podcasts.apple.com/us/podcast/test/id123456789',
    source: 'rss',
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error?.code, 'VALIDATION_ERROR');
});

test('empty body → 400 VALIDATION_ERROR', async () => {
  const res = await post('/api/episodes/import', {});
  assert.equal(res.status, 400);
  assert.equal(res.body.error?.code, 'VALIDATION_ERROR');
});

test('url is not a valid URL string → 400 VALIDATION_ERROR', async () => {
  const res = await post('/api/episodes/import', {
    url: 'not-a-url',
    source: 'auto',
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error?.code, 'VALIDATION_ERROR');
});

// ── SOURCE ROUTING ERRORS ────────────────────────────────────────────────────

test('Spotify URL (auto-detected) → 400 SOURCE_NOT_SUPPORTED', async () => {
  const res = await post('/api/episodes/import', {
    url: 'https://open.spotify.com/episode/abc123',
    source: 'auto',
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error?.code, 'SOURCE_NOT_SUPPORTED');
});

test('source=spotify explicit → 400 SOURCE_NOT_SUPPORTED', async () => {
  const res = await post('/api/episodes/import', {
    url: 'https://open.spotify.com/episode/abc123',
    source: 'spotify',
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error?.code, 'SOURCE_NOT_SUPPORTED');
});

test('YouTube URL (auto-detected) → 400 YOUTUBE_MANUAL_ONLY', async () => {
  const res = await post('/api/episodes/import', {
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    source: 'auto',
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error?.code, 'YOUTUBE_MANUAL_ONLY');
});

test('youtu.be short URL → 400 YOUTUBE_MANUAL_ONLY', async () => {
  const res = await post('/api/episodes/import', {
    url: 'https://youtu.be/dQw4w9WgXcQ',
    source: 'auto',
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error?.code, 'YOUTUBE_MANUAL_ONLY');
});

test('unknown domain URL → 400 SOURCE_NOT_SUPPORTED', async () => {
  const res = await post('/api/episodes/import', {
    url: 'https://example.com/episode/123',
    source: 'auto',
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error?.code, 'SOURCE_NOT_SUPPORTED');
});

// ── ERROR ENVELOPE SHAPE ─────────────────────────────────────────────────────

test('all 4xx errors use envelope { error: { code: string, message: string } }', async () => {
  const cases = [
    { url: 'https://open.spotify.com/episode/abc', source: 'auto' },
    { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', source: 'auto' },
    { source: 'text', text: 'short' },
    {},
  ];

  for (const body of cases) {
    const res = await post('/api/episodes/import', body);
    assert.ok(res.status >= 400, `Expected ≥400 for ${JSON.stringify(body)}`);
    assert.ok(typeof res.body.error === 'object' && res.body.error !== null,
      `error must be object for ${JSON.stringify(body)}`);
    assert.ok(typeof res.body.error.code === 'string',
      `error.code must be string for ${JSON.stringify(body)}`);
    assert.ok(typeof res.body.error.message === 'string',
      `error.message must be string for ${JSON.stringify(body)}`);
  }
});

// ── AUTH ENFORCEMENT ──────────────────────────────────────────────────────────

test('AUTH_ENABLED=true, no Authorization header → 401 MISSING_AUTH', async () => {
  process.env.AUTH_ENABLED = 'true';

  // Send request WITHOUT auth header to test the auth guard
  const bodyStr = JSON.stringify({ source: 'text', text: 'D'.repeat(300) });
  const res = await new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port,
      path: '/api/episodes/import',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        // No Authorization header intentionally
      },
    }, (r) => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => {
        try { resolve({ status: r.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: r.statusCode, body: d }); }
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });

  process.env.AUTH_ENABLED = 'false';

  assert.equal(res.status, 401);
  assert.equal(res.body.error?.code, 'MISSING_AUTH');
});

// Teardown
after(() => { server.close(); });
