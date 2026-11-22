#!/usr/bin/env node
'use strict';
// Zero-dependency checks that run on every Node version ghostsay supports (14+).
//   1. every preset renders every frame, with and without text, in all colour modes and sizes
//   2. the CLI works end to end: --still, --no-text, aliases, piped input, --help, --version
const path = require('path');
const { execFileSync } = require('child_process');
const { Canvas } = require('../lib/canvas');
const { PRESETS, ALIASES, resolve } = require('../lib/presets');

const CLI = path.join(__dirname, '..', 'bin', 'cli.js');
const MODES = ['truecolor', '256', 'none'];
const SIZES = [[40, 12], [80, 24], [140, 40]];
let failures = 0, checks = 0;

function check(label, fn) {
  checks++;
  try { fn(); } catch (err) { failures++; console.log('FAIL ' + label + '\n  ' + String(err && err.stack || err).split('\n').slice(0, 4).join('\n  ')); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

// 1. render every frame of every preset
for (const name of Object.keys(PRESETS)) {
  for (const noText of [false, true]) {
    for (const mode of MODES) {
      check(`${name} ${noText ? 'no-text' : 'text'} ${mode}`, () => {
        const ctx = { message: noText ? '' : 'a fairly long message to see how the wrapping goes, ok?', noText, rich: mode !== 'none', truecolor: mode === 'truecolor' };
        const inst = PRESETS[name].create(ctx);
        assert(inst.duration > 0, 'duration should be > 0');
        const end = (inst.timeline && inst.timeline.period) || inst.duration;
        for (const [W, H] of SIZES) {
          let prev = null;
          for (let t = 0; t < end * 1.05; t += 1 / 6) {
            const cv = new Canvas(W, H);
            inst.frame(cv, t, false);
            cv.diff(prev, mode);
            prev = cv;
            for (const b of cv.bg) if (b) assert(b.every((v) => v >= 0 && v <= 255.5), `bad background colour ${b} at t=${t.toFixed(2)} ${W}x${H}`);
          }
          const still = new Canvas(Math.max(20, W - 3), 200);
          inst.frame(still, inst.duration, true);
          assert(still.render(mode, true).length > 0, 'still frame is empty');
        }
      });
    }
  }
}

// 2. the CLI
const cli = (args, input) => execFileSync(process.execPath, [CLI].concat(args), { input: input || '', encoding: 'utf8', timeout: 30000, env: Object.assign({}, process.env, { NO_COLOR: '' }) });

check('--version', () => assert(cli(['--version']).trim() === require('../package.json').version, 'version mismatch'));
check('--help lists every preset', () => { const out = cli(['--help']); for (const k of Object.keys(PRESETS)) assert(out.includes('--' + k), 'help is missing --' + k); });
for (const name of Object.keys(PRESETS)) {
  check(`cli --${name} --still`, () => assert(cli(['hello there', '--' + name, '--still', '--no-color']).trim().length > 0, 'no output'));
  check(`cli --${name} --no-text --still`, () => assert(cli(['--' + name, '--no-text', '--still', '--no-color']).trim().length > 0, 'no output'));
}
check('aliases resolve', () => {
  for (const [alias, target] of Object.entries(ALIASES)) assert(resolve(alias) === target, alias + ' -> ' + resolve(alias));
  assert(resolve('New-York') === 'newyork' && resolve('san_fran') === 'sanfran', 'separators should be ignored');
});
check('cli alias flags', () => { for (const a of ['--sf', '--nyc', '--new-york', '--rio']) assert(cli(['hi', a, '--still', '--no-color']).trim().length > 0, a); });
check('cli -p bangalore', () => assert(cli(['hi', '-p', 'bangalore', '--still', '--no-color']).trim().length > 0, 'no output'));
check('piped message', () => assert(cli(['--still', '--no-color'], 'piped hello\n').includes('piped'), 'piped text not shown'));

console.log(failures ? `\n${failures} of ${checks} checks failed` : `all ${checks} checks passed (node ${process.version})`);
process.exit(failures ? 1 : 0);
