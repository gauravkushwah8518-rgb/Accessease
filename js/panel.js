/**
 * AccessEase panel for this marketing site.
 *
 * All accessibility behaviour lives in js/core.js — this file only builds the site's UI
 * shell around it. The embeddable widget (src/widget.js) uses the same core, so the two
 * surfaces can no longer drift apart.
 */
import {
  UI_CLASS,
  SETTINGS_LIMITS,
  describeColorFilter,
  createSettingsStore,
  createReadingRuler,
  createTextToSpeech,
  createVoiceCommands,
  createAnnouncer,
  createFocusTrap,
  readableTextFrom,
  applySettings as applySettingsToDocument
} from './core.js';

const STORAGE_KEY = 'accessease_settings_v2';

function pageText() {
  return readableTextFrom(document.querySelector('main') || document.body, { maxLength: 8000 });
}

export function initAccessEasePanel() {
  // Early-exit if the embeddable widget already loaded, or the panel already exists
  if (window.AccessEaseLoaded) return null;
  if (document.getElementById('accessease-trigger')) return null;

  const store = createSettingsStore(STORAGE_KEY);
  const announcer = createAnnouncer();
  const ruler = createReadingRuler();

  let settings = store.get();
  let voiceCmd = null;

  // --- Trigger ------------------------------------------------------------
  const trigger = document.createElement('button');
  trigger.id = 'accessease-trigger';
  trigger.type = 'button';
  trigger.className = UI_CLASS;
  trigger.setAttribute('aria-label', 'Open accessibility toolkit');
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', 'accessease-panel');
  trigger.innerHTML = `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <path d="M12 2C13.1 2 14 2.9 14 4C14 5.1 13.1 6 12 6C10.9 6 10 5.1 10 4C10 2.9 10.9 2 12 2ZM21 9H15V22H13V16H11V22H9V9H3V7H21V9Z"/>
    </svg>
  `;

  // --- Panel --------------------------------------------------------------
  const fontSizeLimits = SETTINGS_LIMITS.fontSize;
  const lineHeightLimits = SETTINGS_LIMITS.lineHeight;
  const speechRateLimits = SETTINGS_LIMITS.speechRate;

  const panel = document.createElement('div');
  panel.id = 'accessease-panel';
  panel.className = UI_CLASS;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'accessease-panel-title');
  panel.setAttribute('tabindex', '-1');
  panel.setAttribute('inert', '');
  panel.innerHTML = `
    <div class="ae-panel-header">
      <h2 class="ae-panel-title" id="accessease-panel-title">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
        AccessEase Toolkit
      </h2>
      <button type="button" class="ae-close-btn" aria-label="Close accessibility panel">&times;</button>
    </div>
    <div class="ae-panel-body">
      <p class="ae-sr-only" id="accessease-panel-help">Tool settings are saved in this browser and applied to every page.</p>

      <div>
        <div class="ae-section-title" id="accessease-reading-title">Reading Aids</div>
        <div class="ae-grid-options" role="group" aria-labelledby="accessease-reading-title">
          <button type="button" class="ae-option-card" data-feature="dyslexia" aria-pressed="false">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false"><path d="M4 7V4h16v3M9 20h6M12 4v16"/></svg>
            Dyslexia Font
          </button>
          <button type="button" class="ae-option-card" data-feature="ruler" aria-pressed="false" title="Follows the mouse or the focused element. Use Alt + arrow up/down to move it.">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false"><rect x="2" y="7" width="20" height="10" rx="2"/><path d="M6 11h2M10 11h2M14 11h2M18 11h2"/></svg>
            Reading Ruler
          </button>
          <button type="button" class="ae-option-card" data-feature="tts" aria-pressed="false">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
            Text to Speech
          </button>
          <button type="button" class="ae-option-card" data-feature="voice" aria-pressed="false">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18.5V22"/></svg>
            Voice Command
          </button>
        </div>
      </div>

      <div>
        <div class="ae-section-title" id="accessease-display-title">Visual &amp; Display</div>
        <div class="ae-grid-options" role="group" aria-labelledby="accessease-display-title">
          <button type="button" class="ae-option-card" data-feature="contrast" aria-pressed="false">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            High Contrast
          </button>
          <button type="button" class="ae-option-card" data-feature="darkmode" aria-pressed="false">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            Dark / Light
          </button>
          <button type="button" class="ae-option-card" data-feature="bigcursor" aria-pressed="false">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false"><polygon points="3 3 21 12 12 15 9 21 3 3"/></svg>
            Big Cursor
          </button>
          <button type="button" class="ae-option-card" data-feature="links" aria-pressed="false">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            Highlight Links
          </button>
          <button type="button" class="ae-option-card" data-feature="keyboard" style="grid-column: span 2;" aria-pressed="false">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M6 16h12"/></svg>
            Keyboard Nav Helper
          </button>
        </div>
      </div>

      <div class="ae-control-group">
        <label class="ae-control-label" for="font-size-slider">
          <span>Font Size</span>
          <span id="font-size-val">${settings.fontSize}%</span>
        </label>
        <input type="range" class="ae-slider" id="font-size-slider"
               min="${fontSizeLimits.min}" max="${fontSizeLimits.max}" step="${fontSizeLimits.step}"
               value="${settings.fontSize}" aria-describedby="font-size-val">
      </div>

      <div class="ae-control-group">
        <label class="ae-control-label" for="line-height-slider">
          <span>Line Height</span>
          <span id="line-height-val">${settings.lineHeight}</span>
        </label>
        <input type="range" class="ae-slider" id="line-height-slider"
               min="${lineHeightLimits.min}" max="${lineHeightLimits.max}" step="${lineHeightLimits.step}"
               value="${settings.lineHeight}" aria-describedby="line-height-val">
      </div>

      <div class="ae-control-group">
        <label class="ae-control-label" for="speech-rate-slider">
          <span>Speech Speed</span>
          <span id="speech-rate-val">${settings.speechRate}&times;</span>
        </label>
        <input type="range" class="ae-slider" id="speech-rate-slider"
               min="${speechRateLimits.min}" max="${speechRateLimits.max}" step="${speechRateLimits.step}"
               value="${settings.speechRate}" aria-describedby="speech-rate-val">
      </div>

      <div class="ae-control-group">
        <label class="ae-control-label" for="color-filter-select">
          <span>Color Blindness Simulation</span>
        </label>
        <select id="color-filter-select" class="ae-select" title="Preview how this page appears to users with color vision deficiency">
          <option value="none">Normal Vision</option>
          <option value="protanopia">Protanopia preview (Red-blind)</option>
          <option value="deuteranopia">Deuteranopia preview (Green-blind)</option>
          <option value="tritanopia">Tritanopia preview (Blue-blind)</option>
          <option value="achromatopsia">Achromatopsia preview (Monochrome)</option>
        </select>
      </div>

      <p class="ae-panel-status" id="accessease-panel-status" hidden></p>
    </div>
    <div class="ae-panel-footer">
      <button type="button" class="ae-reset-btn" id="ae-reset-settings">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
        Reset All Settings
      </button>
      <span style="font-size:0.75rem; color:var(--text-muted);">AccessEase v2.0</span>
    </div>
  `;

  document.body.appendChild(trigger);
  document.body.appendChild(panel);

  const els = {
    closeBtn: panel.querySelector('.ae-close-btn'),
    cards: Array.prototype.slice.call(panel.querySelectorAll('.ae-option-card')),
    fontSizeSlider: panel.querySelector('#font-size-slider'),
    fontSizeVal: panel.querySelector('#font-size-val'),
    lineHeightSlider: panel.querySelector('#line-height-slider'),
    lineHeightVal: panel.querySelector('#line-height-val'),
    speechRateSlider: panel.querySelector('#speech-rate-slider'),
    speechRateVal: panel.querySelector('#speech-rate-val'),
    filterSelect: panel.querySelector('#color-filter-select'),
    resetBtn: panel.querySelector('#ae-reset-settings'),
    status: panel.querySelector('#accessease-panel-status')
  };

  const focusTrap = createFocusTrap(panel);
  let lastFocused = null;
  let statusTimer = null;

  /** Inline, screen-reader friendly replacement for alert(). */
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

  const tts = createTextToSpeech({
    getRate: () => settings.speechRate,
    onStateChange: ({ speaking, supported, failing }) => {
      setCardState('tts', speaking);
      if (!supported) setStatus('Text-to-speech is not supported in this browser.', true);
      else if (failing) setStatus('Speech engine failed — try the auto-scroll reader fallback.', true);
      else if (!speaking) setStatus('Stopped reading.');
    },
    onEngineFailure: () => startAutoScroll()
  });

  /**
   * Non-speech fallback for machines without a working synthesis engine (headless
   * browsers, kiosks, Linux setups with no voices installed): scrolls the page slowly so
   * users can still read along hands-free. Stops on any key press, wheel, or touch.
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

  function setCardState(feature, active) {
    const card = panel.querySelector(`[data-feature="${feature}"]`);
    if (!card) return;
    card.classList.toggle('active', Boolean(active));
    card.setAttribute('aria-pressed', String(Boolean(active)));
  }

  // --- Apply state to the document + reflect it in the UI -----------------
  function applySettings(next, options = {}) {
    settings = next;
    applySettingsToDocument(settings, { ruler });
    store.save(settings);
    syncUi();
    if (options.announce) {
      announcer.announce(options.announce);
      setStatus(options.announce);
    }
  }

  function syncUi() {
    setCardState('dyslexia', settings.dyslexia);
    setCardState('ruler', settings.readingRuler);
    setCardState('contrast', settings.highContrast);
    setCardState('darkmode', settings.darkMode);
    setCardState('bigcursor', settings.bigCursor);
    setCardState('links', settings.highlightLinks);
    setCardState('keyboard', settings.keyboardNav);
    setCardState('tts', tts.isSpeaking);
    setCardState('voice', Boolean(voiceCmd && voiceCmd.isListening));

    els.fontSizeSlider.value = settings.fontSize;
    els.fontSizeVal.textContent = `${settings.fontSize}%`;
    els.lineHeightSlider.value = settings.lineHeight;
    els.lineHeightVal.textContent = settings.lineHeight;
    els.speechRateSlider.value = settings.speechRate;
    els.speechRateVal.textContent = `${settings.speechRate}\u00d7`;
    els.filterSelect.value = settings.colorFilter || 'none';
  }

  // --- Open / close -------------------------------------------------------
  function openPanel() {
    if (panel.classList.contains('open')) return;
    lastFocused = document.activeElement;
    panel.classList.add('open');
    panel.removeAttribute('inert');
    trigger.setAttribute('aria-expanded', 'true');
    focusTrap.activate();
    const target = panel.querySelector('.ae-close-btn');
    if (target) target.focus();
  }

  function closePanel() {
    if (!panel.classList.contains('open')) return;
    panel.classList.remove('open');
    panel.setAttribute('inert', '');
    trigger.setAttribute('aria-expanded', 'false');
    focusTrap.deactivate();
    restoreFocus();
    lastFocused = null;
  }

  /**
   * Send focus back where it came from.
   *
   * Clicking a button does not focus it in every browser (Safari on macOS), and a click on
   * empty space leaves <body> focused — in both cases falling back to the trigger keeps
   * keyboard users from being dumped at the top of the document.
   */
  function restoreFocus() {
    const candidate = lastFocused;
    const usable =
      candidate &&
      candidate !== document.body &&
      candidate !== document.documentElement &&
      typeof candidate.focus === 'function' &&
      document.contains(candidate);
    if (usable) candidate.focus();
    else trigger.focus();
  }

  trigger.addEventListener('click', () => {
    if (panel.classList.contains('open')) closePanel();
    else openPanel();
  });
  els.closeBtn.addEventListener('click', closePanel);

  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      closePanel();
    }
  });

  // --- Voice commands -----------------------------------------------------
  voiceCmd = createVoiceCommands({
    lang: document.documentElement.lang || 'en-US',
    onStateChange: ({ listening, supported, reason }) => {
      setCardState('voice', listening);
      if (!supported) setStatus('Voice commands are not supported in this browser.', true);
      else if (reason === 'denied') setStatus('Microphone permission was denied.', true);
      else if (reason === 'error') setStatus('Voice commands stopped. Try again.', true);
      else setStatus(listening ? 'Listening for voice commands.' : 'Voice commands stopped.');
    },
    onCommand: handleVoiceCommand
  });

  function handleVoiceCommand(command) {
    const next = Object.assign({}, settings);
    let message = '';

    if (command.includes('open panel')) {
      openPanel();
      return;
    }
    if (command.includes('close panel')) {
      closePanel();
      return;
    }
    if (command.includes('stop reading') || command.includes('stop talking')) {
      tts.stop();
      return;
    }
    if (command.includes('read page') || command.includes('read this page')) {
      tts.speak(pageText());
      return;
    }
    if (command.includes('reset')) {
      resetSettings();
      return;
    }

    if (command.includes('dyslexia')) {
      next.dyslexia = !next.dyslexia;
      message = next.dyslexia ? 'Dyslexia friendly font on.' : 'Dyslexia friendly font off.';
    } else if (command.includes('dark mode')) {
      next.darkMode = true;
      message = 'Dark mode on.';
    } else if (command.includes('light mode')) {
      next.darkMode = false;
      message = 'Light mode on.';
    } else if (command.includes('high contrast') || command.includes('contrast')) {
      next.highContrast = !next.highContrast;
      message = next.highContrast ? 'High contrast on.' : 'High contrast off.';
    } else if (command.includes('bigger text') || command.includes('increase text')) {
      next.fontSize = Math.min(fontSizeLimits.max, next.fontSize + fontSizeLimits.step);
      message = `Text size ${next.fontSize} percent.`;
    } else if (command.includes('smaller text') || command.includes('decrease text')) {
      next.fontSize = Math.max(fontSizeLimits.min, next.fontSize - fontSizeLimits.step);
      message = `Text size ${next.fontSize} percent.`;
    } else if (command.includes('highlight links')) {
      next.highlightLinks = !next.highlightLinks;
      message = next.highlightLinks ? 'Links highlighted.' : 'Link highlighting off.';
    } else {
      setStatus(`Didn't recognise "${command}".`);
      return;
    }

    applySettings(next, { announce: message });
  }

  // --- Reset --------------------------------------------------------------
  function resetSettings() {
    tts.stop();
    if (voiceCmd) voiceCmd.stop();
    ruler.toggle(false);
    stopAutoScroll();
    // Order matters: clearing storage first, then applying the defaults, otherwise the
    // old settings would be written straight back to localStorage.
    const fresh = store.reset();
    applySettings(fresh, { announce: 'All accessibility settings reset.' });
  }

  els.resetBtn.addEventListener('click', resetSettings);

  // --- Feature cards ------------------------------------------------------
  const featureToggles = {
    dyslexia: ['dyslexia', 'Dyslexia friendly font'],
    contrast: ['highContrast', 'High contrast'],
    darkmode: ['darkMode', 'Dark mode'],
    bigcursor: ['bigCursor', 'Big cursor'],
    links: ['highlightLinks', 'Link highlighting'],
    keyboard: ['keyboardNav', 'Keyboard navigation helper']
  };

  els.cards.forEach((card) => {
    const feature = card.getAttribute('data-feature');
    card.addEventListener('click', () => {
      if (feature === 'tts') {
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
      if (feature === 'voice') {
        voiceCmd.toggle();
        return;
      }
      if (feature === 'ruler') {
        const next = Object.assign({}, settings, { readingRuler: !settings.readingRuler });
        applySettings(next, {
          announce: next.readingRuler ? 'Reading ruler on.' : 'Reading ruler off.'
        });
        return;
      }
      const toggle = featureToggles[feature];
      if (!toggle) return;
      const [key, label] = toggle;
      const next = Object.assign({}, settings);
      next[key] = !next[key];
      applySettings(next, { announce: `${label} ${next[key] ? 'on' : 'off'}.` });
    });
  });

  // --- Sliders and select -------------------------------------------------
  els.fontSizeSlider.addEventListener('input', (event) => {
    const value = parseInt(event.target.value, 10);
    els.fontSizeVal.textContent = `${value}%`;
    applySettings(Object.assign({}, settings, { fontSize: value }));
  });
  els.fontSizeSlider.addEventListener('change', () => {
    announcer.announce(`Font size ${settings.fontSize} percent.`);
  });

  els.lineHeightSlider.addEventListener('input', (event) => {
    const value = parseFloat(event.target.value);
    els.lineHeightVal.textContent = String(value);
    applySettings(Object.assign({}, settings, { lineHeight: value }));
  });
  els.lineHeightSlider.addEventListener('change', () => {
    announcer.announce(`Line height ${settings.lineHeight}.`);
  });

  els.speechRateSlider.addEventListener('input', (event) => {
    const value = parseFloat(event.target.value);
    els.speechRateVal.textContent = `${value}\u00d7`;
    applySettings(Object.assign({}, settings, { speechRate: value }));
  });
  els.speechRateSlider.addEventListener('change', () => {
    announcer.announce(`Speech speed ${settings.speechRate} times.`);
  });

  els.filterSelect.addEventListener('change', (event) => {
    const value = event.target.value;
    applySettings(Object.assign({}, settings, { colorFilter: value }), {
      announce: describeColorFilter(value)
    });
  });

  // --- Keyboard nudge for the reading ruler -------------------------------
  document.addEventListener('keydown', (event) => {
    if (!settings.readingRuler || !event.altKey) return;
    if (event.key === 'ArrowUp') ruler.nudge(-1);
    else if (event.key === 'ArrowDown') ruler.nudge(1);
    else return;
    event.preventDefault();
  });

  applySettings(settings);

  return { panel, trigger, open: openPanel, close: closePanel, settings: () => settings };
}
