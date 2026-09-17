import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

import { installGlobals, keydown } from './helpers/dom.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundlePath = path.join(root, 'widget-build', 'accessease.js');
const bundle = fs.readFileSync(bundlePath, 'utf8');

// --- the checked-in bundle must match its sources ---------------------------

test('the committed widget bundle is up to date with its sources', () => {
  const scratch = path.join(os.tmpdir(), `accessease-widget-${process.pid}.js`);
  execFileSync(process.execPath, [path.join(root, 'scripts', 'build-widget.cjs'), '--out', scratch], {
    stdio: 'pipe'
  });
  const rebuilt = fs.readFileSync(scratch, 'utf8');
  fs.rmSync(scratch, { force: true });

  assert.equal(
    rebuilt,
    bundle,
    'widget-build/accessease.js is stale — run `npm run build:widget`'
  );
});

test('the bundle is a self-contained classic script', () => {
  assert.doesNotMatch(bundle, /^\s*import\s/m, 'no leftover import statements');
  assert.doesNotMatch(bundle, /^\s*export\s/m, 'no leftover export statements');
  assert.match(bundle, /window\.AccessEaseLoaded = true/);
  assert.match(bundle, /window\.AccessEase = createAccessEaseWidget/);
});

// --- mounting ---------------------------------------------------------------

const HOST_PAGE = `<!doctype html>
<html lang="en">
  <head>
    <script src="/accessease.js" async
            data-position="bottom-left"
            data-accent="#ff6b6b"
            data-lang="hi-IN"
            data-storage-key="host-widget"></script>
  </head>
  <body>
    <header style="position: fixed">Site header</header>
    <main><h1>Host page content</h1></main>
  </body>
</html>`;

/**
 * jsdom gives every document its own localStorage, so "restored on the next page load" is
 * simulated by seeding the store before the bundle runs.
 */
function mountWidget(html = HOST_PAGE, seed = null) {
  const virtualConsole = new VirtualConsole().sendTo(console, { omitJSDOMErrors: true });
  const dom = new JSDOM(html, {
    url: 'https://host.test/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole
  });
  installGlobals(dom.window);
  if (seed) Object.keys(seed).forEach((key) => dom.window.localStorage.setItem(key, JSON.stringify(seed[key])));
  dom.window.eval(bundle);
  return dom;
}

test('the widget mounts with accessible dialog semantics', () => {
  const dom = mountWidget();
  const { document } = dom.window;

  assert.equal(dom.window.AccessEaseLoaded, true);
  assert.equal(dom.window.AccessEase.ready, true);

  const trigger = document.getElementById('accessease-trigger');
  const panel = document.getElementById('accessease-panel');

  assert.ok(trigger, 'the trigger button is injected');
  assert.equal(trigger.getAttribute('aria-haspopup'), 'dialog');
  assert.equal(trigger.getAttribute('aria-controls'), 'accessease-panel');
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(trigger.getAttribute('aria-label'), 'Open accessibility toolkit');

  assert.equal(panel.getAttribute('role'), 'dialog');
  assert.equal(panel.getAttribute('aria-modal'), 'true');
  assert.ok(panel.getAttribute('aria-labelledby'), 'the dialog is labelled');
  assert.equal(panel.hasAttribute('inert'), true, 'a closed dialog is inert');

  panel.querySelectorAll('.ae-btn').forEach((button) => {
    assert.match(
      button.getAttribute('aria-pressed'),
      /^(true|false)$/,
      `${button.textContent} exposes a pressed state`
    );
  });

  // Dark mode is on by default; everything else starts off.
  assert.equal(document.querySelector('[data-tool="darkMode"]').getAttribute('aria-pressed'), 'true');
  assert.equal(document.querySelector('[data-tool="highContrast"]').getAttribute('aria-pressed'), 'false');
});

test('the widget reads its configuration from the script tag', () => {
  const dom = mountWidget();
  const { document } = dom.window;

  // Spread into a plain object: values crossing the jsdom realm carry that realm's
  // Object.prototype, which deepStrictEqual would reject.
  assert.deepEqual(Object.assign({}, dom.window.AccessEase.config), {
    position: 'bottom-left',
    accent: '#ff6b6b',
    lang: 'hi-IN',
    storageKey: 'host-widget'
  });

  assert.equal(document.getElementById('accessease-trigger').getAttribute('data-ae-position'), 'bottom-left');
  assert.equal(document.getElementById('accessease-trigger').style.getPropertyValue('--ae-cyan'), '#ff6b6b');
});

test('an invalid data-position falls back to bottom-right', () => {
  const dom = mountWidget(
    `<!doctype html><html><head>
      <script src="/accessease.js" data-position="diagonal"></script>
    </head><body></body></html>`
  );
  assert.equal(dom.window.AccessEase.config.position, 'bottom-right');
  assert.equal(dom.window.AccessEase.config.lang, 'en-US', 'falls back when the page declares no language');
});

// --- interaction ------------------------------------------------------------

test('opening and closing the widget manages focus and aria state', () => {
  const dom = mountWidget();
  const { document } = dom.window;
  const trigger = document.getElementById('accessease-trigger');
  const panel = document.getElementById('accessease-panel');

  trigger.click();
  assert.equal(panel.classList.contains('open'), true);
  assert.equal(trigger.getAttribute('aria-expanded'), 'true');
  assert.equal(panel.hasAttribute('inert'), false);
  assert.equal(document.activeElement, panel.querySelector('.ae-close'), 'focus moves into the dialog');

  keydown(dom.window, panel, 'Escape');
  assert.equal(panel.classList.contains('open'), false);
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(panel.hasAttribute('inert'), true);
  assert.equal(document.activeElement, trigger, 'focus returns to the trigger');
});

test('toggling a tool updates aria-pressed, the page and localStorage', () => {
  const dom = mountWidget();
  const { document } = dom.window;
  const button = document.querySelector('[data-tool="dyslexia"]');

  button.click();

  assert.equal(button.getAttribute('aria-pressed'), 'true');
  assert.equal(document.body.classList.contains('accessibility-dyslexia'), true);

  const saved = JSON.parse(dom.window.localStorage.getItem('host-widget'));
  assert.equal(saved.dyslexia, true);

  button.click();
  assert.equal(button.getAttribute('aria-pressed'), 'false');
  assert.equal(document.body.classList.contains('accessibility-dyslexia'), false);
});

test('settings are restored on the next page load', () => {
  const first = mountWidget();
  first.window.document.querySelector('[data-tool="bigCursor"]').click();
  const saved = JSON.parse(first.window.localStorage.getItem('host-widget'));
  assert.equal(saved.bigCursor, true);

  const second = mountWidget(HOST_PAGE, { 'host-widget': saved });
  assert.equal(second.window.document.querySelector('[data-tool="bigCursor"]').getAttribute('aria-pressed'), 'true');
  assert.equal(second.window.document.body.classList.contains('accessibility-big-cursor'), true);
});

test('the colour preview filters page content but not the widget itself', () => {
  const dom = mountWidget();
  const { document } = dom.window;
  const select = document.getElementById('ae-color-select');

  select.value = 'protanopia';
  select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));

  assert.equal(document.documentElement.getAttribute('data-accessease-color-filter'), 'protanopia');
  assert.equal(document.querySelector('main').hasAttribute('data-accessease-filtered'), true);
  assert.equal(
    document.querySelector('header').hasAttribute('data-accessease-filtered'),
    false,
    'a fixed host header is left alone so its positioning keeps working'
  );
  assert.equal(document.getElementById('accessease-panel').hasAttribute('data-accessease-filtered'), false);

  select.value = 'none';
  select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.equal(document.querySelectorAll('[data-accessease-filtered]').length, 0);
});

test('reset clears the stored preferences', () => {
  const dom = mountWidget();
  const { document } = dom.window;

  document.querySelector('[data-tool="highContrast"]').click();
  document.getElementById('ae-reset').click();

  const saved = JSON.parse(dom.window.localStorage.getItem('host-widget'));
  assert.equal(saved.highContrast, false, 'reset must not write the old settings back');
  assert.equal(document.body.classList.contains('accessibility-high-contrast'), false);
  assert.equal(document.querySelector('[data-tool="highContrast"]').getAttribute('aria-pressed'), 'false');
});

test('speech controls degrade gracefully when the browser has no support', async () => {
  const dom = mountWidget();
  const { document } = dom.window;

  document.querySelector('[data-tool="tts"]').click();
  await new Promise((resolve) => setTimeout(resolve, 80));

  const status = document.getElementById('ae-status');
  assert.equal(status.hidden, false);
  assert.match(status.textContent, /not supported/i);
  assert.doesNotMatch(status.textContent, /undefined/);
});
