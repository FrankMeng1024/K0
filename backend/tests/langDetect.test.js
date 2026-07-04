// Tests: langDetect.js — STORY-00013
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectLanguage } from '../src/services/langDetect.js';

// ── zh detection ──────────────────────────────────────────────────────────────

test('pure Chinese text → zh', () => {
  const text = '这是一段完全用中文写的测试文本，用来验证语言识别功能是否正确工作。今天天气很好，阳光明媚。';
  assert.equal(detectLanguage(text), 'zh');
});

test('Chinese text ≥ 200 chars → zh', () => {
  // 200+ CJK characters
  const text = '中文'.repeat(100);
  assert.equal(detectLanguage(text), 'zh');
});

test('mixed text with CJK ratio > 30% → zh', () => {
  // ~40% CJK, rest ASCII
  const cjk = '中文中文中文中文中文'; // 10 chars
  const ascii = ' hello world more '; // ~18 chars
  const text = (cjk + ascii).repeat(4); // 112 chars total, ~36% CJK
  assert.equal(detectLanguage(text), 'zh');
});

// ── en detection ──────────────────────────────────────────────────────────────

test('pure English text → en', () => {
  const text = 'This is a test sentence in English. The quick brown fox jumps over the lazy dog. Language detection should return en for this text.';
  assert.equal(detectLanguage(text), 'en');
});

test('English text ≥ 200 chars → en', () => {
  const text = 'The quick brown fox jumps over the lazy dog. '.repeat(5);
  assert.equal(detectLanguage(text), 'en');
});

test('English with punctuation and spaces → en', () => {
  const text = 'Hello, world! How are you doing today? I am fine, thank you. This is a sample English text used to test language detection. It should return en.';
  assert.equal(detectLanguage(text), 'en');
});

// ── unknown detection ────────────────────────────────────────────────────────

test('text < 20 chars → unknown', () => {
  assert.equal(detectLanguage('Hello'), 'unknown');
  assert.equal(detectLanguage('你好世界'), 'unknown');
  assert.equal(detectLanguage('短'), 'unknown');
});

test('null/undefined input → unknown', () => {
  assert.equal(detectLanguage(null), 'unknown');
  assert.equal(detectLanguage(undefined), 'unknown');
  assert.equal(detectLanguage(''), 'unknown');
});

test('digits and symbols only → unknown', () => {
  const text = '1234567890 !@#$%^&*() 9876543210 +-=[]{}|;:,./<>?';
  assert.equal(detectLanguage(text), 'unknown');
});

test('CJK ratio exactly at threshold (30%) → zh', () => {
  // Construct text where CJK is exactly > 30%
  // 31 CJK chars + 69 spaces = 100 chars, CJK ratio = 31% → zh
  const text = '中'.repeat(31) + ' '.repeat(69);
  assert.equal(detectLanguage(text), 'zh');
});

test('CJK ratio just below threshold (29%) → not zh', () => {
  // 29 CJK chars + 71 spaces = 100 chars, CJK ratio = 29% → not zh
  const text = '中'.repeat(29) + ' '.repeat(71);
  const result = detectLanguage(text);
  assert.ok(result !== 'zh', `Expected not zh, got ${result}`);
});

test('HTML input: strips tags before detection', () => {
  const text = '<p>This is an English paragraph in HTML. The quick brown fox jumps over the lazy dog. Hello world testing language detection here.</p>';
  assert.equal(detectLanguage(text), 'en');
});

// ── performance ──────────────────────────────────────────────────────────────

test('10000-char text processes in < 50ms', () => {
  const text = 'a'.repeat(10000);
  const start = Date.now();
  detectLanguage(text);
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 50, `Expected < 50ms, got ${elapsed}ms`);
});
