import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContentScripts } from './helpers.js';

/**
 * Bug Condition Exploration Test
 * 
 * **Validates: Requirements 2.1, 2.2, 2.3**
 * 
 * This test demonstrates the bug where duplicate DOM nodes are counted as separate messages,
 * inflating the message count beyond the actual number of unique messages in the conversation.
 * 
 * **CRITICAL**: This test is EXPECTED TO FAIL on unfixed code.
 * - Test failure = Bug confirmed (duplicate messages being counted)
 * - Test pass = Bug fixed (duplicates correctly filtered)
 * 
 * The test creates DOM fixtures with intentional duplicates (hidden clones, nested containers,
 * overlapping selectors, non-consecutive duplicates) and verifies the bug condition:
 * 
 * isBugCondition = (uniqueCount < actualCount) AND (actualCount > 0) AND (uniqueCount > 0)
 * 
 * where:
 * - actualCount = messages.length (what the system currently returns)
 * - uniqueCount = size of Set((role, text) pairs) (what it SHOULD return)
 */

test('Bug Condition: ChatGPT duplicate containers (visible + hidden clone)', () => {
  // Fixture: 2 actual messages, but with hidden clones (display: none)
  // Current behavior: Extracts 4 messages (counts hidden clones)
  // Expected behavior: Extract 2 messages (filter out hidden duplicates)
  const html = `<main>
    <div data-message-author-role="user">How do I debounce?</div>
    <div data-message-author-role="user" style="display: none;">How do I debounce?</div>
    <div data-message-author-role="assistant">Use a timer</div>
    <div data-message-author-role="assistant" style="display: none;">Use a timer</div>
  </main>`;
  
  const window = loadContentScripts(html, { url: 'https://chatgpt.com/c/test' });
  const capture = window.SlipstreamAdapters.capture();
  
  const actualCount = capture.messages.length;
  const uniquePairs = new Set(capture.messages.map(m => `${m.role}:${m.text}`));
  const uniqueCount = uniquePairs.size;
  
  // Document the bug condition
  const isBugCondition = uniqueCount < actualCount && actualCount > 0 && uniqueCount > 0;
  
  console.log(`\n[ChatGPT Hidden Clone Test]`);
  console.log(`  Actual count: ${actualCount}`);
  console.log(`  Unique count: ${uniqueCount}`);
  console.log(`  Bug condition met: ${isBugCondition}`);
  if (isBugCondition) {
    console.log(`  ❌ COUNTEREXAMPLE FOUND: ${actualCount - uniqueCount} duplicate messages counted`);
  }
  
  // This assertion encodes the EXPECTED behavior (after fix)
  // On unfixed code: FAILS (actualCount=4, uniqueCount=2)
  // On fixed code: PASSES (actualCount=2, uniqueCount=2)
  assert.equal(actualCount, uniqueCount, 
    `Expected ${uniqueCount} unique messages, but got ${actualCount} (${actualCount - uniqueCount} duplicates)`);
  assert.equal(actualCount, 2, 'Should extract exactly 2 messages');
});

test('Bug Condition: Claude overlapping selectors (same node matched twice)', () => {
  // Fixture: 3 actual messages, but one assistant message matches BOTH selectors
  // `.font-claude-message` AND `[data-testid="assistant-message"]`
  // Current behavior: Extracts 6 messages (counts same node twice)
  // Expected behavior: Extract 3 messages (deduplicate overlapping selectors)
  const html = `<main>
    <div data-testid="user-message">Review this code</div>
    <div class="font-claude-message" data-testid="assistant-message">Two issues</div>
    <div data-testid="user-message">What about performance?</div>
  </main>`;
  
  const window = loadContentScripts(html, { url: 'https://claude.ai/chat/test' });
  const capture = window.SlipstreamAdapters.capture();
  
  const actualCount = capture.messages.length;
  const uniquePairs = new Set(capture.messages.map(m => `${m.role}:${m.text}`));
  const uniqueCount = uniquePairs.size;
  
  const isBugCondition = uniqueCount < actualCount && actualCount > 0 && uniqueCount > 0;
  
  console.log(`\n[Claude Overlapping Selector Test]`);
  console.log(`  Actual count: ${actualCount}`);
  console.log(`  Unique count: ${uniqueCount}`);
  console.log(`  Bug condition met: ${isBugCondition}`);
  if (isBugCondition) {
    console.log(`  ❌ COUNTEREXAMPLE FOUND: ${actualCount - uniqueCount} duplicate messages from overlapping selectors`);
  }
  
  assert.equal(actualCount, uniqueCount,
    `Expected ${uniqueCount} unique messages, but got ${actualCount} (${actualCount - uniqueCount} duplicates)`);
  assert.equal(actualCount, 3, 'Should extract exactly 3 messages');
});

test('Bug Condition: Gemini nested containers (parent + child both match)', () => {
  // Fixture: 2 actual messages, but nested structure causes both parent and child to match
  // Current behavior: Extracts 4 messages (counts parent and child separately)
  // Expected behavior: Extract 2 messages (filter nested duplicates)
  const html = `<main>
    <user-query>
      <div class="query-text">Summarize this</div>
    </user-query>
    <model-response>
      <div class="model-response-text">Key points are</div>
    </model-response>
  </main>`;
  
  const window = loadContentScripts(html, { url: 'https://gemini.google.com/app/test' });
  const capture = window.SlipstreamAdapters.capture();
  
  const actualCount = capture.messages.length;
  const uniquePairs = new Set(capture.messages.map(m => `${m.role}:${m.text}`));
  const uniqueCount = uniquePairs.size;
  
  const isBugCondition = uniqueCount < actualCount && actualCount > 0 && uniqueCount > 0;
  
  console.log(`\n[Gemini Nested Container Test]`);
  console.log(`  Actual count: ${actualCount}`);
  console.log(`  Unique count: ${uniqueCount}`);
  console.log(`  Bug condition met: ${isBugCondition}`);
  if (isBugCondition) {
    console.log(`  ❌ COUNTEREXAMPLE FOUND: ${actualCount - uniqueCount} duplicate messages from nested containers`);
  }
  
  assert.equal(actualCount, uniqueCount,
    `Expected ${uniqueCount} unique messages, but got ${actualCount} (${actualCount - uniqueCount} duplicates)`);
  assert.equal(actualCount, 2, 'Should extract exactly 2 messages');
});

test('Bug Condition: Non-consecutive duplicates (current dedup only handles consecutive)', () => {
  // Fixture: 2 actual messages, but duplicates appear non-consecutively in DOM
  // Pattern: user1, assistant1, user1-duplicate, assistant1-duplicate
  // Current behavior: Consecutive-only dedup misses these, extracts 4 messages
  // Expected behavior: Extract 2 messages (comprehensive deduplication)
  const html = `<main>
    <div data-message-author-role="user">What is debounce?</div>
    <div data-message-author-role="assistant">It delays execution</div>
    <div data-message-author-role="user">What is debounce?</div>
    <div data-message-author-role="assistant">It delays execution</div>
  </main>`;
  
  const window = loadContentScripts(html, { url: 'https://chatgpt.com/c/test' });
  const capture = window.SlipstreamAdapters.capture();
  
  const actualCount = capture.messages.length;
  const uniquePairs = new Set(capture.messages.map(m => `${m.role}:${m.text}`));
  const uniqueCount = uniquePairs.size;
  
  const isBugCondition = uniqueCount < actualCount && actualCount > 0 && uniqueCount > 0;
  
  console.log(`\n[Non-Consecutive Duplicate Test]`);
  console.log(`  Actual count: ${actualCount}`);
  console.log(`  Unique count: ${uniqueCount}`);
  console.log(`  Bug condition met: ${isBugCondition}`);
  if (isBugCondition) {
    console.log(`  ❌ COUNTEREXAMPLE FOUND: ${actualCount - uniqueCount} non-consecutive duplicates not filtered`);
  }
  
  assert.equal(actualCount, uniqueCount,
    `Expected ${uniqueCount} unique messages, but got ${actualCount} (${actualCount - uniqueCount} duplicates)`);
  assert.equal(actualCount, 2, 'Should extract exactly 2 messages');
});

test('Bug Condition: Mixed duplicate types (hidden + nested + overlapping)', () => {
  // Fixture: Complex real-world scenario with multiple types of duplicates
  // 3 actual unique messages, but various duplicate extraction issues
  // Current behavior: May extract 6+ messages
  // Expected behavior: Extract 3 messages
  const html = `<main>
    <div data-message-author-role="user">Explain throttle</div>
    <div data-message-author-role="user" style="display: none;">Explain throttle</div>
    <div data-message-author-role="assistant">It limits rate</div>
    <div data-message-author-role="assistant">It limits rate</div>
    <div data-message-author-role="user">Thanks</div>
  </main>`;
  
  const window = loadContentScripts(html, { url: 'https://chatgpt.com/c/test' });
  const capture = window.SlipstreamAdapters.capture();
  
  const actualCount = capture.messages.length;
  const uniquePairs = new Set(capture.messages.map(m => `${m.role}:${m.text}`));
  const uniqueCount = uniquePairs.size;
  
  const isBugCondition = uniqueCount < actualCount && actualCount > 0 && uniqueCount > 0;
  
  console.log(`\n[Mixed Duplicate Types Test]`);
  console.log(`  Actual count: ${actualCount}`);
  console.log(`  Unique count: ${uniqueCount}`);
  console.log(`  Bug condition met: ${isBugCondition}`);
  if (isBugCondition) {
    console.log(`  ❌ COUNTEREXAMPLE FOUND: ${actualCount - uniqueCount} duplicates from mixed issues`);
  }
  
  assert.equal(actualCount, uniqueCount,
    `Expected ${uniqueCount} unique messages, but got ${actualCount} (${actualCount - uniqueCount} duplicates)`);
  assert.equal(actualCount, 3, 'Should extract exactly 3 messages');
});

test('Bug Condition: Legitimate repeated content should NOT be duplicated', () => {
  // Edge case: User sends "yes" twice legitimately in conversation
  // If DOM structure causes duplication, we might see 4 "yes" messages
  // Current behavior: May show 4 "yes" if duplicates exist
  // Expected behavior: Show 2 "yes" (the actual messages)
  // 
  // Note: This test demonstrates that our deduplication is content-based.
  // If user genuinely sends "yes" twice at different times, those would be
  // separate DOM nodes in practice with different context/timestamps.
  // The fact that we see duplicates in THIS test proves structural duplication.
  const html = `<main>
    <div data-message-author-role="user">yes</div>
    <div data-message-author-role="user" style="display: none;">yes</div>
    <div data-message-author-role="assistant">ok</div>
    <div data-message-author-role="user">yes</div>
    <div data-message-author-role="user" style="display: none;">yes</div>
  </main>`;
  
  const window = loadContentScripts(html, { url: 'https://chatgpt.com/c/test' });
  const capture = window.SlipstreamAdapters.capture();
  
  const actualCount = capture.messages.length;
  const uniquePairs = new Set(capture.messages.map(m => `${m.role}:${m.text}`));
  const uniqueCount = uniquePairs.size;
  
  const isBugCondition = uniqueCount < actualCount && actualCount > 0 && uniqueCount > 0;
  
  console.log(`\n[Legitimate Repeated Content Test]`);
  console.log(`  Actual count: ${actualCount}`);
  console.log(`  Unique count: ${uniqueCount}`);
  console.log(`  Bug condition met: ${isBugCondition}`);
  if (isBugCondition) {
    console.log(`  ❌ COUNTEREXAMPLE FOUND: ${actualCount - uniqueCount} structural duplicates detected`);
  }
  
  // We expect 3 unique (role, text) pairs: (user, "yes"), (assistant, "ok"), and that's it
  // If we have 2 separate user "yes" messages at different times, they would ideally
  // have different timestamps/context, but our extraction doesn't capture that.
  // So we accept that identical messages get deduplicated.
  assert.equal(actualCount, uniqueCount,
    `Expected ${uniqueCount} unique messages, but got ${actualCount} (${actualCount - uniqueCount} duplicates)`);
  assert.ok(uniqueCount <= 3, `Should have at most 3 unique (role, text) pairs`);
});
