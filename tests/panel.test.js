import test from 'node:test';
import assert from 'node:assert/strict';

import { initAccessEasePanel } from '../js/panel.js';
import { keydown, setupDom } from './helpers/dom.js';

const STORAGE_KEY = 'accessease_settings_v2';

const PAGE = `<!doctype html>
<html lang="en">
  <body>
    <header class="navbar" style="position: fixed">Nav</header>
    <main><h1>Marketing page</h1><p>Content to read aloud.</p></main>
    <footer>Footer</footer>
  </body>
</html>`;

/**
 * jsdom gives every document its own localStorage, so "restored on the next visit" is
 * simulated by seeding the store before the panel mounts.
 */
function mountPanel(html = PAGE, seed = null) {
  const dom = setupDom(html);
  if (seed) dom.window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
  initAccessEasePanel();
  return dom;
}

test('the panel mounts once, with dialog semantics and pressed states', () => {
  const dom = mountPanel();
  const { document } = dom.window;

  const trigger = document.getElementById('accessease-trigger');
  const panel = document.getElementById('accessease-panel');

  assert.ok(trigger);
  assert.equal(trigger.getAttribute('aria-haspopup'), 'dialog');
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(trigger.getAttribute('aria-controls'), 'accessease-panel');

  assert.equal(panel.getAttribute('role'), 'dialog');
  assert.equal(panel.getAttribute('aria-modal'), 'true');
  assert.ok(document.getElementById(panel.getAttribute('aria-labelledby')), 'labelled by a real element');
  assert.equal(panel.hasAttribute('inert'), true);

  panel.querySelectorAll('.ae-option-card').forEach((card) => {
    assert.match(
      card.getAttribute('aria-pressed'),
      /^(true|false)$/,
      `${card.textContent.trim()} exposes a pressed state`
    );
    assert.equal(card.getAttribute('type'), 'button');
  });

  // Dark theme is the site default, so that one card starts pressed.
  assert.equal(panel.querySelector('[data-feature="darkmode"]').getAttribute('aria-pressed'), 'true');
  assert.equal(panel.querySelector('[data-feature="dyslexia"]').getAttribute('aria-pressed'), 'false');

  // Every slider needs a real label, not just a visual one.
  ['font-size-slider', 'line-height-slider', 'speech-rate-slider'].forEach((id) => {
    assert.ok(panel.querySelector(`label[for="${id}"]`), `${id} has a label`);
  });

  assert.equal(panel.querySelector('#ae-reset-settings').getAttribute('type'), 'button');
  assert.ok(document.getElementById('accessease-ruler'), 'the reading ruler element exists');
  assert.ok(document.getElementById('accessease-announcer'), 'a live region exists for announcements');
});

test('the panel does not mount twice', () => {
  const dom = mountPanel();
  const second = initAccessEasePanel();
  assert.equal(second, null);
  assert.equal(dom.window.document.querySelectorAll('#accessease-panel').length, 1);
});

test('toggling a tool updates the UI, the document and storage', () => {
  const dom = mountPanel();
  const { document } = dom.window;
  const card = document.querySelector('[data-feature="dyslexia"]');

  card.click();

  assert.equal(card.getAttribute('aria-pressed'), 'true');
  assert.equal(card.classList.contains('active'), true);
  assert.equal(document.body.classList.contains('accessibility-dyslexia'), true);

  const saved = JSON.parse(dom.window.localStorage.getItem(STORAGE_KEY));
  assert.equal(saved.dyslexia, true);

  card.click();
  assert.equal(card.getAttribute('aria-pressed'), 'false');
  assert.equal(document.body.classList.contains('accessibility-dyslexia'), false);
});

test('reset returns every tool to its default and clears stored settings', () => {
  const dom = mountPanel();
  const { document } = dom.window;

  document.querySelector('[data-feature="contrast"]').click();
  document.querySelector('[data-feature="links"]').click();
  document.querySelector('[data-feature="ruler"]').click();
  document.querySelector('#ae-reset-settings').click();

  // Regression: reset used to clear storage and then immediately save the old settings back.
  const saved = JSON.parse(dom.window.localStorage.getItem(STORAGE_KEY));
  assert.equal(saved.highContrast, false);
  assert.equal(saved.highlightLinks, false);
  assert.equal(saved.readingRuler, false);

  ['contrast', 'links', 'ruler'].forEach((feature) => {
    assert.equal(
      document.querySelector(`[data-feature="${feature}"]`).getAttribute('aria-pressed'),
      'false',
      `${feature} is off after reset`
    );
  });

  assert.equal(document.body.classList.contains('accessibility-high-contrast'), false);
  assert.equal(document.getElementById('accessease-ruler').style.display, 'none');
});

test('the reading ruler can be toggled from the panel', () => {
  const dom = mountPanel();
  const { document } = dom.window;
  const ruler = document.getElementById('accessease-ruler');

  assert.equal(ruler.style.display, 'none');
  document.querySelector('[data-feature="ruler"]').click();
  assert.equal(ruler.style.display, 'block');
  assert.equal(ruler.getAttribute('aria-hidden'), 'true', 'the ruler is decorative for screen readers');
});

test('the colour preview never filters the panel or fixed navigation', () => {
  const dom = mountPanel();
  const { document } = dom.window;
  const select = document.getElementById('color-filter-select');

  select.value = 'deuteranopia';
  select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));

  assert.equal(document.documentElement.getAttribute('data-accessease-color-filter'), 'deuteranopia');
  assert.equal(document.querySelector('main').hasAttribute('data-accessease-filtered'), true);
  assert.equal(document.querySelector('header').hasAttribute('data-accessease-filtered'), false);
  assert.equal(document.getElementById('accessease-panel').hasAttribute('data-accessease-filtered'), false);
  assert.equal(document.getElementById('accessease-trigger').hasAttribute('data-accessease-filtered'), false);

  select.value = 'none';
  select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.equal(document.querySelectorAll('[data-accessease-filtered]').length, 0);
});

test('opening and closing the panel manages focus and Escape', () => {
  const dom = mountPanel();
  const { document } = dom.window;
  const trigger = document.getElementById('accessease-trigger');
  const panel = document.getElementById('accessease-panel');

  trigger.click();
  assert.equal(panel.classList.contains('open'), true);
  assert.equal(trigger.getAttribute('aria-expanded'), 'true');
  assert.equal(panel.hasAttribute('inert'), false);
  assert.equal(document.activeElement, panel.querySelector('.ae-close-btn'));

  keydown(dom.window, panel, 'Escape');
  assert.equal(panel.classList.contains('open'), false);
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(panel.hasAttribute('inert'), true);
  assert.equal(document.activeElement, trigger);
});

test('font size changes update the document root and storage', () => {
  const dom = mountPanel();
  const { document } = dom.window;
  const slider = document.getElementById('font-size-slider');

  slider.value = '135';
  slider.dispatchEvent(new dom.window.Event('input', { bubbles: true }));

  assert.equal(document.documentElement.style.fontSize, '135%');
  assert.equal(document.getElementById('font-size-val').textContent, '135%');
  assert.equal(JSON.parse(dom.window.localStorage.getItem(STORAGE_KEY)).fontSize, 135);
});

test('speech speed is configurable and reaches speech synthesis', () => {
  const dom = mountPanel();
  const { document } = dom.window;
  const slider = document.getElementById('speech-rate-slider');

  slider.value = '1.8';
  slider.dispatchEvent(new dom.window.Event('input', { bubbles: true }));

  // The old settings object carried a speechRate that nothing ever read.
  assert.equal(JSON.parse(dom.window.localStorage.getItem(STORAGE_KEY)).speechRate, 1.8);
  assert.equal(document.getElementById('speech-rate-val').textContent, '1.8\u00d7');
});

test('stored preferences are restored on the next visit', () => {
  const first = mountPanel();
  first.window.document.querySelector('[data-feature="keyboard"]').click();
  const saved = JSON.parse(first.window.localStorage.getItem(STORAGE_KEY));
  assert.equal(saved.keyboardNav, true);

  const second = mountPanel(PAGE, saved);
  assert.equal(
    second.window.document.querySelector('[data-feature="keyboard"]').getAttribute('aria-pressed'),
    'true'
  );
  assert.equal(second.window.document.body.classList.contains('accessibility-keyboard-helper'), true);
});
