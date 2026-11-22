# ghostsay 👻

[![npm](https://img.shields.io/npm/v/ghostsay)](https://www.npmjs.com/package/ghostsay) [![CI](https://github.com/thebunnyweb/ghostsay/actions/workflows/ci.yml/badge.svg)](https://github.com/thebunnyweb/ghostsay/actions/workflows/ci.yml)

Like `cowsay`, but your message gets a **very serious** animated performance in the terminal.

```bash
npx ghostsay "ship it on friday"
npx ghostsay "the build is green" --party
npx ghostsay "prod is down" --fire
npx ghostsay "take me to your leader" --ufo
npx ghostsay "follow the white rabbit" --matrix
npx ghostsay "greetings from the golden gate" --sanfran
npx ghostsay --beach --no-text          # just the scene, no message
echo "piped messages work too" | npx ghostsay --random
```

## Presets

| flag        | what happens                                                       |
|-------------|--------------------------------------------------------------------|
| `--ghost`   | a big 3D ghost floats up and says it in a speech bubble (default)  |
| `--matrix`  | digital rain; a 3D key made of code decrypts your message          |
| `--fire`    | a 3D campfire at night, your message in burning letters            |
| `--party`   | a spinning mirror ball says it; confetti, fireworks, light floor   |
| `--ufo`     | a flying saucer beams your message down, then takes it back        |
| `--random`  | surprise me                                                        |

### Places

Painted scenes that keep living while your message is on screen.

| flag          | what happens                                                                  |
|---------------|-------------------------------------------------------------------------------|
| `--city`      | night skyline, windows flicking on and off, streetlamps, traffic; a neon sign |
| `--garden`    | sunny hills, a picket fence, flowers nodding in the breeze, butterflies       |
| `--beach`     | sunset, glittering sea, waves washing the sand, a palm; a plane tows a banner |
| `--mountains` | sunrise over snow-capped ranges, mist drifting through the valleys            |
| `--snow`      | northern lights, falling snow, frosted pines, a cabin with smoke curling up   |
| `--dubai`     | golden hour: Burj Khalifa, the sail hotel, heat haze, a camel caravan         |
| `--newyork`   | Empire State (lit crown), Chrysler, One WTC, Liberty, a ferry on the river    |
| `--mumbai`    | Marine Drive's Queen's Necklace, the Sea Link, monsoon drizzle, taxis         |
| `--bengaluru` | rain trees, glass tech parks, a golden Vidhana Soudha, honking traffic        |
| `--brazil`    | Rio: Sugarloaf + cable car, Christ the Redeemer, Copacabana's wavy promenade  |
| `--sanfran`   | the Golden Gate in International Orange, fog rolling in, sailboats            |

Aliases work too: `--beaches`, `--nyc`, `--new-york`, `--bombay`, `--bangalore`, `--rio`, `--sf`, `--san-fran`, `--winter`…

Every preset plays as a loop: an intro, the message, a few tricks while it holds (Boo spins,
looks around, waves and hops; the saucer does a barrel roll), then it all reverses — the text
un-types, burns away, re-encrypts or gets beamed back up, the star of the show exits — and the
performance starts again. Use `--once` to play it a single time and leave the result in your
scrollback.

## Options

```
-p, --preset <name>   same as --<name>
-n, --no-text         just the animation, no message
    --once            play once and exit (default: loops until ctrl+c)
-s, --speed <n>       playback speed multiplier
    --still           skip the animation, just print the result
    --no-color        plain text (NO_COLOR is respected too)
```

The animation loops until you press ctrl+c. When you exit, the final frame stays in your scrollback, just like cowsay. If output isn't a TTY (pipes, CI), it prints the final frame only.

No dependencies. Works on Node 14 and up. In truecolor terminals scenes get painted backdrops, glows and filled speech bubbles; 256-colour terminals get filled bubbles; `--no-color` falls back to classic outlines.

## Adding a preset

Each preset (registered in `lib/presets.js`, one file per preset in `lib/`) is a factory `(ctx) => ({ duration, frame(canvas, t, final) })`.
Draw onto the canvas at time `t` (in seconds). When `final` is true, draw the clean still frame that gets left in the scrollback.

For 3D, `lib/render3d.js` sphere-traces a signed-distance function per terminal cell: give it `sdf(x, y, z)` and a `material(...)` returning brightness and colour, and it handles normals, ambient occlusion and anti-aliased silhouettes.

Places are built on `lib/scene.js` (one file per place in `lib/scenes/`): `makeScene({ horizon, draw(e), message: { style } })` where style is `card`, `neon` or `banner`, plus helpers for sky gradients, sun/moon, clouds, water, skylines, landmarks, haze, weather, birds and traffic.

`lib/ui.js` has the shared polish pieces: filled speech bubbles with a tail pointing at the speaker (drawn at 2x2 sub-cell resolution with quadrant blocks), background gradients and glows, and natural typing cadence.

## Contributing

Bug reports, ideas and new places are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md). Releases go out through [Changesets](https://github.com/changesets/changesets) and GitHub Actions, with npm provenance.

## License

[MIT](LICENSE) © Harsh Shah
