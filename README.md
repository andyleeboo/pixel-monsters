# pixel monsters

Deterministic pixel monsters: a 64-bit seed goes in, a monster comes out — always the same one for the same seed, on every platform that implements the generator. This repo renders a parade of them as a single self-contained animated SVG, and re-rolls the seeds on a schedule so the cast is different every time you look.

<img alt="a parade of animated pixel monsters" src="https://raw.githubusercontent.com/andyleeboo/pixel-monsters/output/monsters.svg" />

Every monster above is fully described by the number under it. They bounce, breathe, sway and blink on loop — each at its own seed-derived rhythm.

## How it works

- **Seeding** — an LCG with Knuth's MMIX constants over UInt64, driven through bit-exact ports of Swift's standard-library draw algorithms (Lemire bounded ints, the ClosedRange Double draw). The draw order is frozen: body type → body color → eye count/type/color/positions → mouth → accessory → pattern → bounce speed → blink interval. `test/fixtures.json` pins the output against value dumps from the compiled Swift reference implementation, down to the exact bit pattern of the animation doubles.
- **Rendering** — a 16×16 grid: 17 body shapes × 30 colors, 10 eye types (1–3 eyes) × 15 colors, 11 mouths, 23 accessories. The renderer centres each monster's *occupied bounding box* (not the grid — different bodies occupy wildly different sub-rects) and normalises optical size on its longer side.
- **Animation** — the reference kit's idle motion as looping CSS inside the SVG: bounce with counter-squish at the seed's own speed, breathing at 3×, sway/tilt at 4×/2.5×, premium accessories floating on their own layer, and a blink every `blinkInterval` seconds where the eyes take the body color for 150ms — exactly what the native renderer does. Honors `prefers-reduced-motion`.
- **Fresh casts** — a scheduled workflow rolls new random seeds four times a day, runs the parity tests, and force-pushes the result as the single commit on the [`output`](../../tree/output) branch.

## Use it

Embed the current cast anywhere (it updates by itself):

```markdown
<img alt="pixel monsters" src="https://raw.githubusercontent.com/andyleeboo/pixel-monsters/output/monsters.svg" />
```

Or generate your own locally — no dependencies, just Node 18+:

```bash
node generate.mjs                          # 8 random seeds -> dist/monsters.svg
node generate.mjs --seeds 54710,831042     # exact seeds, reproducible forever
node generate.mjs --count 12 --slot 120    # more monsters, bigger art
node generate.mjs --no-labels              # drop the seed captions
node --test                                # parity suite vs the Swift reference dumps
```

Because generation is deterministic, a seed is a permanent name: `--seeds 54710` draws the same monster today, next year, and on any other surface that speaks the same generator.
