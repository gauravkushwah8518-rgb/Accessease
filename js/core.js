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
export const CLASS_NAMES = {
  dyslexia: 'accessibility-dyslexia',
  highContrast: 'accessibility-high-contrast',
  bigCursor: 'accessibility-big-cursor',
  highlightLinks: 'accessibility-highlight-links',
  keyboardNav: 'accessibility-keyboard-helper'
};

/** Marks AccessEase's own UI so it is never filtered or read aloud with the page. */
export const UI_CLASS = 'ae-ui';

/** Attribute set on content elements that a colour-blindness preview applies to. */
export const FILTERED_ATTRIBUTE = 'data-accessease-filtered';

/** Custom property that holds the active `url(#…)` colour filter reference. */
export const FILTER_VAR = '--accessease-color-filter';

export const DEFAULT_SETTINGS = {
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

export const SETTINGS_LIMITS = {
  fontSize: { min: 90, max: 200, step: 5 },
  lineHeight: { min: 1.2, max: 2.4, step: 0.1 },
  speechRate: { min: 0.6, max: 2, step: 0.1 }
};

/**
 * Merge stored settings over the defaults, ignoring unknown keys and type mismatches
 * so a settings object saved by an older version can never inject `undefined`.
 */
export function mergeSettings(saved, defaults = DEFAULT_SETTINGS) {
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
export function createSettingsStore(key, defaults = DEFAULT_SETTINGS) {
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
export const COLOR_BLIND_MATRICES = {
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
export function clearColorBlindFilter(doc = document) {
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
export function applyColorBlindFilter(filterType, options = {}) {
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
export function createReadingRuler(options = {}) {
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
export function readableTextFrom(root, options = {}) {
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
export function chunkText(text, maxLength = 220) {
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
export function createTextToSpeech(options = {}) {
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
export function createVoiceCommands(options = {}) {
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
export function createAnnouncer(doc = document) {
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
export function createFocusTrap(container) {
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
export function applySettings(settings, options = {}) {
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
export function describeColorFilter(filterType) {
  const labels = {
    none: 'Normal vision',
    protanopia: 'Protanopia preview',
    deuteranopia: 'Deuteranopia preview',
    tritanopia: 'Tritanopia preview',
    achromatopsia: 'Achromatopsia preview'
  };
  return labels[filterType] || labels.none;
}
