// Tests: auth middleware happy + error paths (built-in node:test, no supertest to keep deps light)
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

test('no header + AUTH_ENABLED=false → user_id=1', () => {
  process.env.AUTH_ENABLED = 'false';
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
  const token = signToken(42);
  const req = mockReq({ authorization: `Bearer ${token}` });
  const res = mockRes();
  let nextCalled = false;
  attachUser(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(req.user.id, 42);
  assert.equal(req.user.source, 'jwt');
});

test('invalid Bearer token → 401', () => {
  const req = mockReq({ authorization: 'Bearer garbage' });
  const res = mockRes();
  let nextCalled = false;
  attachUser(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, 'invalid_token');
});

test('wrong scheme → 401', () => {
  const req = mockReq({ authorization: 'Basic abcdef' });
  const res = mockRes();
  attachUser(req, res, () => {});
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, 'invalid_auth_scheme');
});
