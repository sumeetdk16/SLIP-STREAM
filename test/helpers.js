import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ext = path.join(root, 'extension');

export function readSource(relative) {
  return fs.readFileSync(path.join(ext, relative), 'utf8');
}

/** Loads the classic content scripts into a fresh jsdom window. */
export function loadContentScripts(html, { url = 'https://chatgpt.com/c/abc123', scripts = [] } = {}) {
  const dom = new JSDOM(html, { url, pretendToBeVisual: true, runScripts: 'dangerously' });
  const { window } = dom;
  // jsdom has no layout, so innerText does not exist. The adapters already fall
  // back to textContent; the limit watcher reads innerText directly, so shim it.
  Object.defineProperty(window.HTMLElement.prototype, 'innerText', {
    configurable: true,
    get() {
      return this.textContent;
    }
  });
  for (const file of ['src/shared/platforms.js', 'src/shared/logos.js', 'src/content/adapters.js', ...scripts]) {
    window.eval(readSource(file));
  }
  return window;
}

/** Loads a service-worker-side module (platforms/prompts/groq) into Node. */
export function loadWorkerModule(relative) {
  const scope = { self: {}, globalThis: {} };
  scope.self.self = scope.self;
  const fn = new Function('self', 'globalThis', readSource(relative));
  fn(scope.self, scope.self);
  return scope.self;
}
