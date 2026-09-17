/**
 * AccessEase Embeddable Widget — generated file, do not edit by hand.
 * Source: js/core.js + src/widget.js — rebuild with `npm run build:widget`.
 *
 * Embed with:
 *   <script src="accessease.js" async
 *           data-position="bottom-right"
 *           data-accent="#00d9f5"
 *           data-lang="en-US"></script>
 *
 * The OpenDyslexic font is loaded from fonts/OpenDyslexic-Regular.woff2 relative to this
 * file, with a CDN fallback if you don't deploy it.
 */
(function () {
  'use strict';

  if (window.AccessEaseLoaded) return;
  window.AccessEaseLoaded = true;

  // ---------------------------------------------------------------------------
  // Shared core (js/core.js)
  // ---------------------------------------------------------------------------
/**
 * AccessEase shared core — the single source of truth for accessibility behaviour.
 *
 * Both surfaces are built on this module:
 *   - js/panel.js            → the panel on this marketing site
 *   - src/widget.js          → the embeddable single-file widget
 *                              (bundled into widget-build/accessease.js by scripts/build-widget.js)
 *
 * Never duplicate behaviour in a shell. If the widget needs something new, add it here and
 * rebuild with `npm run build:widget`.
 */

/** Body classes toggled by applySettings(). Both shells define these in their CSS. */
const CLASS_NAMES = {
  dyslexia: 'accessibility-dyslexia',
  highContrast: 'accessibility-high-contrast',
  bigCursor: 'accessibility-big-cursor',
  highlightLinks: 'accessibility-highlight-links',
  keyboardNav: 'accessibility-keyboard-helper'
};

/** Marks AccessEase's own UI so it is never filtered or read aloud with the page. */
const UI_CLASS = 'ae-ui';

/** Attribute set on content elements that a colour-blindness preview applies to. */
const FILTERED_ATTRIBUTE = 'data-accessease-filtered';

/** Custom property that holds the active `url(#…)` colour filter reference. */
const FILTER_VAR = '--accessease-color-filter';

const DEFAULT_SETTINGS = {
  fontSize: 100,
  lineHeight: 1.6,
  dyslexia: false,
  highContrast: false,
  darkMode: true,
  readingRuler: false,
  bigCursor: false,
  highlightLinks: false,
  keyboardNav: false,
  colorFilter: 'none',
  speechRate: 1
};

const SETTINGS_LIMITS = {
  fontSize: { min: 90, max: 200, step: 5 },
  lineHeight: { min: 1.2, max: 2.4, step: 0.1 },
  speechRate: { min: 0.6, max: 2, step: 0.1 }
};

/**
 * Merge stored settings over the defaults, ignoring unknown keys and type mismatches
 * so a settings object saved by an older version can never inject `undefined`.
 */
function mergeSettings(saved, defaults = DEFAULT_SETTINGS) {
  const merged = Object.assign({}, defaults);
  if (!saved || typeof saved !== 'object') return merged;
  Object.keys(defaults).forEach((key) => {
    const value = saved[key];
    if (value === undefined || value === null) return;
    if (typeof value !== typeof defaults[key]) return;
    merged[key] = value;
  });
  return merged;
}

/** localStorage-backed settings store with load/save/reset. */
function createSettingsStore(key, defaults = DEFAULT_SETTINGS) {
  return {
    key,
    defaults,
    get() {
      try {
        const raw = localStorage.getItem(key);
        return mergeSettings(raw ? JSON.parse(raw) : null, defaults);
      } catch (error) {
        console.warn('[AccessEase] Could not read saved settings:', error);
        return Object.assign({}, defaults);
      }
    },
    save(settings) {
      try {
        localStorage.setItem(key, JSON.stringify(mergeSettings(settings, defaults)));
        return true;
      } catch (error) {
        console.warn('[AccessEase] Could not save settings:', error);
        return false;
      }
    },
    reset() {
      try {
        localStorage.removeItem(key);
      } catch (error) {
        console.warn('[AccessEase] Could not clear settings:', error);
      }
      return Object.assign({}, defaults);
    }
  };
}

// ---------------------------------------------------------------------------
// Color-blindness simulation
// ---------------------------------------------------------------------------

/**
 * Simulation matrices — these preview how the page LOOKS to a user with a colour vision
 * deficiency. They are not correction/compensation filters and are not a substitute for
 * designing with sufficient contrast.
 */
const COLOR_BLIND_MATRICES = {
  protanopia: '0.567, 0.433, 0, 0, 0  0.558, 0.442, 0, 0, 0  0, 0.242, 0.758, 0, 0  0, 0, 0, 1, 0',
  deuteranopia: '0.625, 0.375, 0, 0, 0  0.7, 0.3, 0, 0, 0  0, 0.3, 0.7, 0, 0  0, 0, 0, 1, 0',
  tritanopia: '0.95, 0.05, 0, 0, 0  0, 0.433, 0.567, 0, 0  0, 0.475, 0.525, 0, 0  0, 0, 0, 1, 0',
  achromatopsia: '0.299, 0.587, 0.114, 0, 0  0.299, 0.587, 0.114, 0, 0  0.299, 0.587, 0.114, 0, 0  0, 0, 0, 1, 0'
};

const NON_CONTENT_TAGS = new Set(['SCRIPT', 'STYLE', 'LINK', 'TEMPLATE', 'NOSCRIPT', 'META']);

function isFixedPosition(element) {
  try {
    return window.getComputedStyle(element).position === 'fixed';
  } catch (error) {
    return false;
  }
}

/**
 * Clear any active preview and remove the generated SVG filter definition.
 */
function clearColorBlindFilter(doc = document) {
  doc.querySelectorAll(`[${FILTERED_ATTRIBUTE}]`).forEach((element) => {
    element.removeAttribute(FILTERED_ATTRIBUTE);
  });
  const svg = doc.getElementById('accessease-color-filter-svg');
  if (svg) svg.remove();
  const root = doc.documentElement;
  root.removeAttribute('data-accessease-color-filter');
  root.style.removeProperty(FILTER_VAR);
}

/**
 * Apply a colour-blindness preview filter.
 *
 * The filter is applied to the page's top-level content elements rather than to `<html>`.
 * Filtering `<html>` would turn the root into a containing block, which breaks
 * `position: fixed` layouts (this site's navbar, for example), and it would also filter
 * AccessEase's own panel — making the preview self-defeating.
 *
 * Known limitation: an element with `position: fixed` nested *inside* a content block is
 * still affected, because no ancestor of a filtered element can escape the filter.
 */
function applyColorBlindFilter(filterType, options = {}) {
  const doc = options.document || document;
  const uiClass = options.uiClass || UI_CLASS;
  const excludedClasses = options.excludeClasses || [uiClass];

  clearColorBlindFilter(doc);

  if (!filterType || filterType === 'none') return false;

  const values = COLOR_BLIND_MATRICES[filterType];
  if (!values) {
    console.warn(`[AccessEase] Unknown colour filter "${filterType}"`);
    return false;
  }

  const svgNS = 'http://www.w3.org/2000/svg';
  const filterId = `accessease-cb-${filterType}`;
  const svg = doc.createElementNS(svgNS, 'svg');
  svg.id = 'accessease-color-filter-svg';
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;';

  const defs = doc.createElementNS(svgNS, 'defs');
  const filter = doc.createElementNS(svgNS, 'filter');
  filter.id = filterId;
  const matrix = doc.createElementNS(svgNS, 'feColorMatrix');
  matrix.setAttribute('type', 'matrix');
  matrix.setAttribute('values', values);

  filter.appendChild(matrix);
  defs.appendChild(filter);
  svg.appendChild(defs);
  doc.body.appendChild(svg);

  const bodyChildren = Array.prototype.slice.call(doc.body.children);
  const targets = bodyChildren.filter((element) => {
    if (NON_CONTENT_TAGS.has(element.tagName)) return false;
    if (element === svg) return false;
    if (excludedClasses.some((className) => element.classList.contains(className))) return false;
    // Skip fixed overlays: a filtered ancestor would break their positioning.
    if (isFixedPosition(element)) return false;
    return true;
  });

  targets.forEach((element) => element.setAttribute(FILTERED_ATTRIBUTE, ''));

  doc.documentElement.setAttribute('data-accessease-color-filter', filterType);
  doc.documentElement.style.setProperty(FILTER_VAR, `url(#${filterId})`);

  return targets.length > 0;
}

// ---------------------------------------------------------------------------
// Reading ruler
// ---------------------------------------------------------------------------

const RULER_HEIGHT = 40;
const RULER_STEP = 24;

/**
 * Reading ruler that follows the mouse, touch, and — for keyboard users — the element
 * that currently has focus, so it works without a pointer at all.
 */
function createReadingRuler(options = {}) {
  const doc = options.document || document;
  const rulerId = options.id || 'accessease-ruler';
  const uiClass = options.uiClass || UI_CLASS;
  const height = options.height || RULER_HEIGHT;
  let ruler = null;
  let active = false;
  let position = null;

  function ensureRuler() {
    if (ruler && ruler.isConnected) return ruler;
    ruler = doc.getElementById(rulerId);
    if (!ruler) {
      ruler = doc.createElement('div');
      ruler.id = rulerId;
      ruler.className = uiClass;
      ruler.setAttribute('aria-hidden', 'true');
      // Hidden inline, not just in CSS: the ruler must stay invisible even if a host page's
      // stylesheet fails to load.
      ruler.style.display = 'none';
      doc.body.appendChild(ruler);
    } else {
      ruler.classList.add(uiClass);
    }
    return ruler;
  }

  function place(clientY) {
    if (!ruler) return;
    const maxY = window.innerHeight - height;
    const clamped = Math.max(0, Math.min(clientY - height / 2, maxY));
    position = clamped;
    ruler.style.transform = `translateY(${clamped}px)`;
  }

  function onPointerMove(event) {
    if (!active || !event.clientY) return;
    place(event.clientY);
  }

  function onFocusIn(event) {
    if (!active) return;
    const target = event.target;
    if (!target || typeof target.getBoundingClientRect !== 'function') return;
    const rect = target.getBoundingClientRect();
    if (!rect.height && !rect.width) return;
    place(rect.top + rect.height / 2);
  }

  function onResize() {
    if (!active || position === null) return;
    place(position + height / 2);
  }

  ensureRuler();
  doc.addEventListener('pointermove', onPointerMove, { passive: true });
  doc.addEventListener('mousemove', onPointerMove, { passive: true });
  doc.addEventListener('focusin', onFocusIn);
  window.addEventListener('resize', onResize);

  return {
    id: rulerId,
    get active() {
      return active;
    },
    /** Move the ruler by a fixed step — used by the keyboard shortcuts in a shell. */
    nudge(direction) {
      if (!active) return;
      const current = position === null ? window.innerHeight / 3 : position;
      place(current + height / 2 + direction * RULER_STEP);
    },
    toggle(enable) {
      active = Boolean(enable);
      const element = ensureRuler();
      element.style.display = active ? 'block' : 'none';
      if (active) {
        const anchor = doc.querySelector(':focus');
        const rect = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : null;
        if (rect && (rect.height || rect.width)) place(rect.top + rect.height / 2);
        else if (position === null) place(window.innerHeight / 3);
        else place(position + height / 2);
      }
      return active;
    },
    destroy() {
      doc.removeEventListener('pointermove', onPointerMove);
      doc.removeEventListener('mousemove', onPointerMove);
      doc.removeEventListener('focusin', onFocusIn);
      window.removeEventListener('resize', onResize);
      if (ruler) ruler.remove();
      ruler = null;
    }
  };
}

// ---------------------------------------------------------------------------
// Text to speech
// ---------------------------------------------------------------------------

const SKIP_TEXT_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE']);

/**
 * Collect readable text without forcing a layout pass, and without including AccessEase's
 * own UI. `element.innerText` is avoided on purpose: on a large page it reflows everything.
 */
function readableTextFrom(root, options = {}) {
  if (!root) return '';
  const doc = root.ownerDocument || document;
  const excludeClasses = options.excludeClasses || [UI_CLASS];
  const maxLength = options.maxLength || 6000;
  const parts = [];
  let length = 0;
  // Read NodeFilter off the document's own window so this works in any realm.
  const nodeFilter = (doc.defaultView || window).NodeFilter;

  const walker = doc.createTreeWalker(root, nodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const text = node.nodeValue;
      if (!text || !text.trim()) return nodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent) return nodeFilter.FILTER_REJECT;
      if (SKIP_TEXT_TAGS.has(parent.tagName)) return nodeFilter.FILTER_REJECT;
      if (parent.getAttribute('aria-hidden') === 'true' && parent.tagName !== 'BODY') {
        return nodeFilter.FILTER_REJECT;
      }
      if (excludeClasses.some((className) => parent.closest(`.${className}`))) {
        return nodeFilter.FILTER_REJECT;
      }
      return nodeFilter.FILTER_ACCEPT;
    }
  });

  while (walker.nextNode()) {
    const text = walker.currentNode.nodeValue.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    parts.push(text);
    length += text.length + 1;
    if (length >= maxLength) break;
  }

  return parts.join(' ').slice(0, maxLength);
}

/** Break text into sentence-sized chunks so long pages are not truncated by the browser. */
function chunkText(text, maxLength = 220) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];

  const chunks = [];
  let current = '';
  const push = () => {
    if (current.trim()) chunks.push(current.trim());
    current = '';
  };

  for (const sentence of clean.match(/[^.!?]+[.!?]*/g) || [clean]) {
    if (sentence.length > maxLength) {
      push();
      for (const word of sentence.trim().split(' ')) {
        if ((current ? current.length + 1 : 0) + word.length > maxLength) push();
        current = current ? `${current} ${word}` : word;
      }
      push();
      continue;
    }
    if ((current ? current.length + 1 : 0) + sentence.length > maxLength) push();
    current += sentence;
  }
  push();

  return chunks;
}

function clampRate(rate) {
  const value = Number(rate);
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.min(Math.max(value, SETTINGS_LIMITS.speechRate.min), SETTINGS_LIMITS.speechRate.max);
}

/**
 * Chunked speech synthesis. Speaks a page one sentence-group at a time because browsers
 * silently cut off very long utterances.
 *
 * Engines fail in more ways than `supported` suggests: a browser can expose the API yet
 * have no voices installed (headless/kiosk setups), and Chrome loads voices asynchronously
 * — reading getVoices() too early returns an empty list and speak() fails. Both cases are
 * surfaced through onStateChange so the UI can explain what happened instead of dying
 * silently, and options.onEngineFailure provides a non-speech fallback hook.
 */
function createTextToSpeech(options = {}) {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
  const supported = Boolean(synth) && typeof window.SpeechSynthesisUtterance === 'function';
  const getRate = options.getRate || (() => DEFAULT_SETTINGS.speechRate);
  const onStateChange = options.onStateChange || null;
  const onEngineFailure = options.onEngineFailure || null;
  let lang = options.lang || '';
  let chunks = [];
  let index = 0;
  let speaking = false;
  let failing = false;

  function notify() {
    if (onStateChange) onStateChange({ speaking, supported, rate: clampRate(getRate()), failing });
  }

  /**
   * Chrome populates the voice list only after a `voiceschanged` event, and until then
   * synthesis can fail. Wait briefly for voices; if none ever arrive, proceed anyway —
   * some engines speak default voice even with an empty getVoices() list.
 */
  function speakWhenVoicesReady(speak) {
    const hasVoiceApi = typeof synth.getVoices === 'function';
    const hadVoices = hasVoiceApi && synth.getVoices().length > 0;
    if (!hasVoiceApi || hadVoices || typeof synth.addEventListener !== 'function') {
      speak();
      return;
    }
    let settled = false;
    const proceed = () => {
      if (settled) return;
      settled = true;
      synth.removeEventListener('voiceschanged', proceed);
      clearTimeout(timer);
      // Re-check: voices may exist now, or the engine may speak without any.
      speak();
    };
    const timer = setTimeout(proceed, 1000);
    synth.addEventListener('voiceschanged', proceed);
  }

  function speakNext() {
    if (index >= chunks.length) {
      speaking = false;
      chunks = [];
      index = 0;
      notify();
      return;
    }
    const utterance = new window.SpeechSynthesisUtterance(chunks[index]);
    utterance.rate = clampRate(getRate());
    utterance.pitch = 1;
    if (lang) utterance.lang = lang;
    utterance.onend = () => {
      if (!speaking) return;
      index += 1;
      speakNext();
    };
    utterance.onerror = (event) => {
      // Cancelled speech also arrives as an 'error' ("interrupted"/"canceled") when stop()
      // ran first; that is normal teardown, not a failure.
      const reason = event && event.error;
      if (!speaking || reason === 'interrupted' || reason === 'canceled') return;
      failing = true;
      speaking = false;
      chunks = [];
      index = 0;
      notify();
      if (onEngineFailure) onEngineFailure(reason || 'synthesis-failed');
    };
    speakWhenVoicesReady(() => {
      // User may have hit stop while we were waiting for voices.
      if (speaking) synth.speak(utterance);
    });
  }

  function stop() {
    const wasSpeaking = speaking;
    speaking = false;
    chunks = [];
    index = 0;
    if (synth) synth.cancel();
    if (wasSpeaking) notify();
  }

  return {
    get supported() {
      return supported;
    },
    get isSpeaking() {
      return speaking;
    },
    get isFailing() {
      return failing;
    },
    get rate() {
      return clampRate(getRate());
    },
    setLang(nextLang) {
      lang = nextLang || '';
    },
    speak(text) {
      if (!supported) {
        notify();
        return false;
      }
      stop();
      failing = false;
      chunks = chunkText(text);
      if (!chunks.length) return false;
      index = 0;
      speaking = true;
      notify();
      speakNext();
      return true;
    },
    stop,
    toggle(text) {
      if (speaking) {
        stop();
        return false;
      }
      return this.speak(text);
    }
  };
}

// ---------------------------------------------------------------------------
// Voice commands
// ---------------------------------------------------------------------------

/**
 * Speech-recognition wrapper.
 *
 * Speech recognition stops on its own after a pause even when `continuous` is true, so the
 * wrapper restarts it while the user still has it enabled, and always reports its real
 * state — a toggle button can never get stuck out of sync.
 */
function createVoiceCommands(options = {}) {
  const onCommand = options.onCommand || null;
  const onStateChange = options.onStateChange || null;
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const supported = Boolean(SpeechRecognition);
  let recognition = null;
  let listening = false;
  let restartTimer = null;

  function notify(reason) {
    if (onStateChange) onStateChange({ listening, supported, reason });
  }

  function clearRestart() {
    if (restartTimer) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }
  }

  function build() {
    if (recognition || !supported) return recognition;
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.lang = options.lang || 'en-US';

    recognition.onresult = (event) => {
      const result = event.results[event.results.length - 1];
      if (!result || !result.isFinal) return;
      // Speech transcripts arrive with inconsistent spacing; normalise before matching.
      const transcript = result[0].transcript.replace(/\s+/g, ' ').trim().toLowerCase();
      if (transcript && onCommand) onCommand(transcript);
    };

    recognition.onerror = (event) => {
      // "no-speech" and "aborted" are routine; anything else means we really stopped.
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      listening = false;
      clearRestart();
      notify(event.error === 'not-allowed' ? 'denied' : 'error');
    };

    recognition.onend = () => {
      if (!listening) return;
      // Restart on the next tick: calling start() synchronously inside onend throws.
      restartTimer = setTimeout(() => {
        if (!listening) return;
        try {
          recognition.start();
        } catch (error) {
          listening = false;
          notify('error');
        }
      }, 250);
    };

    return recognition;
  }

  return {
    get supported() {
      return supported;
    },
    get isListening() {
      return listening;
    },
    setLang(lang) {
      if (recognition) recognition.lang = lang;
      options.lang = lang;
    },
    start() {
      if (!supported) {
        notify('unsupported');
        return false;
      }
      build();
      if (listening) return true;
      listening = true;
      try {
        recognition.start();
      } catch (error) {
        listening = false;
        notify('error');
        return false;
      }
      notify();
      return true;
    },
    stop() {
      listening = false;
      clearRestart();
      if (recognition) {
        try {
          recognition.stop();
        } catch (error) {
          /* already stopped */
        }
      }
      notify();
      return false;
    },
    toggle() {
      return listening ? this.stop() : this.start();
    },
    destroy() {
      this.stop();
      if (recognition) {
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        recognition = null;
      }
    }
  };
}

// ---------------------------------------------------------------------------
// Announcements, focus trap, settings application
// ---------------------------------------------------------------------------

/** Visually hidden live region used to announce setting changes to screen readers. */
function createAnnouncer(doc = document) {
  let region = doc.getElementById('accessease-announcer');
  if (!region) {
    region = doc.createElement('div');
    region.id = 'accessease-announcer';
    region.className = `${UI_CLASS} ae-sr-only`;
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    region.setAttribute('aria-atomic', 'true');
    doc.body.appendChild(region);
  }
  let timer = null;
  return {
    announce(message) {
      if (!message) return;
      region.textContent = '';
      if (timer) clearTimeout(timer);
      // Re-announce identical consecutive messages by clearing first.
      timer = setTimeout(() => {
        region.textContent = message;
      }, 50);
    }
  };
}

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

/** Keep Tab focus inside a modal container while it is open. */
function createFocusTrap(container) {
  function focusable() {
    return Array.prototype.filter.call(
      container.querySelectorAll(FOCUSABLE),
      (element) => !element.hasAttribute('hidden') && element.offsetParent !== null
    );
  }

  function onKeydown(event) {
    if (event.key !== 'Tab') return;
    const items = focusable();
    if (!items.length) {
      event.preventDefault();
      container.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !container.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return {
    activate() {
      container.addEventListener('keydown', onKeydown);
    },
    deactivate() {
      container.removeEventListener('keydown', onKeydown);
    }
  };
}

/**
 * Apply a settings object to the document. Both shells call this so the panel and the
 * embeddable widget can never drift apart.
 *
 * @param {object} settings
 * @param {object} [options]
 * @param {string} [options.themeAttribute] attribute set to "light" when darkMode is off
 * @param {object} [options.ruler]          reading-ruler instance from createReadingRuler()
 */
function applySettings(settings, options = {}) {
  const doc = options.document || document;
  const themeAttribute = options.themeAttribute || 'data-theme';
  const ruler = options.ruler || null;

  doc.body.classList.toggle(CLASS_NAMES.dyslexia, Boolean(settings.dyslexia));
  doc.body.classList.toggle(CLASS_NAMES.highContrast, Boolean(settings.highContrast));
  doc.body.classList.toggle(CLASS_NAMES.bigCursor, Boolean(settings.bigCursor));
  doc.body.classList.toggle(CLASS_NAMES.highlightLinks, Boolean(settings.highlightLinks));
  doc.body.classList.toggle(CLASS_NAMES.keyboardNav, Boolean(settings.keyboardNav));

  if (settings.darkMode) doc.documentElement.removeAttribute(themeAttribute);
  else doc.documentElement.setAttribute(themeAttribute, 'light');

  const fontSize = Number(settings.fontSize) || DEFAULT_SETTINGS.fontSize;
  const lineHeight = Number(settings.lineHeight) || DEFAULT_SETTINGS.lineHeight;
  doc.documentElement.style.fontSize = `${fontSize}%`;
  doc.body.style.lineHeight = String(lineHeight);

  if (ruler) ruler.toggle(settings.readingRuler);
  applyColorBlindFilter(settings.colorFilter || 'none', { document: doc });
}

/** Human-readable label for the active colour filter, used by the reset/undo messages. */
function describeColorFilter(filterType) {
  const labels = {
    none: 'Normal vision',
    protanopia: 'Protanopia preview',
    deuteranopia: 'Deuteranopia preview',
    tritanopia: 'Tritanopia preview',
    achromatopsia: 'Achromatopsia preview'
  };
  return labels[filterType] || labels.none;
}


  // ---------------------------------------------------------------------------
  // Widget shell (src/widget.js)
  // ---------------------------------------------------------------------------
/**
 * AccessEase embeddable widget — the shell for third-party websites.
 *
 * This file is NOT loaded directly by a browser. scripts/build-widget.js flattens it together
 * with js/core.js into the single file widget-build/accessease.js:
 *
 *     npm run build:widget
 *
 * All behaviour comes from js/core.js, so the widget and this site's own panel can never
 * drift apart. Configuration is read from the <script> tag that loads the bundle:
 *
 *     <script src="accessease.js" async
 *             data-position="bottom-left"    bottom-right (default) | bottom-left | top-right | top-left
 *             data-accent="#ff6b6b"          overrides the trigger/accent colour
 *             data-lang="hi-IN"              speech recognition + speech synthesis language
 *             data-storage-key="my-key"></script>
 *
 * @param {object} api the shared core, injected by the bundler
 */
function createAccessEaseWidget(api) {
  const {
    UI_CLASS,
    SETTINGS_LIMITS,
    DEFAULT_SETTINGS,
    describeColorFilter,
    createSettingsStore,
    createReadingRuler,
    createTextToSpeech,
    createVoiceCommands,
    createAnnouncer,
    createFocusTrap,
    readableTextFrom,
    applySettings: applySettingsToDocument
  } = api;

  if (typeof window === 'undefined' || !window.document) return null;

  // One shared preference store per origin, so a visitor's choices carry across the pages
  // of the site they configured them on.
  const STORAGE_KEY = 'accessease_settings_v2';

  function readConfig() {
    const script =
      document.currentScript ||
      document.querySelector('script[src*="accessease"]') ||
      document.querySelector('script[data-accessease]');
    const get = (name) => (script ? script.getAttribute(name) : null);
    const positions = ['bottom-right', 'bottom-left', 'top-right', 'top-left'];
    const position = get('data-position');
    return {
      position: positions.indexOf(position) >= 0 ? position : 'bottom-right',
      accent: get('data-accent') || '',
      lang: get('data-lang') || document.documentElement.lang || 'en-US',
      storageKey: get('data-storage-key') || STORAGE_KEY
    };
  }

  const config = readConfig();

  /** The bundle can be loaded from <head>, so the body may not exist yet. */
  function whenBodyReady(callback) {
    if (document.body) {
      callback();
      return;
    }
    document.addEventListener('DOMContentLoaded', callback, { once: true });
  }

  const store = createSettingsStore(config.storageKey);
  const announcer = createAnnouncer();
  const ruler = createReadingRuler();
  let settings = store.get();
  let statusTimer = null;

  const style = document.createElement('style');
  style.id = 'accessease-widget-styles';
  style.textContent = `
    @font-face {
      font-family: 'OpenDyslexic-Regular';
      src: local('OpenDyslexic'),
           url('fonts/OpenDyslexic-Regular.woff2') format('woff2'),
           url('https://cdn.jsdelivr.net/gh/antijingoist/opendyslexic@master/compiled/OpenDyslexic-Regular.woff2') format('woff2');
      font-weight: normal;
      font-style: normal;
      font-display: swap;
    }
    #accessease-trigger, #accessease-panel {
      --ae-bg: #0a0e14;
      --ae-surface: #12161f;
      --ae-border: rgba(255, 255, 255, 0.08);
      --ae-cyan: #00d9f5;
      --ae-teal: #00f5a0;
      --ae-text: #f4f6f8;
      --ae-muted: #8b94a3;
    }
    [data-ae-theme="light"] #accessease-trigger,
    [data-ae-theme="light"] #accessease-panel {
      --ae-bg: #f8fafc;
      --ae-surface: #ffffff;
      --ae-border: rgba(0, 0, 0, 0.1);
      --ae-text: #0f172a;
      --ae-muted: #475569;
    }
    .ae-sr-only {
      position: absolute !important; width: 1px; height: 1px; padding: 0; margin: -1px;
      overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
    }
    #accessease-trigger {
      position: fixed; z-index: 2147483000;
      width: 60px; height: 60px; border-radius: 50%; padding: 0;
      background: linear-gradient(90deg, var(--ae-teal) 0%, var(--ae-cyan) 50%, #6a5cff 100%);
      color: #0a0e14; display: flex; align-items: center; justify-content: center;
      box-shadow: 0 10px 30px rgba(0, 217, 245, 0.4); cursor: pointer;
      transition: transform 0.25s ease; border: none;
    }
    #accessease-trigger:hover, #accessease-trigger:focus-visible { transform: scale(1.08); }
    #accessease-trigger[data-ae-position="bottom-right"] { bottom: 25px; right: 25px; }
    #accessease-trigger[data-ae-position="bottom-left"] { bottom: 25px; left: 25px; }
    #accessease-trigger[data-ae-position="top-right"] { top: 25px; right: 25px; }
    #accessease-trigger[data-ae-position="top-left"] { top: 25px; left: 25px; }
    #accessease-panel {
      position: fixed; top: 0; right: -420px; width: 400px; max-width: 100vw; height: 100vh;
      background: var(--ae-surface); border-left: 1px solid var(--ae-border);
      box-shadow: -10px 0 50px rgba(0,0,0,0.7); z-index: 2147483001;
      display: flex; flex-direction: column;
      visibility: hidden;
      transition: right 0.35s cubic-bezier(0.16, 1, 0.3, 1), visibility 0.35s;
      font-family: system-ui, -apple-system, sans-serif; color: var(--ae-text);
      font-size: 16px; line-height: 1.5;
    }
    #accessease-panel.open { right: 0; visibility: visible; }
    #accessease-panel:focus { outline: none; }
    .ae-header { padding: 1.25rem 1.5rem; border-bottom: 1px solid var(--ae-border); display: flex; justify-content: space-between; align-items: center; background: var(--ae-bg); }
    .ae-header h2 { margin: 0; font-size: 1.1rem; font-weight: 700; color: var(--ae-text); }
    .ae-close { background: none; border: none; color: var(--ae-muted); font-size: 1.5rem; line-height: 1; cursor: pointer; padding: 0.25rem; }
    .ae-body { padding: 1.5rem; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 1.25rem; }
    .ae-section-title { font-size: 0.8rem; text-transform: uppercase; color: var(--ae-muted); font-family: monospace; letter-spacing: 0.05em; margin-bottom: 0.5rem; }
    .ae-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem; }
    .ae-btn { background: var(--ae-bg); border: 1px solid var(--ae-border); border-radius: 10px; padding: 0.85rem; color: var(--ae-text); cursor: pointer; font-size: 0.85rem; text-align: center; transition: 0.2s; font-weight: 500; font-family: inherit; }
    .ae-btn:hover { border-color: var(--ae-cyan); }
    .ae-btn[aria-pressed="true"] { border-color: var(--ae-cyan); color: var(--ae-cyan); background: rgba(0, 217, 245, 0.12); }
    .ae-control-group { background: var(--ae-bg); border: 1px solid var(--ae-border); border-radius: 10px; padding: 1rem; display: flex; flex-direction: column; gap: 0.5rem; }
    .ae-control-label { display: flex; justify-content: space-between; font-size: 0.85rem; }
    .ae-control-group input[type="range"] { width: 100%; accent-color: var(--ae-cyan); }
    .ae-select { width: 100%; padding: 0.75rem; background: var(--ae-bg); color: var(--ae-text); border: 1px solid var(--ae-border); border-radius: 8px; font-family: inherit; font-size: 0.9rem; }
    .ae-status { margin: 0; padding: 0.75rem 1rem; border-radius: 8px; border: 1px solid var(--ae-cyan); background: rgba(0, 217, 245, 0.08); font-size: 0.85rem; }
    .ae-status.is-error { border-color: #ff5f56; background: rgba(255, 95, 86, 0.12); }
    .ae-reset { background: none; border: none; color: #ff5f56; font-size: 0.9rem; font-weight: 600; cursor: pointer; text-align: left; padding: 0.5rem 0; font-family: inherit; }

    /* Tools applied to the host page ------------------------------------- */
    body.accessibility-dyslexia * { font-family: 'OpenDyslexic-Regular', sans-serif !important; letter-spacing: 0.05em !important; word-spacing: 0.1em !important; }
    body.accessibility-high-contrast { background: #000 !important; color: #fff !important; }
    body.accessibility-high-contrast a { color: #00ffff !important; text-decoration: underline !important; }
    body.accessibility-high-contrast :focus-visible { outline-color: #ffbd2e !important; }
    body.accessibility-big-cursor, body.accessibility-big-cursor * {
      cursor: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24"><polygon points="3 3 21 12 12 15 9 21 3 3" fill="%2300d9f5" stroke="%230a0e14" stroke-width="1.5" stroke-linejoin="round"/></svg>') 6 2, auto !important;
    }
    body.accessibility-big-cursor a, body.accessibility-big-cursor button, body.accessibility-big-cursor [role="button"] {
      cursor: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="%2300d9f5" stroke="%230a0e14" stroke-width="1.5"/></svg>') 12 12, pointer !important;
    }
    body.accessibility-highlight-links a { background-color: rgba(0, 217, 245, 0.3) !important; border: 2px solid #00d9f5 !important; padding: 2px 4px !important; border-radius: 4px !important; }
    body.accessibility-keyboard-helper *:focus { outline: 4px dashed #ffbd2e !important; outline-offset: 4px !important; background-color: rgba(255, 189, 46, 0.2) !important; }
    [data-accessease-filtered] { filter: var(--accessease-color-filter); }
    #accessease-ruler {
      position: fixed; top: 0; left: 0; right: 0; height: 40px;
      background: rgba(0, 217, 245, 0.15);
      border-top: 2px solid var(--ae-cyan, #00d9f5); border-bottom: 2px solid var(--ae-cyan, #00d9f5);
      pointer-events: none; z-index: 2147482999; display: none; will-change: transform;
    }
  `;

  const limits = SETTINGS_LIMITS;

  function buildTrigger() {
    const trigger = document.createElement('button');
    trigger.id = 'accessease-trigger';
    trigger.type = 'button';
    trigger.className = UI_CLASS;
    trigger.setAttribute('data-ae-position', config.position);
    trigger.setAttribute('aria-label', 'Open accessibility toolkit');
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', 'accessease-panel');
    trigger.innerHTML =
      '<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M12 2C13.1 2 14 2.9 14 4C14 5.1 13.1 6 12 6C10.9 6 10 5.1 10 4C10 2.9 10.9 2 12 2ZM21 9H15V22H13V16H11V22H9V9H3V7H21V9Z"/></svg>';
    if (config.accent) trigger.style.setProperty('--ae-cyan', config.accent);
    return trigger;
  }

  function buildPanel() {
    const panel = document.createElement('div');
    panel.id = 'accessease-panel';
    panel.className = UI_CLASS;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'accessease-widget-title');
    panel.setAttribute('tabindex', '-1');
    panel.setAttribute('inert', '');
    if (config.accent) {
      panel.style.setProperty('--ae-cyan', config.accent);
      panel.style.setProperty('--ae-teal', config.accent);
    }
    panel.innerHTML = `
      <div class="ae-header">
        <h2 id="accessease-widget-title">AccessEase Toolkit</h2>
        <button type="button" class="ae-close" aria-label="Close accessibility panel">&times;</button>
      </div>
      <div class="ae-body">
        <div>
          <div class="ae-section-title" id="ae-reading-title">Reading Aids</div>
          <div class="ae-grid" role="group" aria-labelledby="ae-reading-title">
            <button type="button" class="ae-btn" data-tool="dyslexia" aria-pressed="false">Dyslexia Font</button>
            <button type="button" class="ae-btn" data-tool="readingRuler" aria-pressed="false" title="Follows the mouse or the focused element. Use Alt + arrow up/down to move it.">Reading Ruler</button>
            <button type="button" class="ae-btn" data-tool="tts" aria-pressed="false">Text to Speech</button>
            <button type="button" class="ae-btn" data-tool="voice" aria-pressed="false">Voice Commands</button>
          </div>
        </div>
        <div>
          <div class="ae-section-title" id="ae-display-title">Display &amp; Vision</div>
          <div class="ae-grid" role="group" aria-labelledby="ae-display-title">
            <button type="button" class="ae-btn" data-tool="highContrast" aria-pressed="false">High Contrast</button>
            <button type="button" class="ae-btn" data-tool="darkMode" aria-pressed="false">Dark / Light</button>
            <button type="button" class="ae-btn" data-tool="bigCursor" aria-pressed="false">Big Cursor</button>
            <button type="button" class="ae-btn" data-tool="highlightLinks" aria-pressed="false">Highlight Links</button>
            <button type="button" class="ae-btn" data-tool="keyboardNav" aria-pressed="false" style="grid-column: span 2;">Keyboard Nav Helper</button>
          </div>
        </div>
        <div class="ae-control-group">
          <label class="ae-control-label" for="ae-font-slider"><span>Font Size</span><span id="ae-font-val">100%</span></label>
          <input type="range" id="ae-font-slider" min="${limits.fontSize.min}" max="${limits.fontSize.max}" step="${limits.fontSize.step}" value="${settings.fontSize}" aria-describedby="ae-font-val">
        </div>
        <div class="ae-control-group">
          <label class="ae-control-label" for="ae-lh-slider"><span>Line Height</span><span id="ae-lh-val">1.6</span></label>
          <input type="range" id="ae-lh-slider" min="${limits.lineHeight.min}" max="${limits.lineHeight.max}" step="${limits.lineHeight.step}" value="${settings.lineHeight}" aria-describedby="ae-lh-val">
        </div>
        <div class="ae-control-group">
          <label class="ae-control-label" for="ae-rate-slider"><span>Speech Speed</span><span id="ae-rate-val">1&times;</span></label>
          <input type="range" id="ae-rate-slider" min="${limits.speechRate.min}" max="${limits.speechRate.max}" step="${limits.speechRate.step}" value="${settings.speechRate}" aria-describedby="ae-rate-val">
        </div>
        <div class="ae-control-group">
          <label class="ae-control-label" for="ae-color-select"><span>Color Blindness Simulation</span></label>
          <select id="ae-color-select" class="ae-select" title="Preview how this page appears to users with color vision deficiency">
            <option value="none">Normal Vision</option>
            <option value="protanopia">Protanopia preview (Red-blind)</option>
            <option value="deuteranopia">Deuteranopia preview (Green-blind)</option>
            <option value="tritanopia">Tritanopia preview (Blue-blind)</option>
            <option value="achromatopsia">Achromatopsia preview (Monochrome)</option>
          </select>
        </div>
        <p class="ae-status" id="ae-status" hidden></p>
        <button type="button" class="ae-reset" id="ae-reset">Reset All Settings</button>
      </div>
    `;
    return panel;
  }

  function start() {
    document.head.appendChild(style);

    const trigger = buildTrigger();
    const panel = buildPanel();
    document.body.appendChild(trigger);
    document.body.appendChild(panel);

    const els = {
      close: panel.querySelector('.ae-close'),
      buttons: Array.prototype.slice.call(panel.querySelectorAll('.ae-btn')),
      fontSlider: panel.querySelector('#ae-font-slider'),
      fontVal: panel.querySelector('#ae-font-val'),
      lhSlider: panel.querySelector('#ae-lh-slider'),
      lhVal: panel.querySelector('#ae-lh-val'),
      rateSlider: panel.querySelector('#ae-rate-slider'),
      rateVal: panel.querySelector('#ae-rate-val'),
      colorSelect: panel.querySelector('#ae-color-select'),
      status: panel.querySelector('#ae-status'),
      reset: panel.querySelector('#ae-reset')
    };

    const focusTrap = createFocusTrap(panel);
    let lastFocused = null;

    let statusTimer = null;

    function setStatus(message, isError) {
      if (!message) {
        els.status.hidden = true;
        els.status.textContent = '';
        return;
      }
      els.status.hidden = false;
      els.status.textContent = message;
      els.status.classList.toggle('is-error', Boolean(isError));
      if (statusTimer) clearTimeout(statusTimer);
      statusTimer = setTimeout(() => setStatus(''), 6000);
      announcer.announce(message);
    }

    function pageText() {
      return readableTextFrom(document.body, { maxLength: 10000 });
    }

    const tts = createTextToSpeech({
      lang: config.lang,
      getRate: () => settings.speechRate,
      onStateChange: ({ speaking, supported, failing }) => {
        setToolState('tts', speaking);
        if (!supported) setStatus('Text-to-speech is not supported in this browser.', true);
        else if (failing) setStatus('Speech engine failed — auto-scroll reading started.', true);
        else if (!speaking) setStatus('Stopped reading.');
      },
      onEngineFailure: () => startAutoScroll()
    });

    /**
     * Non-speech fallback for hosts without a working synthesis engine (headless browsers,
     * kiosks, machines with no voices installed): scrolls the page slowly so users can
     * still read along hands-free. Stops on any key press, wheel, or touch.
     */
    function startAutoScroll() {
      if (autoScroll.active) return;
      autoScroll.active = true;
      const step = () => {
        if (!autoScroll.active) return;
        const max = document.documentElement.scrollHeight - window.innerHeight;
        if (window.scrollY >= max - 2) {
          stopAutoScroll();
          return;
        }
        window.scrollBy({ top: 1, behavior: 'instant' });
        autoScroll.frame = requestAnimationFrame(step);
      };
      autoScroll.frame = requestAnimationFrame(step);
      const stop = () => stopAutoScroll();
      ['keydown', 'wheel', 'touchstart', 'pointerdown'].forEach((type) =>
        window.addEventListener(type, stop, { once: true, passive: true }));
      setStatus('Auto-scroll reading started. Press any key to stop.', false);
    }

    function stopAutoScroll() {
      if (!autoScroll.active) return;
      autoScroll.active = false;
      if (autoScroll.frame) cancelAnimationFrame(autoScroll.frame);
      autoScroll.frame = null;
    }

    const autoScroll = { active: false, frame: null };

    const voice = createVoiceCommands({
      lang: config.lang,
      onStateChange: ({ listening, supported, reason }) => {
        setToolState('voice', listening);
        if (!supported) setStatus('Voice commands are not supported in this browser.', true);
        else if (reason === 'denied') setStatus('Microphone permission was denied.', true);
        else if (reason === 'error') setStatus('Voice commands stopped. Try again.', true);
        else setStatus(listening ? 'Listening for voice commands.' : 'Voice commands stopped.');
      },
      onCommand: (command) => {
        const next = Object.assign({}, settings);
        if (command.includes('open panel')) return openPanel();
        if (command.includes('close panel')) return closePanel();
        if (command.includes('stop reading')) return tts.stop();
        if (command.includes('read page') || command.includes('read this page')) return tts.speak(pageText());
        if (command.includes('reset')) return resetSettings();
        if (command.includes('dyslexia')) next.dyslexia = !next.dyslexia;
        else if (command.includes('high contrast') || command.includes('contrast')) next.highContrast = !next.highContrast;
        else if (command.includes('dark mode')) next.darkMode = true;
        else if (command.includes('light mode')) next.darkMode = false;
        else if (command.includes('highlight links')) next.highlightLinks = !next.highlightLinks;
        else return setStatus(`Didn't recognise "${command}".`);
        apply(next);
      }
    });

    function setToolState(tool, active) {
      const button = panel.querySelector(`[data-tool="${tool}"]`);
      if (!button) return;
      button.classList.toggle('active', Boolean(active));
      button.setAttribute('aria-pressed', String(Boolean(active)));
    }

    function syncUi() {
      ['dyslexia', 'readingRuler', 'highContrast', 'darkMode', 'bigCursor', 'highlightLinks', 'keyboardNav'].forEach(
        (tool) => setToolState(tool, settings[tool])
      );
      setToolState('tts', tts.isSpeaking);
      setToolState('voice', voice.isListening);
      els.fontSlider.value = settings.fontSize;
      els.fontVal.textContent = `${settings.fontSize}%`;
      els.lhSlider.value = settings.lineHeight;
      els.lhVal.textContent = String(settings.lineHeight);
      els.rateSlider.value = settings.speechRate;
      els.rateVal.textContent = `${settings.speechRate}\u00d7`;
      els.colorSelect.value = settings.colorFilter || 'none';
    }

    function apply(next, options) {
      settings = next;
      applySettingsToDocument(settings, { ruler, themeAttribute: 'data-ae-theme' });
      store.save(settings);
      syncUi();
      if (options && options.announce) setStatus(options.announce);
    }

    function openPanel() {
      if (panel.classList.contains('open')) return;
      lastFocused = document.activeElement;
      panel.classList.add('open');
      panel.removeAttribute('inert');
      trigger.setAttribute('aria-expanded', 'true');
      focusTrap.activate();
      els.close.focus();
    }

    function closePanel() {
      if (!panel.classList.contains('open')) return;
      panel.classList.remove('open');
      panel.setAttribute('inert', '');
      trigger.setAttribute('aria-expanded', 'false');
      focusTrap.deactivate();
      // Clicking a button does not focus it in every browser, and a click on empty space
      // leaves <body> focused — fall back to the trigger so focus is never dumped at the
      // top of a host page.
      const usable =
        lastFocused &&
        lastFocused !== document.body &&
        lastFocused !== document.documentElement &&
        typeof lastFocused.focus === 'function' &&
        document.contains(lastFocused);
      (usable ? lastFocused : trigger).focus();
      lastFocused = null;
    }

    function resetSettings() {
      tts.stop();
      voice.stop();
      ruler.toggle(false);
      stopAutoScroll();
      const fresh = store.reset();
      apply(fresh, { announce: 'All accessibility settings reset.' });
    }

    // --- events -----------------------------------------------------------
    trigger.addEventListener('click', () => (panel.classList.contains('open') ? closePanel() : openPanel()));
    els.close.addEventListener('click', closePanel);
    panel.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closePanel();
      }
    });

    els.buttons.forEach((button) => {
      button.addEventListener('click', () => {
        const tool = button.getAttribute('data-tool');
        if (tool === 'tts') {
          if (tts.isSpeaking) {
            tts.stop();
            setStatus('Stopped reading.');
          } else if (!tts.supported) {
            setStatus('Text-to-speech is not supported in this browser.', true);
          } else if (!tts.speak(pageText())) {
            // Engine broke without firing onEngineFailure (or text was empty) — still give
            // the user a hands-free way to read the page.
            startAutoScroll();
          }
          return;
        }
        if (tool === 'voice') {
          voice.toggle();
          return;
        }
        const next = Object.assign({}, settings);
        next[tool] = !next[tool];
        const label = button.textContent.trim();
        apply(next, { announce: `${label} ${next[tool] ? 'on' : 'off'}.` });
      });
    });

    els.fontSlider.addEventListener('input', (event) => {
      els.fontVal.textContent = `${event.target.value}%`;
      apply(Object.assign({}, settings, { fontSize: parseInt(event.target.value, 10) }));
    });
    els.lhSlider.addEventListener('input', (event) => {
      els.lhVal.textContent = String(event.target.value);
      apply(Object.assign({}, settings, { lineHeight: parseFloat(event.target.value) }));
    });
    els.rateSlider.addEventListener('input', (event) => {
      els.rateVal.textContent = `${event.target.value}\u00d7`;
      apply(Object.assign({}, settings, { speechRate: parseFloat(event.target.value) }));
    });
    els.colorSelect.addEventListener('change', (event) => {
      apply(Object.assign({}, settings, { colorFilter: event.target.value }), {
        announce: describeColorFilter(event.target.value)
      });
    });
    els.reset.addEventListener('click', resetSettings);

    document.addEventListener('keydown', (event) => {
      if (!settings.readingRuler || !event.altKey) return;
      if (event.key === 'ArrowUp') ruler.nudge(-1);
      else if (event.key === 'ArrowDown') ruler.nudge(1);
      else return;
      event.preventDefault();
    });

    apply(settings);

    return { trigger, panel, open: openPanel, close: closePanel, settings: () => Object.assign({}, settings) };
  }

  // A stable handle is returned immediately (the DOM may not be ready yet) and filled in
  // once the widget is actually mounted. Exposed as window.AccessEase.
  let instance = null;
  whenBodyReady(() => {
    instance = start();
  });

  return {
    config,
    defaults: DEFAULT_SETTINGS,
    get ready() {
      return Boolean(instance);
    },
    open: () => instance && instance.open(),
    close: () => instance && instance.close(),
    settings: () => (instance ? instance.settings() : null)
  };
}


  window.AccessEase = createAccessEaseWidget({
    CLASS_NAMES,
    UI_CLASS,
    FILTERED_ATTRIBUTE,
    FILTER_VAR,
    DEFAULT_SETTINGS,
    SETTINGS_LIMITS,
    mergeSettings,
    createSettingsStore,
    COLOR_BLIND_MATRICES,
    clearColorBlindFilter,
    applyColorBlindFilter,
    createReadingRuler,
    readableTextFrom,
    chunkText,
    createTextToSpeech,
    createVoiceCommands,
    createAnnouncer,
    createFocusTrap,
    applySettings,
    describeColorFilter,
  }) || {};
})();
