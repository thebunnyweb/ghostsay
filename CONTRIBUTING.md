# Contributing to ghostsay

Thanks for helping! ghostsay is a single zero-dependency Node package:

```
bin/cli.js        argument parsing, terminal setup, the render loop
lib/canvas.js     the cell canvas: colours, quadrant blocks, diff rendering
lib/presets.js    the list of presets and their aliases
lib/*.js          the original presets (ghost, matrix, fire, party, ufo)
lib/scene.js      the engine behind the place presets (sky, water, skylines, traffic, messages)
lib/scenes/*.js   one file per place
test/smoke.js     renders every preset and drives the CLI
```

## Setup

```bash
npm install            # dev tooling only (changesets)
node bin/cli.js "hi" --sanfran
```

## Checks

```bash
npm test
```

It renders every frame of every preset, with and without text, in truecolor, 256-colour and
plain modes at several terminal sizes, then runs the CLI. It needs no dependencies and runs on
Node 14+, which is what CI tests against.

## Adding a place

1. Add `lib/scenes/<name>.js` built on `S.makeScene({ horizon, draw(e), message })` from `lib/scene.js`.
2. Register it in `lib/presets.js` (and any aliases people might type).
3. Add it to the Places table in the README.
4. `npm test`, then watch it in a real terminal.

## Changesets

Any user-facing change needs a changeset:

```bash
npx changeset
```

### How a release happens

1. Merge PRs with changesets into `main`.
2. The Release workflow opens (or updates) a **chore: version packages** PR that bumps
   `package.json` and writes `CHANGELOG.md`.
3. Merging that PR publishes to npm (with provenance), tags `vX.Y.Z` and creates a GitHub Release.

Publishing uses npm trusted publishing: npmjs.com → ghostsay → Settings → Trusted Publisher is set
to GitHub Actions, `thebunnyweb/ghostsay`, workflow `release.yml`. There is no npm token anywhere.

## Guidelines

- No runtime dependencies.
- Keep Node 14 working: no syntax or APIs newer than Node 14 in `bin/` and `lib/`.
- Every frame should render in a few milliseconds at 120×36.
- Scenes must look right in truecolor, 256-colour and `--no-color`.
