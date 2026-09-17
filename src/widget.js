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
export function createAccessEaseWidget(api) {
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
