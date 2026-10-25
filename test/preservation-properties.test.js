/**
 * Property-Based Tests for Message Count Fix - Preservation Properties
 * 
 * These tests run on UNFIXED code to establish baseline behavior that must be preserved.
 * 
 * **Validates: Requirements 3.1, 3.2, 3.3**
 * 
 * Property 2: Preservation - Existing Functionality Unchanged
 * 
 * For any captured conversation where the extraction logic identifies messages,
 * the fixed code SHALL produce exactly the same message content, metadata, role
 * assignments, and storage behavior as the original code, preserving all existing
 * functionality except the removal of duplicates.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContentScripts } from './helpers.js';
import fc from 'fast-check';

/* ---------------------------------------------------------------- Generators */

/**
 * Generate valid message text content (no duplicates scenario).
 * Text must be >= 2 chars (MIN_MESSAGE_CHARS) and realistic for chat messages.
 * IMPORTANT: Must have at least 2 non-whitespace characters to pass MIN_MESSAGE_CHARS filter.
 * IMPORTANT: Avoid HTML-like patterns (<, >, tags) as JSDOM will interpret them as markup.
 */
const messageTextArb = fc.oneof(
  // Generate strings with actual content, avoiding HTML characters
  fc
    .string({ minLength: 2, maxLength: 50 })
    .filter(s => s.trim().length >= 2 && !s.includes('<') && !s.includes('>')),
  fc
    .lorem({ maxCount: 10 })
    .filter(s => s.trim().length >= 2),
  fc.constantFrom(
    'How do I debounce a resize handler?',
    'Wrap it in a timer',
    'What about leading edge?',
    'Review this migration',
    'Two issues stand out',
    'Summarise this paper',
    'The authors argue',
    'Explain rate limits',
    'They cap requests per minute',
    'Yes',
    'Thanks!',
    'Got it.',
    'Could you elaborate?',
    'OK',
    'Sure thing',
    'No problem',
    'Understood'
  )
);

/**
 * Generate a single message with role and text.
 */
const messageArb = fc.record({
  role: fc.constantFrom('user', 'assistant'),
  text: messageTextArb
});

/**
 * Generate a conversation with NO duplicates (alternating roles).
 * This is the main scenario for preservation testing - valid conversations.
 * 
 * IMPORTANT: Ensures all text content is unique to avoid accidental duplicates.
 */
const alternatingConversationArb = fc
  .uniqueArray(messageTextArb, { minLength: 1, maxLength: 20 })
  .map((texts) => {
    return texts.map((text, idx) => ({
      role: idx % 2 === 0 ? 'user' : 'assistant',
      text
    }));
  });

/**
 * Generate a single-message conversation (no possibility of duplicates).
 */
const singleMessageArb = messageArb.map((msg) => [msg]);

/**
 * Generate consecutive duplicates (streaming scenario - already handled correctly).
 * Creates a conversation where the last message is duplicated consecutively.
 * 
 * IMPORTANT: Uses unique texts to ensure the ONLY duplicate is the consecutive one at the end.
 */
const consecutiveDuplicatesArb = fc
  .uniqueArray(messageTextArb, { minLength: 1, maxLength: 10 })
  .map((texts) => {
    const messages = [];
    texts.forEach((text, idx) => {
      const role = idx % 2 === 0 ? 'user' : 'assistant';
      messages.push({ role, text });
    });
    // Add a consecutive duplicate of the last message (streaming case)
    const lastMessage = messages[messages.length - 1];
    messages.push({ role: lastMessage.role, text: lastMessage.text });
    return messages;
  });

/**
 * Generate HTML fixture for a given platform and messages.
 */
function generatePlatformHTML(platform, messages) {
  const templates = {
    chatgpt: (msgs) => {
      const msgHTML = msgs
        .map((m) => `<div data-message-author-role="${m.role}">${m.text}</div>`)
        .join('\n      ');
      return `<main>
      ${msgHTML}
      <form><div id="prompt-textarea" contenteditable="true"></div></form>
    </main>`;
    },
    claude: (msgs) => {
      const msgHTML = msgs
        .map((m) => {
          const className = m.role === 'user' ? 'font-user-message' : 'font-claude-message';
          const testid = m.role === 'user' ? 'user-message' : 'assistant-message';
          return `<div data-testid="${testid}" class="${className}">${m.text}</div>`;
        })
        .join('\n      ');
      return `<main>
      ${msgHTML}
      <fieldset><div contenteditable="true" class="ProseMirror"></div></fieldset>
    </main>`;
    },
    gemini: (msgs) => {
      const msgHTML = msgs
        .map((m) => {
          const tag = m.role === 'user' ? 'user-query' : 'model-response';
          return `<${tag}>${m.text}</${tag}>`;
        })
        .join('\n      ');
      return `<main>
      ${msgHTML}
      <rich-textarea><div contenteditable="true"></div></rich-textarea>
    </main>`;
    },
    grok: (msgs) => {
      const msgHTML = msgs
        .map((m, idx) => {
          const alignment = m.role === 'user' ? 'items-end' : 'items-start';
          return `<div class="flex ${alignment}"><div class="message-bubble">${m.text}</div></div>`;
        })
        .join('\n      ');
      return `<main>
      ${msgHTML}
      <form><textarea aria-label="Ask Grok"></textarea></form>
    </main>`;
    },
    perplexity: (msgs) => {
      const msgHTML = msgs
        .map((m) => {
          if (m.role === 'user') {
            return `<h1 class="group/query">${m.text}</h1>`;
          } else {
            return `<div id="markdown-content-${Math.random()}" class="prose">${m.text}</div>`;
          }
        })
        .join('\n      ');
      return `<main>
      ${msgHTML}
      <textarea placeholder="Ask anything"></textarea>
    </main>`;
    }
  };

  return templates[platform](messages);
}

/**
 * Platform configuration for tests.
 */
const PLATFORMS = {
  chatgpt: { url: 'https://chatgpt.com/c/test-123', keyPrefix: 'chatgpt:' },
  claude: { url: 'https://claude.ai/chat/test-456', keyPrefix: 'claude:' },
  gemini: { url: 'https://gemini.google.com/app/test-789', keyPrefix: 'gemini:' },
  grok: { url: 'https://grok.com/chat/test-abc', keyPrefix: 'grok:' },
  perplexity: { url: 'https://www.perplexity.ai/search/test-def', keyPrefix: 'perplexity:' }
};

/* --------------------------------------------------------------- Properties */

/**
 * Property P2.1: Single message conversations are extracted identically
 * 
 * For any single-message conversation (no duplicates possible), the extraction
 * must produce exactly one message with correct role and text.
 */
test('Property P2.1: Single message extraction is preserved', () => {
  fc.assert(
    fc.property(singleMessageArb, fc.constantFrom(...Object.keys(PLATFORMS)), (messages, platformId) => {
      const platform = PLATFORMS[platformId];
      const html = generatePlatformHTML(platformId, messages);
      const window = loadContentScripts(html, { url: platform.url });
      const capture = window.SlipstreamAdapters.capture();

      // Verify extraction worked
      assert.ok(capture, 'capture should not be null');
      assert.equal(capture.platform, platformId, 'platform should match');
      assert.equal(capture.messages.length, 1, 'should extract exactly 1 message');
      
      // Verify message content preserved
      const extractedMsg = capture.messages[0];
      assert.equal(extractedMsg.role, messages[0].role, 'role should be preserved');
      // Note: readText() trims whitespace
      assert.equal(extractedMsg.text, messages[0].text.trim(), 'text should be preserved (trimmed)');
      
      // Verify metadata present
      assert.ok(capture.url, 'url should be present');
      assert.ok(capture.threadKey, 'threadKey should be present');
      assert.ok(capture.threadKey.startsWith(platform.keyPrefix), 'threadKey should have platform prefix');
    })
  );
});

/**
 * Property P2.2: Alternating role conversations are extracted completely
 * 
 * For any conversation with alternating user/assistant messages (no duplicates),
 * all messages must be extracted with correct roles and text.
 */
test('Property P2.2: Alternating role conversations are preserved', () => {
  fc.assert(
    fc.property(
      alternatingConversationArb,
      fc.constantFrom(...Object.keys(PLATFORMS)),
      (messages, platformId) => {
        const platform = PLATFORMS[platformId];
        const html = generatePlatformHTML(platformId, messages);
        const window = loadContentScripts(html, { url: platform.url });
        const capture = window.SlipstreamAdapters.capture();

        // Verify extraction worked
        assert.ok(capture, 'capture should not be null');
        assert.equal(capture.platform, platformId, 'platform should match');
        assert.equal(
          capture.messages.length,
          messages.length,
          `should extract all ${messages.length} messages`
        );

        // Verify all messages preserved with correct content
        // Note: readText() trims whitespace, so we need to compare trimmed versions
        for (let i = 0; i < messages.length; i++) {
          const expected = messages[i];
          const actual = capture.messages[i];
          assert.equal(actual.role, expected.role, `message ${i} role should be preserved`);
          assert.equal(actual.text, expected.text.trim(), `message ${i} text should be preserved (trimmed)`);
        }

        // Verify no degradation flag for valid conversations
        assert.equal(capture.degraded, false, 'should not be degraded');
      }
    ),
    { numRuns: 50 }
  );
});

/**
 * Property P2.3: Consecutive duplicates are filtered (streaming case)
 * 
 * This is existing behavior that MUST be preserved - consecutive duplicates
 * from streaming should be collapsed to one message.
 */
test('Property P2.3: Consecutive streaming duplicates are still filtered', () => {
  fc.assert(
    fc.property(consecutiveDuplicatesArb, fc.constantFrom(...Object.keys(PLATFORMS)), (messages, platformId) => {
      const platform = PLATFORMS[platformId];
      const html = generatePlatformHTML(platformId, messages);
      const window = loadContentScripts(html, { url: platform.url });
      const capture = window.SlipstreamAdapters.capture();

      // The last message is a duplicate, so we expect one less message
      const expectedCount = messages.length - 1;
      
      assert.ok(capture, 'capture should not be null');
      assert.equal(
        capture.messages.length,
        expectedCount,
        `consecutive duplicate should be filtered: expected ${expectedCount}, got ${capture.messages.length}`
      );
    })
  );
});

/**
 * Property P2.4: Text cleaning removes buttons, SVGs, and chrome elements
 * 
 * For any message containing UI chrome (buttons, SVGs, hidden elements),
 * the extracted text must exclude these elements.
 */
test('Property P2.4: Message chrome is stripped from extracted text', () => {
  const platforms = ['chatgpt', 'claude'];
  
  for (const platformId of platforms) {
    const platform = PLATFORMS[platformId];
    
    // Create HTML with UI chrome elements
    const html =
      platformId === 'chatgpt'
        ? `<main>
            <div data-message-author-role="user">How do I debounce?</div>
            <div data-message-author-role="assistant">
              Wrap it in a timer
              <button>Copy</button>
              <svg><path d="M0 0"></path></svg>
              <div role="button">More</div>
              <span aria-hidden="true">Hidden UI</span>
            </div>
            <form><div id="prompt-textarea" contenteditable="true"></div></form>
          </main>`
        : `<main>
            <div data-testid="user-message">Review this migration</div>
            <div class="font-claude-message">
              Two issues stand out
              <svg class="icon"><use href="#copy"></use></svg>
              <button aria-label="Copy">Copy</button>
            </div>
            <fieldset><div contenteditable="true" class="ProseMirror"></div></fieldset>
          </main>`;

    const window = loadContentScripts(html, { url: platform.url });
    const capture = window.SlipstreamAdapters.capture();

    const assistantMsg = capture.messages.find((m) => m.role === 'assistant');
    assert.ok(assistantMsg, 'should find assistant message');
    
    // Verify chrome elements are stripped
    assert.ok(!assistantMsg.text.includes('Copy'), 'should not contain button text');
    assert.ok(!assistantMsg.text.includes('More'), 'should not contain role=button text');
    assert.ok(!assistantMsg.text.includes('Hidden UI'), 'should not contain aria-hidden text');
    
    // Verify actual content is preserved
    const expectedText = platformId === 'chatgpt' ? 'Wrap it in a timer' : 'Two issues stand out';
    assert.equal(assistantMsg.text, expectedText, 'actual message text should be preserved');
  }
});

/**
 * Property P2.5: MIN_MESSAGE_CHARS filter is preserved
 * 
 * Messages shorter than MIN_MESSAGE_CHARS (2) should be filtered out as UI noise.
 */
test('Property P2.5: Very short messages are filtered as UI noise', () => {
  const html = `<main>
    <div data-message-author-role="user">Hi there, how can you help me today?</div>
    <div data-message-author-role="assistant">.</div>
    <div data-message-author-role="user">a</div>
    <div data-message-author-role="assistant">I can help with many things!</div>
    <form><div id="prompt-textarea" contenteditable="true"></div></form>
  </main>`;

  const window = loadContentScripts(html, { url: PLATFORMS.chatgpt.url });
  const capture = window.SlipstreamAdapters.capture();

  // Should only get the 2 messages with >= 2 chars
  assert.equal(capture.messages.length, 2, 'should filter out 1-char messages');
  assert.equal(capture.messages[0].text, 'Hi there, how can you help me today?');
  assert.equal(capture.messages[1].text, 'I can help with many things!');
});

/**
 * Property P2.6: Platform-specific metadata is preserved
 * 
 * For any platform, the capture should include correct platform ID, URL,
 * threadKey format, and title extraction.
 */
test('Property P2.6: Platform-specific metadata is correctly preserved', () => {
  fc.assert(
    fc.property(
      alternatingConversationArb,
      fc.constantFrom(...Object.keys(PLATFORMS)),
      (messages, platformId) => {
        const platform = PLATFORMS[platformId];
        const html = generatePlatformHTML(platformId, messages);
        const window = loadContentScripts(html, { url: platform.url });
        const capture = window.SlipstreamAdapters.capture();

        // Verify platform metadata
        assert.equal(capture.platform, platformId, 'platform ID should match');
        assert.equal(capture.url, platform.url, 'URL should be preserved');
        assert.ok(capture.threadKey, 'threadKey should exist');
        assert.ok(
          capture.threadKey.startsWith(platform.keyPrefix),
          `threadKey should start with ${platform.keyPrefix}`
        );
        
        // Verify metadata structure
        assert.ok(typeof capture.title === 'string', 'title should be a string');
        assert.ok(typeof capture.degraded === 'boolean', 'degraded should be a boolean');
        assert.ok(Array.isArray(capture.messages), 'messages should be an array');
      }
    ),
    { numRuns: 50 }
  );
});

/**
 * Property P2.7: Composer finding and interaction is preserved
 * 
 * For any platform, getComposer() should find the correct element and
 * writeComposer() should successfully write text that can be read back.
 */
test('Property P2.7: Composer finding and writing is preserved', () => {
  fc.assert(
    fc.property(
      alternatingConversationArb,
      fc.constantFrom(...Object.keys(PLATFORMS)),
      messageTextArb,
      (messages, platformId, textToWrite) => {
        const platform = PLATFORMS[platformId];
        const html = generatePlatformHTML(platformId, messages);
        const window = loadContentScripts(html, { url: platform.url });
        const { getComposer, writeComposer, readComposer } = window.SlipstreamAdapters;

        const composer = getComposer();
        assert.ok(composer, `${platformId} composer should be found`);

        // Write and verify
        writeComposer(composer, textToWrite);
        const readBack = readComposer(composer);
        
        assert.equal(readBack, textToWrite, 'written text should be readable');
      }
    ),
    { numRuns: 20 }
  );
});

/**
 * Property P2.8: Role assignment logic is preserved
 * 
 * For any conversation, roles should be assigned correctly based on platform
 * attributes or position heuristics.
 */
test('Property P2.8: Role assignment logic is preserved', () => {
  // Test explicit role attributes (ChatGPT)
  const chatgptHTML = `<main>
    <div data-message-author-role="user">User message 1</div>
    <div data-message-author-role="assistant">Assistant message 1</div>
    <div data-message-author-role="user">User message 2</div>
    <form><div id="prompt-textarea" contenteditable="true"></div></form>
  </main>`;

  const window1 = loadContentScripts(chatgptHTML, { url: PLATFORMS.chatgpt.url });
  const capture1 = window1.SlipstreamAdapters.capture();
  
  assert.equal(capture1.messages.length, 3);
  assert.equal(capture1.messages[0].role, 'user');
  assert.equal(capture1.messages[1].role, 'assistant');
  assert.equal(capture1.messages[2].role, 'user');

  // Test testid attributes (Claude)
  const claudeHTML = `<main>
    <div data-testid="user-message">User message</div>
    <div data-testid="assistant-message">Assistant message</div>
    <fieldset><div contenteditable="true" class="ProseMirror"></div></fieldset>
  </main>`;

  const window2 = loadContentScripts(claudeHTML, { url: PLATFORMS.claude.url });
  const capture2 = window2.SlipstreamAdapters.capture();
  
  assert.equal(capture2.messages.length, 2);
  assert.equal(capture2.messages[0].role, 'user');
  assert.equal(capture2.messages[1].role, 'assistant');
});

/**
 * Property P2.9: Message ordering is preserved
 * 
 * Messages should appear in the same order as they appear in the DOM.
 */
test('Property P2.9: Message DOM order is preserved in extraction', () => {
  fc.assert(
    fc.property(
      alternatingConversationArb,
      fc.constantFrom(...Object.keys(PLATFORMS)),
      (messages, platformId) => {
        const platform = PLATFORMS[platformId];
        const html = generatePlatformHTML(platformId, messages);
        const window = loadContentScripts(html, { url: platform.url });
        const capture = window.SlipstreamAdapters.capture();

        // Verify order matches input order
        // Note: readText() trims whitespace
        for (let i = 0; i < messages.length; i++) {
          assert.equal(
            capture.messages[i].text,
            messages[i].text.trim(),
            `message ${i} should maintain DOM order (text trimmed)`
          );
        }
      }
    ),
    { numRuns: 50 }
  );
});

/**
 * Property P2.10: Empty conversations produce empty message arrays
 * 
 * Edge case: Pages with no extractable messages should produce an empty array,
 * not null or throw an error.
 */
test('Property P2.10: Empty conversations are handled gracefully', () => {
  const emptyHTMLs = [
    '<main></main>',
    '<main><div></div></main>',
    '<main><article></article></main>',
    '<main><div>a</div></main>', // Below MIN_MESSAGE_CHARS
  ];

  for (const html of emptyHTMLs) {
    const window = loadContentScripts(html, { url: PLATFORMS.chatgpt.url });
    const capture = window.SlipstreamAdapters.capture();
    
    assert.ok(capture, 'capture should not be null');
    assert.equal(capture.messages.length, 0, 'should have zero messages');
    assert.equal(capture.degraded, false, 'should not be marked as degraded');
  }
});

/* -------------------------------------------------------- Existing Tests Run */

/**
 * This section documents that all existing unit tests pass on unfixed code,
 * establishing the baseline behavior.
 * 
 * The following existing tests from adapters.test.js PASS on unfixed code:
 * ✓ chatgpt: captures the thread with roles intact
 * ✓ chatgpt: finds a composer and writes into it
 * ✓ claude: captures the thread with roles intact
 * ✓ claude: finds a composer and writes into it
 * ✓ gemini: captures the thread with roles intact
 * ✓ gemini: finds a composer and writes into it
 * ✓ grok: captures the thread with roles intact
 * ✓ grok: finds a composer and writes into it
 * ✓ message chrome (buttons, icons) is stripped from captured text
 * ✓ a streaming duplicate of the final message is collapsed
 * ✓ an empty page yields no messages and no crash
 * ✓ an unsupported host produces no capture at all
 * ✓ writing to a textarea fires the input event frameworks listen for
 * 
 * These tests establish baseline behavior for:
 * - Platform-specific extraction (Requirement 3.2)
 * - Message content extraction (Requirement 3.1)
 * - Streaming duplicate detection (Requirement 3.2)
 * - Composer interaction (Requirement 3.2)
 * - Edge case handling (Requirement 3.2)
 */
