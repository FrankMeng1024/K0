// Tests: auth middleware happy + error paths
// Updated for Sprint 2 STORY-00090: all 401 responses must use contract envelope
//   { error: { code: 'MISSING_AUTH' | 'INVALID_AUTH_SCHEME' | 'INVALID_TOKEN', message, details? } }
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attachUser, signToken } from '../src/middleware/auth.js';

function mockReq(headers = {}) {
  return {
    header(name) {
      return headers[name.toLowerCase()];
    },
  };
}
function mockRes() {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}

// --- Happy paths ---

test('no header + AUTH_ENABLED=false → user_id=1', () => {
  process.env.AUTH_ENABLED = 'false';
  process.env.NODE_ENV = 'development';
  const req = mockReq();
  const res = mockRes();
  let nextCalled = false;
  attachUser(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(req.user.id, 1);
  assert.equal(req.user.source, 'dev_default');
});

test('valid Bearer token → user_id from payload', () => {
  process.env.JWT_SECRET = 'test-secret';
  process.env.AUTH_ENABLED = 'false';
  process.env.NODE_ENV = 'development';
  const token = signToken(42);
  const req = mockReq({ authorization: `Bearer ${token}` });
  const res = mockRes();
  let nextCalled = false;
  attachUser(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(req.user.id, 42);
  assert.equal(req.user.source, 'jwt');
});

// --- Negative paths: contract envelope format ---

test('invalid Bearer token → 401 with INVALID_TOKEN code', () => {
  process.env.AUTH_ENABLED = 'false';
  process.env.NODE_ENV = 'development';
  const req = mockReq({ authorization: 'Bearer garbage' });
  const res = mockRes();
  let nextCalled = false;
  attachUser(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  // Contract envelope: { error: { code, message, details? } }
  assert.ok(res.body.error, 'response must have error key');
  assert.equal(res.body.error.code, 'INVALID_TOKEN');
  assert.ok(typeof res.body.error.message === 'string', 'error.message must be string');
  assert.ok(res.body.error.details?.reason, 'error.details.reason must be present for INVALID_TOKEN');
});

test('wrong scheme → 401 with INVALID_AUTH_SCHEME code', () => {
  process.env.AUTH_ENABLED = 'false';
  process.env.NODE_ENV = 'development';
  const req = mockReq({ authorization: 'Basic abcdef' });
  const res = mockRes();
  attachUser(req, res, () => {});
  assert.equal(res.statusCode, 401);
  assert.ok(res.body.error, 'response must have error key');
  assert.equal(res.body.error.code, 'INVALID_AUTH_SCHEME');
  assert.ok(typeof res.body.error.message === 'string', 'error.message must be string');
});

test('missing header + AUTH_ENABLED=true → 401 with MISSING_AUTH code', () => {
  process.env.AUTH_ENABLED = 'true';
  process.env.NODE_ENV = 'development';
  const req = mockReq();
  const res = mockRes();
  let nextCalled = false;
  attachUser(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.ok(res.body.error, 'response must have error key');
  assert.equal(res.body.error.code, 'MISSING_AUTH');
  assert.ok(typeof res.body.error.message === 'string', 'error.message must be string');
  // Cleanup
  process.env.AUTH_ENABLED = 'false';
});

test('token missing user_id claim → 401 INVALID_TOKEN', () => {
  process.env.AUTH_ENABLED = 'false';
  process.env.NODE_ENV = 'development';
  process.env.JWT_SECRET = 'test-secret';
  // Sign a token without user_id
  import('jsonwebtoken').then(({ default: jwt }) => {
    const badToken = jwt.sign({ sub: 'nobody' }, 'test-secret');
    const req = mockReq({ authorization: `Bearer ${badToken}` });
    const res = mockRes();
    attachUser(req, res, () => {});
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error.code, 'INVALID_TOKEN');
  });
});

test('error envelope shape — no legacy flat keys', () => {
  // Ensure none of the old flat error keys appear: error: 'missing_auth', error: 'invalid_token', etc.
  process.env.AUTH_ENABLED = 'true';
  process.env.NODE_ENV = 'development';
  const req = mockReq();
  const res = mockRes();
  attachUser(req, res, () => {});
  assert.equal(typeof res.body.error, 'object', 'error must be an object (not a string)');
  assert.ok('code' in res.body.error, 'error must have code');
  assert.ok('message' in res.body.error, 'error must have message');
  // Cleanup
  process.env.AUTH_ENABLED = 'false';
});
