import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWorkerModule } from './helpers.js';

const { SlipstreamPrompts } = loadWorkerModule('src/shared/prompts.js');

const messages = (n) =>
  Array.from({ length: n }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    text: `turn ${i} ` + 'x'.repeat(200)
  }));

test('short threads are passed through whole', () => {
  const brief = SlipstreamPrompts.localBrief(messages(3), 4000);
  assert.match(brief, /turn 0/);
  assert.match(brief, /turn 2/);
  assert.doesNotMatch(brief, /trimmed/);
});

test('long threads keep both the opening and the current state', () => {
  const msgs = messages(40);
  const brief = SlipstreamPrompts.localBrief(msgs, 2000);
  assert.match(brief, /turn 0/, 'opening turn must survive: it holds the goal');
  assert.match(brief, /turn 39/, 'final turn must survive: it holds the state');
  assert.match(brief, /trimmed/);
  assert.ok(brief.length < 4000, 'trimmed brief should stay near the budget');
});

test('an empty thread yields an empty brief', () => {
  assert.equal(SlipstreamPrompts.localBrief([]), '');
});

test('roles are labelled for the receiving assistant', () => {
  const brief = SlipstreamPrompts.localBrief([
    { role: 'user', text: 'hello' },
    { role: 'assistant', text: 'hi' }
  ]);
  assert.equal(brief, 'User: hello\n\nAssistant: hi');
});

test('the handoff wrapper names both ends and defers to NEXT', () => {
  const out = SlipstreamPrompts.wrapHandoff({
    brief: 'CONTEXT — building a parser.',
    sourcePlatform: 'Claude',
    targetPlatform: 'ChatGPT'
  });
  assert.match(out, /Claude/);
  assert.match(out, /NEXT/);
  assert.match(out, /CONTEXT — building a parser\./);
});

test('the handoff user message carries the transcript verbatim', () => {
  const out = SlipstreamPrompts.handoffUser({
    sourcePlatform: 'Gemini',
    targetPlatform: 'Grok',
    title: 'Refactor plan',
    transcript: 'User: keep the API stable'
  });
  assert.match(out, /Source assistant: Gemini/);
  assert.match(out, /Destination assistant: Grok/);
  assert.match(out, /Refactor plan/);
  assert.match(out, /keep the API stable/);
});

test('the enhancer prompt refuses to answer and omits absent context', () => {
  assert.match(SlipstreamPrompts.ENHANCER_SYSTEM, /Do not answer the prompt/);
  const out = SlipstreamPrompts.enhancerUser({ raw: 'make it faster', platform: 'Claude' });
  assert.match(out, /sent to Claude/);
  assert.doesNotMatch(out, /Relevant background/);
});
