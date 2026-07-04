// Tests for STORY-00033: Pack & job infrastructure
// Verifies mock PackObject shape and job store behavior
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildMockPack, mockPackStore } from '../src/routes/packs.js';
import { jobStore } from '../src/routes/jobs.js';

describe('buildMockPack — shape validation', () => {
  it('returns a pack with all required top-level fields', () => {
    const pack = buildMockPack(1, 1, 'deep_learn', 'zh');
    assert.ok(typeof pack.id === 'number', 'id must be number');
    assert.ok(typeof pack.episodeId === 'number', 'episodeId must be number');
    assert.ok(typeof pack.goal === 'string', 'goal must be string');
    assert.ok(typeof pack.language === 'string', 'language must be string');
    assert.ok(pack.snapshot, 'snapshot must exist');
    assert.ok(Array.isArray(pack.steps), 'steps must be array');
    assert.ok(Array.isArray(pack.cards), 'cards must be array');
    assert.ok(pack.actions, 'actions must exist');
  });

  it('snapshot has all required fields', () => {
    const { snapshot } = buildMockPack(1, 1, 'deep_learn', 'zh');
    assert.ok(typeof snapshot.oneSentence === 'string' && snapshot.oneSentence.length > 0, 'oneSentence non-empty string');
    assert.ok(Array.isArray(snapshot.corePoints) && snapshot.corePoints.length === 3, 'corePoints has exactly 3 items');
    for (const cp of snapshot.corePoints) {
      assert.ok(typeof cp.point === 'string', 'corePoints item has point');
      assert.ok(typeof cp.timestamp === 'number', 'corePoints item has timestamp');
    }
    assert.ok(Array.isArray(snapshot.audience), 'audience is array');
    assert.ok(snapshot.valueScore, 'valueScore exists');
    assert.ok(Number.isInteger(snapshot.valueScore.density) && snapshot.valueScore.density >= 1 && snapshot.valueScore.density <= 10, 'density 1-10');
    assert.ok(Number.isInteger(snapshot.valueScore.novelty) && snapshot.valueScore.novelty >= 1 && snapshot.valueScore.novelty <= 10, 'novelty 1-10');
    assert.ok(Number.isInteger(snapshot.valueScore.actionability) && snapshot.valueScore.actionability >= 1 && snapshot.valueScore.actionability <= 10, 'actionability 1-10');
    assert.ok(Number.isInteger(snapshot.estimatedCostMinutes) && snapshot.estimatedCostMinutes >= 1, 'estimatedCostMinutes >= 1');
  });

  it('has exactly 6 steps', () => {
    const pack = buildMockPack(2, 5, 'quick_understand', 'en');
    assert.strictEqual(pack.steps.length, 6, 'steps.length must be 6');
    for (let i = 0; i < 6; i++) {
      assert.strictEqual(pack.steps[i].stepNumber, i + 1, `step ${i + 1} has correct stepNumber`);
      assert.ok(typeof pack.steps[i].title === 'string', 'step has title');
      assert.ok(typeof pack.steps[i].content === 'string', 'step has content');
      assert.strictEqual(pack.steps[i].completed, false, 'step starts incomplete');
    }
  });

  it('has 3-5 cards', () => {
    const pack = buildMockPack(3);
    assert.ok(pack.cards.length >= 3 && pack.cards.length <= 5, 'cards.length between 3 and 5');
    const validTypes = ['opinion', 'method', 'case', 'reflection', 'action'];
    for (const card of pack.cards) {
      assert.ok(validTypes.includes(card.type), `card type '${card.type}' is valid`);
      assert.ok(typeof card.title === 'string' && card.title.length > 0, 'card has title');
      assert.ok(typeof card.explanation === 'string' && card.explanation.length > 0, 'card has explanation');
    }
  });

  it('has actions with today/thisWeek/longTerm', () => {
    const { actions } = buildMockPack(4);
    assert.ok(typeof actions.today === 'string' && actions.today.length > 0, 'actions.today non-empty');
    assert.ok(typeof actions.thisWeek === 'string' && actions.thisWeek.length > 0, 'actions.thisWeek non-empty');
    assert.ok(typeof actions.longTerm === 'string' && actions.longTerm.length > 0, 'actions.longTerm non-empty');
  });

  it('generates en-language pack when language is en', () => {
    const pack = buildMockPack(5, 1, 'find_actions', 'en');
    // oneSentence should be in English (no CJK characters)
    assert.ok(!/[\u4e00-\u9fff]/.test(pack.snapshot.oneSentence), 'oneSentence should be English');
  });
});

describe('mockPackStore — basic operations', () => {
  beforeEach(() => mockPackStore.clear());

  it('stores and retrieves a pack by id', () => {
    const pack = buildMockPack(99);
    mockPackStore.set(99, pack);
    assert.deepStrictEqual(mockPackStore.get(99), pack);
  });
});

describe('jobStore — basic operations', () => {
  beforeEach(() => jobStore.clear());

  it('stores and retrieves a job by jobId', () => {
    const jobId = 'test-uuid-123';
    jobStore.set(jobId, { status: 'processing', progress: 0, createdAt: Date.now() });
    const job = jobStore.get(jobId);
    assert.strictEqual(job.status, 'processing');
    assert.strictEqual(job.progress, 0);
  });

  it('returns undefined for unknown jobId', () => {
    assert.strictEqual(jobStore.get('nonexistent'), undefined);
  });
});
