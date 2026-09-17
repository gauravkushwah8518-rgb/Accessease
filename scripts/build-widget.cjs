#!/usr/bin/env node
/**
 * Bundles js/core.js + src/widget.js into the single-file embeddable widget
 * (widget-build/accessease.js).
 *
 * Why a build step at all: the marketing site loads ES modules, but an embeddable widget has
 * to be one plain <script> that works on any site. Both surfaces must share one copy of the
 * accessibility logic, so the widget is generated from the same core the panel uses instead
 * of being maintained by hand next to it.
 *
 *   npm run build:widget
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const CORE = path.join(root, 'js', 'core.js');
const WIDGET = path.join(root, 'src', 'widget.js');
// `--out <path>` lets the test suite build to a scratch file and diff it against the
// committed bundle to prove the checked-in widget is not stale.
const outIndex = process.argv.indexOf('--out');
const OUTPUT = outIndex >= 0 && process.argv[outIndex + 1]
  ? path.resolve(process.cwd(), process.argv[outIndex + 1])
  : path.join(root, 'widget-build', 'accessease.js');

/** Remove import statements and the `export` keyword, leaving plain top-level declarations. */
function stripModuleSyntax(source) {
  return source
    .replace(/^import\s+[^;]*?from\s*['"][^'"]+['"]\s*;?[ \t]*$/gm, '')
    .replace(/^import\s*['"][^'"]+['"]\s*;?[ \t]*$/gm, '')
    .replace(/^export\s+default\s+/gm, '')
    .replace(/^export\s+(?=(const|let|var|function|class)\b)/gm, '');
}

/** Collect the names core.js exports so they can be handed to the widget shell. */
function exportedNames(source) {
  const names = [];
  const declaration = /^export\s+(?:const|let|var|function|class)\s+([A-Za-z0-9_$]+)/gm;
  let match;
  while ((match = declaration.exec(source))) names.push(match[1]);

  const braceExport = /^export\s*\{([^}]*)\}/gm;
  while ((match = braceExport.exec(source))) {
    match[1].split(',').forEach((entry) => {
      const name = entry.trim().split(/\s+as\s+/)[0].trim();
      if (name) names.push(name);
    });
  }
  return names;
}

/** Fail loudly rather than shipping a bundle that silently misses a function. */
function assertBundleIsComplete(bundle, names) {
  const required = ['createAccessEaseWidget', 'createSettingsStore', 'applySettings', 'createTextToSpeech', 'createVoiceCommands'];
  const missing = required.filter((name) => !names.includes(name) && !bundle.includes(`function ${name}`));
  if (missing.length) {
    throw new Error(`Bundle is missing: ${missing.join(', ')}`);
  }
}

function build() {
  const coreSource = fs.readFileSync(CORE, 'utf8');
  const widgetSource = fs.readFileSync(WIDGET, 'utf8');
  const names = exportedNames(coreSource);

  if (!names.length) throw new Error('No exports found in js/core.js — did the module syntax change?');

  const apiEntries = names.map((name) => `    ${name},`).join('\n');

  const bundle = `/**
 * AccessEase Embeddable Widget — generated file, do not edit by hand.
 * Source: js/core.js + src/widget.js — rebuild with \`npm run build:widget\`.
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
${stripModuleSyntax(coreSource)}

  // ---------------------------------------------------------------------------
  // Widget shell (src/widget.js)
  // ---------------------------------------------------------------------------
${stripModuleSyntax(widgetSource)}

  window.AccessEase = createAccessEaseWidget({
${apiEntries}
  }) || {};
})();
`;

  assertBundleIsComplete(bundle, names);
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, bundle, 'utf8');

  const sizeKb = (Buffer.byteLength(bundle, 'utf8') / 1024).toFixed(1);
  console.log(`Built ${path.relative(root, OUTPUT)} (${sizeKb} kb) from js/core.js + src/widget.js`);
}

build();
