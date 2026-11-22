#!/usr/bin/env node
'use strict';
const { Canvas } = require('../lib/canvas');
const { PRESETS, resolve } = require('../lib/presets');
const pkg = require('../package.json');

const HELP = `
  ghostsay — say things. seriously.

  usage
    npx ghostsay "your message" [--preset] [options]
    echo "hi" | npx ghostsay --matrix
    npx ghostsay --beach --no-text

  presets
${Object.entries(PRESETS).map(([k, v]) => `    --${k.padEnd(10)} ${v.desc}`).join('\n')}
    --random     surprise me

  options
    -p, --preset <name>   same as --<name>
    -n, --no-text         just the scene, no message
        --once            play once and exit (default: loop until ctrl+c)
    -s, --speed <n>       playback speed multiplier (default 1)
        --still           skip the animation, just print the result
        --no-color        plain text
    -h, --help / -v, --version

  press ctrl+c to exit.
`;

function parseArgs(argv) {
  const o = { preset: 'ghost', loop: true, speed: 1, still: false, color: true, noText: false, words: [] };
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i], val = null;
    if (a.startsWith('--') && a.includes('=')) [a, val] = [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)];
    const next = () => (val != null ? val : argv[++i]);
    if (a === '--') { o.words.push(...argv.slice(i + 1)); break; }
    else if (a === '-h' || a === '--help') o.help = true;
    else if (a === '-v' || a === '--version') o.version = true;
    else if (a === '-p' || a === '--preset') { const v = String(next() || ''); o.preset = resolve(v) || v.toLowerCase(); }
    else if (a === '-n' || a === '--no-text' || a === '--notext') o.noText = true;
    else if (a === '-l' || a === '--loop') o.loop = true;
    else if (a === '--once') o.loop = false;
    else if (a === '-s' || a === '--speed') o.speed = Math.max(0.1, parseFloat(next()) || 1);
    else if (a === '--still') o.still = true;
    else if (a === '--no-color') o.color = false;
    else if (a === '--random' || a === '-r') o.preset = Object.keys(PRESETS)[(Math.random() * Object.keys(PRESETS).length) | 0];
    else if (a === '--list') o.list = true;
    else if (a.startsWith('--') && resolve(a.slice(2))) o.preset = resolve(a.slice(2));
    else if (a.startsWith('-') && a.length > 1) o.unknown = a;
    else o.words.push(a);
  }
  return o;
}

function colorMode(enabled) {
  const env = process.env;
  if (!enabled || 'NO_COLOR' in env || env.TERM === 'dumb') return 'none';
  if (/^(truecolor|24bit)$/i.test(env.COLORTERM || '')) return 'truecolor';
  if (/^(iTerm\.app|WezTerm|ghostty|vscode|Hyper|Tabby)$/i.test(env.TERM_PROGRAM || '')) return 'truecolor';
  if (env.WT_SESSION || /kitty|ghostty|alacritty/i.test(env.TERM || '')) return 'truecolor';
  return '256';
}

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (d) => (data += d));
    process.stdin.on('end', () => resolve(data.trim()));
  });
}

function printFinal(preset, ctx, mode) {
  const cols = process.stdout.columns || 80;
  const cv = new Canvas(Math.max(20, cols - 3), 200);
  const p = preset.create(ctx);
  p.frame(cv, p.duration, true);
  const lines = cv.render(mode, true);
  process.stdout.write('\n' + lines.map((l) => (l.trim() ? '  ' + l : '')).join('\n') + '\n\n');
}

function animate(preset, ctx, opts, mode) {
  return new Promise((resolve) => {
    const out = process.stdout, stdin = process.stdin;
    const p = preset.create(ctx);
    const start = Date.now();
    let done = false, raw = false, prev = null;
    const restore = () => out.write('\x1b[?2026l\x1b[0m\x1b[?25h\x1b[?1049l');

    const finish = () => {
      if (done) return;
      done = true;
      clearInterval(timer);
      if (raw) { stdin.setRawMode(false); stdin.removeListener('data', onKey); stdin.pause(); }
      process.removeListener('SIGINT', finish);
      process.removeListener('SIGTERM', finish);
      restore();
      printFinal(preset, ctx, mode);
      resolve();
    };
    // raw mode swallows ctrl+c as a byte, so handle it ourselves (q / esc also work)
    const onKey = (buf) => { const k = buf.toString(); if (k === '\x03' || k === 'q' || k === '\x1b') finish(); };
    const tick = () => {
      if (done) return;
      const t = ((Date.now() - start) / 1000) * opts.speed;
      if (!opts.loop && t >= p.duration) return finish();
      const cv = new Canvas(Math.max(10, (out.columns || 80) - 1), Math.max(6, out.rows || 24));
      p.frame(cv, t, false);
      if (opts.loop && cv.w > 30) cv.text(cv.w - 17, cv.h - 1, 'ctrl+c to exit', [70, 75, 100]);
      const frame = cv.diff(prev, mode);
      prev = cv;
      if (frame) out.write('\x1b[?2026h' + frame + '\x1b[?2026l');
    };

    out.write('\x1b[?1049h\x1b[?25l\x1b[2J');
    process.on('exit', () => { if (!done) restore(); });
    process.on('SIGINT', finish);
    process.on('SIGTERM', finish);
    if (stdin.isTTY) { stdin.setRawMode(true); raw = true; stdin.resume(); stdin.on('data', onKey); }
    out.on('resize', () => { prev = null; });
    const timer = setInterval(tick, 1000 / 60);
    tick();
  });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.version) return console.log(pkg.version);
  if (opts.help) return console.log(HELP);
  if (opts.list) return console.log(Object.entries(PRESETS).map(([k, v]) => `  ${k.padEnd(10)} ${v.desc}`).join('\n'));
  if (opts.unknown) { console.error(`ghostsay: unknown option ${opts.unknown}\n${HELP}`); process.exit(1); }
  const preset = PRESETS[opts.preset];
  if (!preset) { console.error(`ghostsay: no preset "${opts.preset}". try: ${Object.keys(PRESETS).join(', ')}`); process.exit(1); }

  let message = '';
  if (!opts.noText) {
    message = opts.words.join(' ').trim();
    if (!message && !process.stdin.isTTY) message = await readStdin();
    if (!message) message = 'boo!';
  }

  const mode = colorMode(opts.color && (process.stdout.isTTY || 'FORCE_COLOR' in process.env));
  const ctx = { message, noText: opts.noText, rich: mode !== 'none', truecolor: mode === 'truecolor' };
  if (opts.still || !process.stdout.isTTY) printFinal(preset, ctx, mode);
  else await animate(preset, ctx, opts, mode);
  process.exit(0);
}

main();
