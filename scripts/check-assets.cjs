#!/usr/bin/env node
/**
 * Guards against the class of bug this project shipped for a while: a referenced asset that
 * is missing, or worse, a placeholder text file sitting where a font or image belongs.
 *
 *   node scripts/check-assets.cjs
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const SKIP_PREFIXES = ['http://', 'https://', '//', 'data:', '#', 'mailto:', 'tel:'];

function htmlFiles() {
  return fs.readdirSync(root).filter((name) => name.endsWith('.html'));
}

function cssFiles(dir = path.join(root, 'css'), found = []) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) cssFiles(full, found);
    else if (entry.name.endsWith('.css')) found.push(full);
  });
  return found;
}

function isLocalReference(reference) {
  return reference && !SKIP_PREFIXES.some((prefix) => reference.startsWith(prefix));
}

const problems = [];
const checked = new Set();

function checkReference(fromFile, reference) {
  const target = reference.split('?')[0].split('#')[0];
  if (!isLocalReference(target)) return;

  const resolved = path.resolve(path.dirname(fromFile), target);
  const relative = path.relative(root, resolved);
  checked.add(relative);

  if (!fs.existsSync(resolved)) {
    problems.push(`${path.relative(root, fromFile)} references missing file: ${target}`);
  }
}

/**
 * References only count when they are real markup. Code samples are escaped HTML, and
 * inline scripts contain JS strings that look like tags but are never fetched.
 */
function stripNonMarkup(source) {
  return source
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi, '$1$3')
    .replace(/&lt;[\s\S]{0,600}?&gt;/g, ' ');
}

/**
 * Inline data: URIs are self-contained (nothing on disk to resolve), and they can embed
 * inner `url(%23id)` references (SVG filters) that would otherwise be mistaken for files.
 * Match everything up to the closing parenthesis — the payload may contain quotes.
 */
function stripDataUris(source) {
  return source.replace(/url\(\s*["']?data:[^)]*\)/gi, ' ');
}

htmlFiles().forEach((name) => {
  const file = path.join(root, name);
  const source = stripDataUris(stripNonMarkup(fs.readFileSync(file, 'utf8')));
  const attribute = /(?:src|href)\s*=\s*["']([^"']+)["']/g;
  let match;
  while ((match = attribute.exec(source))) checkReference(file, match[1]);
});

cssFiles().forEach((file) => {
  const source = stripDataUris(fs.readFileSync(file, 'utf8'));
  const url = /url\(\s*["']?([^"')]+)["']?\s*\)/g;
  let match;
  while ((match = url.exec(source))) checkReference(file, match[1]);
});

// A font or image that is really a text file means the feature silently does nothing.
const BINARY_EXPECTATIONS = [
  { pattern: /\.woff2?$/, label: 'Web font', validate: (buffer) => buffer.subarray(0, 4).toString('latin1') === 'wOF2' || buffer.subarray(0, 4).toString('latin1') === 'wOFF' },
  { pattern: /\.(png|jpe?g|gif|webp|ico)$/, label: 'Image', validate: (buffer) => !/^\s*(<!doctype|<svg|#|\/\*|[A-Za-z ]*placeholder)/i.test(buffer.subarray(0, 64).toString('latin1')) },
  { pattern: /\.pdf$/, label: 'PDF', validate: (buffer) => buffer.subarray(0, 4).toString('latin1') === '%PDF' }
];

checked.forEach((relative) => {
  const expectation = BINARY_EXPECTATIONS.find((entry) => entry.pattern.test(relative));
  if (!expectation) return;
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) return;

  const buffer = fs.readFileSync(file);
  if (!expectation.validate(buffer)) {
    problems.push(`${relative} is not a real ${expectation.label} — it looks like a placeholder text file`);
  } else {
    console.log(`  ok  ${relative} (${(buffer.length / 1024).toFixed(1)} kb)`);
  }
});

if (problems.length) {
  console.error('\nAsset problems found:');
  problems.forEach((problem) => console.error(`  - ${problem}`));
  process.exit(1);
}

console.log(`\nAll ${checked.size} referenced assets resolve.`);
