import { JSDOM } from 'jsdom';

/** Minimal viewport so the reading ruler has something to clamp against. */
const VIEWPORT_HEIGHT = 800;

export function setupDom(html = '<!doctype html><html lang="en"><head></head><body></body></html>') {
  const dom = new JSDOM(html, {
    url: 'https://example.test/',
    pretendToBeVisual: true,
    runScripts: 'outside-only'
  });
  installGlobals(dom.window);
  return dom;
}

/** Expose the jsdom window as the globals the core module reads. */
export function installGlobals(window) {
  global.window = window;
  global.document = window.document;
  global.NodeFilter = window.NodeFilter;
  global.HTMLElement = window.HTMLElement;
  global.localStorage = window.localStorage;

  // jsdom performs no layout, so offsetParent is always null. The focus trap filters
  // candidates on it, so give it a browser-like value.
  Object.defineProperty(window.HTMLElement.prototype, 'offsetParent', {
    configurable: true,
    get() {
      return this.parentElement;
    }
  });

  Object.defineProperty(window, 'innerHeight', { configurable: true, value: VIEWPORT_HEIGHT });
  return window;
}

/**
 * Fake `speechSynthesis` that records utterances. `speak()` deliberately does not call
 * onend — tests drive the queue explicitly so chunk sequencing is deterministic.
 */
export function stubSpeech(window) {
  const spoken = [];
  const synth = {
    speaking: false,
    cancelled: 0,
    speak(utterance) {
      spoken.push(utterance);
      synth.speaking = true;
    },
    cancel() {
      synth.cancelled += 1;
      synth.speaking = false;
    }
  };
  window.speechSynthesis = synth;
  window.SpeechSynthesisUtterance = class SpeechSynthesisUtterance {
    constructor(text) {
      this.text = text;
      this.rate = 1;
      this.pitch = 1;
      this.lang = '';
    }
  };
  return { synth, spoken };
}

/** Fake SpeechRecognition; every instance is recorded so restarts can be asserted. */
export function stubRecognition(window) {
  const instances = [];
  window.SpeechRecognition = class SpeechRecognition {
    constructor() {
      this.started = 0;
      this.stopped = 0;
      this.lang = '';
      this.continuous = false;
      this.interimResults = true;
      instances.push(this);
    }
    start() {
      this.started += 1;
    }
    stop() {
      this.stopped += 1;
      if (typeof this.onend === 'function') this.onend();
    }
    result(transcript, isFinal = true) {
      if (typeof this.onresult === 'function') {
        this.onresult({ results: [Object.assign([{ transcript }], { isFinal })] });
      }
    }
    end() {
      if (typeof this.onend === 'function') this.onend();
    }
    fail(error) {
      if (typeof this.onerror === 'function') this.onerror({ error });
    }
  };
  return instances;
}

export function keydown(window, target, key, init = {}) {
  target.dispatchEvent(new window.KeyboardEvent('keydown', Object.assign({ key, bubbles: true, cancelable: true }, init)));
}

export function click(window, target) {
  target.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
}
