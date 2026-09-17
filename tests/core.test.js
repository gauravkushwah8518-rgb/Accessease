import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CLASS_NAMES,
  DEFAULT_SETTINGS,
  FILTERED_ATTRIBUTE,
  FILTER_VAR,
  UI_CLASS,
  applyColorBlindFilter,
  applySettings,
  chunkText,
  clearColorBlindFilter,
  createAnnouncer,
  createFocusTrap,
  createReadingRuler,
  createSettingsStore,
  createTextToSpeech,
  createVoiceCommands,
  mergeSettings,
  readableTextFrom
} from '../js/core.js';
import { click, keydown, setupDom, stubRecognition, stubSpeech } from './helpers/dom.js';

// --- settings ---------------------------------------------------------------

test('mergeSettings fills in every default', () => {
  const merged = mergeSettings({ dyslexia: true });
  assert.equal(merged.dyslexia, true);
  assert.equal(merged.fontSize, DEFAULT_SETTINGS.fontSize);
  assert.equal(merged.colorFilter, 'none');
});

test('mergeSettings drops unknown keys and type mismatches', () => {
  const merged = mergeSettings({ nope: 1, fontSize: 'big', darkMode: null, speechRate: 1.4 });
  assert.equal('nope' in merged, false);
  assert.equal(merged.fontSize, DEFAULT_SETTINGS.fontSize);
  assert.equal(merged.darkMode, DEFAULT_SETTINGS.darkMode);
  assert.equal(merged.speechRate, 1.4);
});

test('mergeSettings survives garbage input', () => {
  assert.deepEqual(mergeSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(mergeSettings('not an object'), DEFAULT_SETTINGS);
});

test('settings store round-trips, then resets to defaults', () => {
  setupDom();
  const store = createSettingsStore('accessease-test');

  assert.equal(store.get().colorFilter, 'none');

  store.save(Object.assign({}, store.get(), { colorFilter: 'tritanopia', fontSize: 125 }));
  assert.equal(store.get().colorFilter, 'tritanopia');
  assert.equal(store.get().fontSize, 125);

  const fresh = store.reset();
  assert.equal(fresh.colorFilter, 'none');
  assert.equal(store.get().fontSize, DEFAULT_SETTINGS.fontSize);
});

test('settings store survives corrupt JSON in localStorage', () => {
  setupDom();
  window.localStorage.setItem('accessease-corrupt', '{not json');
  const store = createSettingsStore('accessease-corrupt');
  assert.deepEqual(store.get(), DEFAULT_SETTINGS);
});

// --- text extraction --------------------------------------------------------

test('chunkText keeps every word and never exceeds the limit', () => {
  const text = `First sentence here. ${'Long run of words '.repeat(40)}Final sentence.`;
  const chunks = chunkText(text, 120);

  assert.ok(chunks.length > 1, 'expected the text to be split');
  chunks.forEach((chunk) => assert.ok(chunk.length <= 120, `chunk of ${chunk.length} chars`));
  assert.deepEqual(chunks.join(' ').split(/\s+/), text.trim().split(/\s+/));
});

test('chunkText handles empty and whitespace input', () => {
  assert.deepEqual(chunkText(''), []);
  assert.deepEqual(chunkText(null), []);
  assert.deepEqual(chunkText('   \n  '), []);
});

test('readableTextFrom skips scripts, aria-hidden content and AccessEase UI', () => {
  const dom = setupDom(`<!doctype html><html><body>
    <main>
      <h1>Read me</h1>
      <p>And me.</p>
      <script>var secret = 'nope';</script>
      <div aria-hidden="true">decorative</div>
      <div class="${UI_CLASS}">panel text</div>
    </main>
  </body></html>`);

  const text = readableTextFrom(dom.window.document.querySelector('main'));
  assert.match(text, /Read me/);
  assert.match(text, /And me\./);
  assert.doesNotMatch(text, /nope/);
  assert.doesNotMatch(text, /decorative/);
  assert.doesNotMatch(text, /panel text/);
});

// --- colour filter ----------------------------------------------------------

function filterFixture() {
  return setupDom(`<!doctype html><html><body>
    <header class="navbar" style="position: fixed">nav</header>
    <main>content</main>
    <div class="${UI_CLASS}">panel</div>
    <script></script>
  </body></html>`);
}

test('colour filter marks content elements instead of <html>', () => {
  const dom = setupDom(`<!doctype html><html><body><main>content</main></body></html>`);
  const { document } = dom.window;

  applyColorBlindFilter('protanopia');

  assert.ok(document.getElementById('accessease-color-filter-svg'), 'svg filter definition is injected');
  assert.equal(document.documentElement.getAttribute('data-accessease-color-filter'), 'protanopia');
  assert.equal(
    document.documentElement.style.getPropertyValue(FILTER_VAR),
    'url(#accessease-cb-protanopia)'
  );
  assert.equal(document.querySelector('main').hasAttribute(FILTERED_ATTRIBUTE), true);

  // Regression: filtering <html> makes it a containing block (breaking position: fixed)
  // and filters the accessibility panel itself.
  assert.equal(document.documentElement.style.filter, '');
});

test('colour filter leaves fixed overlays and AccessEase UI unfiltered', () => {
  const dom = filterFixture();

  applyColorBlindFilter('tritanopia');

  assert.equal(dom.window.document.querySelector('main').hasAttribute(FILTERED_ATTRIBUTE), true);
  assert.equal(dom.window.document.querySelector('header').hasAttribute(FILTERED_ATTRIBUTE), false);
  assert.equal(dom.window.document.querySelector(`.${UI_CLASS}`).hasAttribute(FILTERED_ATTRIBUTE), false);
});

test('clearing the colour filter removes every trace of it', () => {
  const dom = filterFixture();

  applyColorBlindFilter('achromatopsia');
  clearColorBlindFilter();

  const { document } = dom.window;
  assert.equal(document.querySelectorAll(`[${FILTERED_ATTRIBUTE}]`).length, 0);
  assert.equal(document.getElementById('accessease-color-filter-svg'), null);
  assert.equal(document.documentElement.hasAttribute('data-accessease-color-filter'), false);
  assert.equal(document.documentElement.style.getPropertyValue(FILTER_VAR), '');
});

test('an unknown colour filter is ignored instead of breaking the page', () => {
  const dom = filterFixture();
  assert.equal(applyColorBlindFilter('not-a-filter'), false);
  assert.equal(dom.window.document.querySelectorAll(`[${FILTERED_ATTRIBUTE}]`).length, 0);
});

// --- applySettings ----------------------------------------------------------

test('applySettings toggles body classes and the theme attribute', () => {
  const dom = setupDom('<!doctype html><html><body><main>content</main></body></html>');
  const { document } = dom.window;

  applySettings(
    Object.assign({}, DEFAULT_SETTINGS, {
      dyslexia: true,
      highlightLinks: true,
      darkMode: false,
      fontSize: 120,
      lineHeight: 2,
      colorFilter: 'deuteranopia'
    })
  );

  assert.equal(document.body.classList.contains(CLASS_NAMES.dyslexia), true);
  assert.equal(document.body.classList.contains(CLASS_NAMES.highlightLinks), true);
  assert.equal(document.body.classList.contains(CLASS_NAMES.bigCursor), false);
  assert.equal(document.documentElement.getAttribute('data-theme'), 'light');
  assert.equal(document.documentElement.style.fontSize, '120%');
  assert.equal(document.body.style.lineHeight, '2');
  assert.equal(document.querySelectorAll(`[${FILTERED_ATTRIBUTE}]`).length > 0, true);

  applySettings(Object.assign({}, DEFAULT_SETTINGS));
  assert.equal(document.body.classList.contains(CLASS_NAMES.dyslexia), false);
});

// --- reading ruler ----------------------------------------------------------

test('reading ruler creates its element, toggles, and follows focus', () => {
  const dom = setupDom('<!doctype html><html><body><button id="host">host button</button></body></html>');
  const ruler = createReadingRuler();
  const element = dom.window.document.getElementById('accessease-ruler');

  assert.ok(element, 'ruler element is created');
  assert.equal(element.classList.contains(UI_CLASS), true);
  assert.equal(element.style.display, 'none');

  ruler.toggle(true);
  assert.equal(element.style.display, 'block');
  assert.match(element.style.transform, /^translateY\(/);

  // Keyboard users get the ruler over the element they focus, so it works without a mouse.
  dom.window.document.getElementById('host').dispatchEvent(
    new dom.window.FocusEvent('focusin', { bubbles: true })
  );
  assert.match(element.style.transform, /^translateY\(/);

  ruler.nudge(1);
  ruler.toggle(false);
  assert.equal(element.style.display, 'none');
});

// --- text to speech ---------------------------------------------------------

const LONG_TEXT = 'Sentence number one is right here. '.repeat(12);

test('text to speech queues chunks and reports state', () => {
  const dom = setupDom();
  const { synth, spoken } = stubSpeech(dom.window);
  const states = [];
  const tts = createTextToSpeech({ getRate: () => 1.5, onStateChange: (state) => states.push(state) });

  assert.equal(tts.supported, true);
  assert.equal(tts.speak(LONG_TEXT), true);
  assert.equal(tts.isSpeaking, true);
  assert.equal(spoken.length, 1);
  assert.equal(spoken[0].rate, 1.5, 'the configured speech rate is applied');

  spoken[0].onend();
  assert.equal(spoken.length, 2, 'the next chunk is spoken after the previous one finishes');
  assert.equal(tts.isSpeaking, true);

  spoken[1].onend();
  assert.equal(tts.isSpeaking, false, 'speaking ends after the final chunk');
  assert.equal(states[0].speaking, true);
  assert.equal(states[states.length - 1].speaking, false);

  tts.speak(LONG_TEXT);
  tts.stop();
  assert.equal(tts.isSpeaking, false);
  assert.equal(synth.cancelled >= 1, true);
});

test('text to speech clamps absurd rates and reports missing support', () => {
  const dom = setupDom();
  stubSpeech(dom.window);
  const fast = createTextToSpeech({ getRate: () => 99 });
  fast.speak(LONG_TEXT);
  assert.equal(fast.rate, 2);

  setupDom(); // fresh window without any speech APIs
  const states = [];
  const unsupported = createTextToSpeech({ onStateChange: (state) => states.push(state) });
  assert.equal(unsupported.supported, false);
  assert.equal(unsupported.speak('hello'), false);
  assert.equal(states[0].supported, false);
});

test('text to speech reports engine failure instead of failing silently', () => {
  const dom = setupDom();
  const { spoken } = stubSpeech(dom.window);
  const states = [];
  const failures = [];
  const tts = createTextToSpeech({
    onStateChange: (state) => states.push(state),
    onEngineFailure: (reason) => failures.push(reason)
  });

  tts.speak('One sentence. Two sentence.');
  // Simulate the engine rejecting the utterance the way Chrome does when it has no voices.
  spoken[0].onerror({ error: 'synthesis-failed' });

  assert.equal(tts.isSpeaking, false, 'speaking stops after an engine failure');
  assert.equal(tts.isFailing, true);
  assert.equal(failures[0], 'synthesis-failed');
  assert.equal(states[states.length - 1].failing, true);

  // A cancellation that arrives after stop() is normal teardown, not a failure.
  const quiet = [];
  const tts2 = createTextToSpeech({ onStateChange: (state) => quiet.push(state) });
  tts2.speak('Another sentence.');
  tts2.stop();
  spoken[1].onerror({ error: 'interrupted' });
  assert.equal(tts2.isFailing, false, 'interrupted teardown is not reported as failure');
});

test('text to speech waits for voices to load before speaking', async () => {
  const dom = setupDom();
  const { synth, spoken } = stubSpeech(dom.window);
  // Chrome-style engine: no voices yet, and a voiceschanged event arrives later.
  synth.getVoices = () => [];
  let voicesChanged;
  synth.addEventListener = (type, handler) => {
    if (type === 'voiceschanged') voicesChanged = handler;
  };
  synth.removeEventListener = () => {};

  const tts = createTextToSpeech();
  assert.equal(tts.speak('Waiting for voices.'), true);
  assert.equal(spoken.length, 0, 'speech waits while the voice list is still empty');

  synth.getVoices = () => [{ name: 'Test Voice', lang: 'en-US' }];
  voicesChanged();
  assert.equal(spoken.length, 1, 'speech starts once voices have loaded');
});

// --- voice commands ---------------------------------------------------------

test('voice commands stay in sync when the browser stops recognition', async () => {
  const dom = setupDom();
  const instances = stubRecognition(dom.window);
  const commands = [];
  const voice = createVoiceCommands({ onCommand: (command) => commands.push(command) });

  assert.equal(voice.supported, true);
  voice.toggle();

  assert.equal(voice.isListening, true);
  assert.equal(instances.length, 1, 'only one recognition instance is ever created');
  assert.equal(instances[0].started, 1);

  instances[0].result('Dark  Mode ');
  assert.deepEqual(commands, ['dark mode']);

  instances[0].result('ignored', false);
  assert.deepEqual(commands, ['dark mode'], 'interim results are ignored');

  // Regression: browsers end recognition on their own after a pause. The wrapper must
  // notice and restart instead of leaving the toggle stuck showing "listening".
  instances[0].end();
  assert.equal(voice.isListening, true);
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.equal(instances[0].started, 2, 'recognition is restarted after an automatic stop');

  voice.toggle();
  assert.equal(voice.isListening, false);
  assert.equal(instances[0].stopped, 1);
});

test('voice commands handle errors without getting stuck', () => {
  const dom = setupDom();
  const instances = stubRecognition(dom.window);
  const reasons = [];
  const voice = createVoiceCommands({ onStateChange: (state) => reasons.push(state.reason) });

  voice.toggle();
  instances[0].fail('no-speech');
  assert.equal(voice.isListening, true, 'a silent pause is not a failure');

  instances[0].fail('not-allowed');
  assert.equal(voice.isListening, false);
  assert.equal(reasons.includes('denied'), true);
});

test('voice commands report missing browser support', () => {
  setupDom();
  const voice = createVoiceCommands({});
  assert.equal(voice.supported, false);
  assert.equal(voice.start(), false);
});

// --- announcer and focus trap ----------------------------------------------

test('announcer creates one live region and reuses it', async () => {
  const dom = setupDom();
  const announcer = createAnnouncer();
  const second = createAnnouncer();

  const regions = dom.window.document.querySelectorAll('#accessease-announcer');
  assert.equal(regions.length, 1);
  assert.equal(regions[0].getAttribute('role'), 'status');
  assert.equal(regions[0].getAttribute('aria-live'), 'polite');

  announcer.announce('Ruler on.');
  second.announce('Ruler off.');
  // announce() clears the region and writes on a short delay so that repeating the same
  // message is still announced by screen readers.
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.equal(regions[0].textContent, 'Ruler off.');
});

test('focus trap wraps Tab inside the container', () => {
  const dom = setupDom('<!doctype html><html><body><button id="outside">outside</button></body></html>');
  const { document } = dom.window;

  const container = document.createElement('div');
  container.innerHTML = '<button id="first">first</button><button id="last">last</button>';
  document.body.appendChild(container);

  const trap = createFocusTrap(container);
  trap.activate();

  const first = document.getElementById('first');
  const last = document.getElementById('last');

  last.focus();
  keydown(dom.window, last, 'Tab');
  assert.equal(document.activeElement, first, 'Tab from the last item wraps to the first');

  first.focus();
  keydown(dom.window, first, 'Tab', { shiftKey: true });
  assert.equal(document.activeElement, last, 'Shift+Tab from the first item wraps to the last');

  trap.deactivate();
});

// --- misc helpers -----------------------------------------------------------

test('click helper dispatches bubbling clicks', () => {
  const dom = setupDom('<!doctype html><html><body><button id="b">b</button></body></html>');
  let clicks = 0;
  const button = dom.window.document.getElementById('b');
  dom.window.document.body.addEventListener('click', () => {
    clicks += 1;
  });
  click(dom.window, button);
  assert.equal(clicks, 1);
});
