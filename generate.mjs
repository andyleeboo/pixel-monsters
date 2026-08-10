#!/usr/bin/env node
/**
 * Generate an animated pixel-monster banner SVG.
 *
 *   node generate.mjs                        24 random seeds marching left → dist/monsters.svg
 *   node generate.mjs --count 12             smaller marching pool
 *   node generate.mjs --static               fixed row instead of the marching chain
 *   node generate.mjs --seeds 54710,831042   exact seeds (reproducible)
 *   node generate.mjs --speed 40             faster march (px/s)
 *   node generate.mjs --visible 6            narrower window (slots shown at once)
 *   node generate.mjs --out banner.svg       custom output path
 *   node generate.mjs --slot 120 --no-labels bigger art, no seed captions
 *
 * Random seeds are uniform over 0..999999 — the same space the avatar picker
 * rolls, so any cast that appears here can be looked up again by its number.
 */

import { randomInt } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { renderBanner } from './src/banner.mjs';

const args = process.argv.slice(2);
const flag = (name) => {
	const at = args.indexOf(`--${name}`);
	return at >= 0 ? (args[at + 1] ?? null) : null;
};

const march = !args.includes('--static');
const count = Number(flag('count') ?? (march ? 24 : 8));
const out = flag('out') ?? 'dist/monsters.svg';
const slot = Number(flag('slot') ?? 96);
const speed = Number(flag('speed') ?? 28);
const visible = Number(flag('visible') ?? 8);
const labels = !args.includes('--no-labels');

const seeds = flag('seeds')
	? flag('seeds')
			.split(',')
			.map((s) => {
				const seed = Number(s.trim());
				if (!Number.isSafeInteger(seed)) throw new Error(`not a usable seed: ${s}`);
				return seed;
			})
	: Array.from({ length: count }, () => randomInt(0, 1_000_000));

const svg = renderBanner(seeds, { slot, labels, march, speed, visible });
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, svg);
console.log(
	`${out}: ${seeds.length} monsters ${march ? 'marching' : 'standing'} (seeds ${seeds.join(', ')}), ${svg.length} bytes`
);
