// Interactive terminal animation for landing page hero
import { prefersReducedMotion } from './typingEffect.js';

const LOGS = [
  { text: '$ npx accessease --init', type: 'cmd', delay: 0 },
  { text: '[INFO] Verifying browser environment and CSP...', type: 'info', delay: 400 },
  { text: '[OK] Loaded OpenDyslexic-Regular.woff2 (101kb)', type: 'success', delay: 900 },
  { text: '[INFO] Initializing Web Speech Synthesis API...', type: 'info', delay: 1400 },
  { text: '[OK] Speech synthesizer ready for streaming', type: 'success', delay: 1900 },
  { text: '[INFO] Calibrating SVG color matrix filters...', type: 'info', delay: 2400 },
  { text: '[OK] Protanopia, Deuteranopia, Tritanopia filters cached', type: 'success', delay: 2900 },
  { text: '[SUCCESS] AccessEase Widget mounted (60 FPS)', type: 'highlight', delay: 3500 }
];

const COLOR_BY_TYPE = {
  cmd: 'var(--accent-cyan)',
  success: 'var(--accent-teal)',
  highlight: '#ffbd2e',
  info: 'var(--text-secondary)'
};

// Timers from a previous run must be cleared, otherwise "Re-run Log" races with the
// previous animation and prints every line twice.
let pendingTimers = [];

function buildLine(log, animate) {
  const line = document.createElement('div');
  line.style.color = COLOR_BY_TYPE[log.type] || COLOR_BY_TYPE.info;
  line.textContent = log.text;
  if (animate) {
    line.style.opacity = '0';
    line.style.transform = 'translateY(5px)';
    line.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
  }
  return line;
}

export function initTerminalAnimation() {
  const terminalBody = document.getElementById('hero-terminal-body');
  if (!terminalBody) return;

  pendingTimers.forEach(clearTimeout);
  pendingTimers = [];

  let logContainer = terminalBody.querySelector('.terminal-logs');
  if (!logContainer) {
    logContainer = document.createElement('div');
    logContainer.className = 'terminal-logs';
    logContainer.style.cssText =
      'font-family: var(--font-mono); font-size: 0.85rem; line-height: 1.6; margin-bottom: 1.5rem; background: var(--bg-secondary); padding: 1rem; border-radius: 8px; border: 1px solid var(--border-color); max-height: 160px; overflow-y: auto;';
    terminalBody.prepend(logContainer);
  }

  logContainer.innerHTML = '';

  const animate = !prefersReducedMotion();

  LOGS.forEach((log) => {
    const append = () => {
      const line = buildLine(log, animate);
      logContainer.appendChild(line);
      logContainer.scrollTop = logContainer.scrollHeight;
      if (animate) {
        requestAnimationFrame(() => {
          line.style.opacity = '1';
          line.style.transform = 'translateY(0)';
        });
      }
    };

    if (!animate || log.delay === 0) {
      append();
      return;
    }
    pendingTimers.push(setTimeout(append, log.delay));
  });
}
