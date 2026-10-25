// Debug script to run in browser console
// This will show you what the extension is seeing

console.log('=== SLIPSTREAM DEBUG ===');

// Enable debug mode
localStorage.setItem('slipstream-debug', 'true');

// Check what selectors match
console.log('\n1. Checking data-message-author-role:');
const roleNodes = document.querySelectorAll('[data-message-author-role]');
console.log('Found:', roleNodes.length, 'nodes');
roleNodes.forEach((node, i) => {
  console.log(`  ${i + 1}. Role: ${node.getAttribute('data-message-author-role')}, Text: "${node.textContent.substring(0, 100)}"`);
});

console.log('\n2. Checking conversation-turn:');
const turnNodes = document.querySelectorAll('[data-testid*="conversation-turn"]');
console.log('Found:', turnNodes.length, 'nodes');

console.log('\n3. Checking main article:');
const articles = document.querySelectorAll('main article');
console.log('Found:', articles.length, 'articles');

console.log('\n4. Running actual capture:');
if (window.SlipstreamAdapters) {
  const capture = window.SlipstreamAdapters.capture();
  console.log('Capture result:', {
    platform: capture?.platform,
    messageCount: capture?.messages?.length,
    messages: capture?.messages,
    degraded: capture?.degraded
  });
} else {
  console.log('SlipstreamAdapters not found - extension not loaded?');
}

console.log('\n=== END DEBUG ===');
