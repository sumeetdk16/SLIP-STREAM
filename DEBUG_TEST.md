# 🔍 Debug Test - Find the Actual Composers

## Run this on each platform to find what composer elements exist:

### On Grok (grok.com):

Open console (F12) and run:

```javascript
// 1. Check if extension loaded
console.log('Extension loaded:', window.__slipstreamLoaded);
console.log('Platform:', slipstreamPlatformForHost(location.hostname));

// 2. Find ALL textareas
const textareas = document.querySelectorAll('textarea');
console.log('All textareas:', textareas);
textareas.forEach((ta, i) => {
  console.log(`Textarea ${i}:`, {
    placeholder: ta.placeholder,
    id: ta.id,
    className: ta.className,
    ariaLabel: ta.getAttribute('aria-label'),
    visible: ta.offsetParent !== null
  });
});

// 3. Find ALL contenteditable
const editables = document.querySelectorAll('[contenteditable="true"]');
console.log('All contenteditable:', editables);
editables.forEach((el, i) => {
  console.log(`Editable ${i}:`, {
    tagName: el.tagName,
    id: el.id,
    className: el.className,
    role: el.role,
    visible: el.offsetParent !== null
  });
});

// 4. What does SlipstreamAdapters find?
const composer = SlipstreamAdapters?.getComposer();
console.log('SlipstreamAdapters found:', composer);

// 5. Try to write to it
if (composer) {
  SlipstreamAdapters.writeComposer(composer, 'DEBUG TEST TEXT');
  console.log('Wrote test text. Check the input!');
  
  // Check if it stuck
  setTimeout(() => {
    const content = SlipstreamAdapters.readComposer(composer);
    console.log('Composer now contains:', content.length, 'chars');
    console.log('Content:', content.substring(0, 100));
  }, 500);
}
```

---

### On Gemini (gemini.google.com/app):

```javascript
// 1. Check page state
console.log('Extension loaded:', window.__slipstreamLoaded);
console.log('URL:', location.href);
console.log('On landing page?', !!document.querySelector('[href*="chat"]'));

// 2. Find rich-textarea (Gemini's custom element)
const richTextarea = document.querySelector('rich-textarea');
console.log('rich-textarea element:', richTextarea);

if (richTextarea) {
  const inner = richTextarea.querySelector('[contenteditable]');
  console.log('Inner contenteditable:', inner);
}

// 3. Find all contenteditable divs
const editables = document.querySelectorAll('[contenteditable="true"]');
console.log('All contenteditable:', editables.length);
editables.forEach((el, i) => {
  console.log(`Editable ${i}:`, {
    parent: el.parentElement?.tagName,
    id: el.id,
    className: el.className,
    placeholder: el.getAttribute('data-placeholder'),
    visible: el.offsetParent !== null
  });
});

// 4. What composer did extension find?
const composer = SlipstreamAdapters?.getComposer();
console.log('Extension found:', composer);

// 5. Try writing
if (composer) {
  SlipstreamAdapters.writeComposer(composer, 'GEMINI TEST TEXT');
  setTimeout(() => {
    console.log('Content after write:', SlipstreamAdapters.readComposer(composer).length, 'chars');
  }, 500);
}
```

---

### On Copilot (copilot.microsoft.com):

```javascript
// 1. Check what page we're on
console.log('URL:', location.href);
console.log('Extension loaded:', window.__slipstreamLoaded);

// 2. Check for conversation elements
console.log('Has cib-serp:', !!document.querySelector('cib-serp'));
console.log('Has cib-conversation:', !!document.querySelector('cib-conversation'));
console.log('Has #b_sydConvCont:', !!document.querySelector('#b_sydConvCont'));

// 3. Find the input
const inputs = document.querySelectorAll('textarea, input[type="text"], [contenteditable]');
console.log('All inputs:', inputs.length);
inputs.forEach((el, i) => {
  console.log(`Input ${i}:`, {
    tagName: el.tagName,
    type: el.type,
    id: el.id,
    className: el.className,
    placeholder: el.placeholder,
    visible: el.offsetParent !== null
  });
});

// 4. What did extension find?
const composer = SlipstreamAdapters?.getComposer();
console.log('Extension found:', composer);

// 5. Manual test
const manualTextarea = document.querySelector('textarea');
console.log('Manual textarea search:', manualTextarea);

if (composer) {
  SlipstreamAdapters.writeComposer(composer, 'COPILOT TEST');
  setTimeout(() => {
    console.log('After write:', SlipstreamAdapters.readComposer(composer).length, 'chars');
  }, 500);
}
```

---

## What to Look For:

### ✅ Good Signs:
- Extension loaded: `true`
- Composer found: an element
- After write: more than 0 chars
- You see text in the input field

### ❌ Bad Signs:
- Extension loaded: `false` or `undefined` → Reload page
- Composer found: `null` → Selectors are wrong
- After write: 0 chars → Write function not working
- Input field still empty → Events not firing

---

## Send Me:

**For Grok, copy/paste:**
1. All textarea info (placeholder, id, className)
2. What `SlipstreamAdapters.getComposer()` returned
3. Did "DEBUG TEST TEXT" appear in the input?

**For Gemini, copy/paste:**
1. Is `rich-textarea` found?
2. Number of contenteditable elements
3. What composer was found?
4. Did test text appear?

**For Copilot, copy/paste:**
1. The URL you're on
2. Has cib-serp or cib-conversation?
3. All input elements found
4. What composer was found?

This will tell me exactly what selectors to use! 🎯
