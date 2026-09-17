#!/usr/bin/env node
/**
 * Dependency-free syntax check for every JavaScript file in the project.
 *
 * ES modules are parsed by writing the source to a temporary .mjs file, because
 * `node --check` refuses `import`/`export` in a .js file when package.json has no
 * `"type": "module"`. The temp files live under node_modules/.cache and are always removed.
 *
 *   npm run check
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '.git', '.vscode', 'fonts', 'assets', 'css']);

function collect(dir, found = []) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    if (entry.name.startsWith('.')) return;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) collect(full, found);
      return;
    }
    if (entry.name.endsWith('.js')) found.push(full);
  });
  return found;
}

const files = collect(root).sort();
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'accessease-check-'));
let failures = 0;

files.forEach((file) => {
  const relative = path.relative(root, file);
  const isModule = /^\s*(import|export)\s/m.test(fs.readFileSync(file, 'utf8'));
  const target = path.join(tmpDir, `${relative.replace(/[\\/]/g, '__')}${isModule ? '.mjs' : '.cjs'}`);
  fs.copyFileSync(file, target);
  try {
    execFileSync(process.execPath, ['--check', target], { stdio: 'pipe' });
    console.log(`  ok  ${relative}${isModule ? ' (module)' : ''}`);
  } catch (error) {
    failures += 1;
    console.error(` FAIL ${relative}\n${error.stderr ? error.stderr.toString() : error.message}`);
  }
});

fs.rmSync(tmpDir, { recursive: true, force: true });

if (failures) {
  console.error(`\n${failures} file(s) failed to parse.`);
  process.exit(1);
}
console.log(`\nAll ${files.length} JavaScript files parsed successfully.`);
