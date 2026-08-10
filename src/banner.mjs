/**
 * Renders a row of monsters as one self-contained animated SVG.
 *
 * Painting order per monster follows the Swift reference Canvas exactly:
 * body → eyes → mouth (+specials) → accessories, with premium accessories on
 * a separate floating layer. Patterns are generated but not painted — the
 * reference view fills the fully opaque body over them, so pattern pixels
 * never reach the screen, and we skip emitting the dead layer instead of
 * copying it. Rendered output is identical.
 *
 * The motion is a deliberate subset of the reference kit's idle set,
 * expressed as looping CSS (autoreversing SwiftUI curves map to `infinite
 * alternate`). The kit also squishes, breathes, sways and tilts; every
 * deforming or rotating track is intentionally dropped here — the monsters
 * hop rigidly, they are never stretched or wiggled:
 *
 *   bounce   translateY, cubic-bezier(.4,0,.6,1), duration = the seed's own
 *            bounceSpeed
 *   float    premium accessory layer translateY −3%, ease-in-out, 2s
 *   blink    eye fill → body fill for 0.15s (0.1s fades) every blinkInterval
 *
 * Phase offsets are presentation-level randomness (the reference draws them
 * outside the seeded generator), so here they come from a SEPARATE
 * offset-seed rng — the visual stream that defines the monster is never
 * extended.
 */

import { ACCESSORY_DEFS, BODY_PIXELS, EYE_PIXELS, MOUTH_PIXELS, mouthY } from './data.mjs';
import { generateMonster } from './generator.mjs';
import { bounds, FLOAT_FRACTION } from './layout.mjs';
import { SeededRng } from './rng.mjs';

/**
 * Hop height as a fraction of the art's longer side. The kit's in-place idle
 * uses 0.04, buried under its sway/squish tracks; with those dropped the hop
 * alone carries the life, so it gets a little more travel. Still well inside
 * the slot's safe-area margin.
 */
const HOP_FRACTION = 0.06;

/** SwiftUI fixed colors resolve to the iOS system palette. */
const SWIFTUI_PINK = '#FF2D55';
const SWIFTUI_YELLOW = '#FFCC00';

/** Fraction of the slot the resting art aims to span (square safe area). */
const SAFE_FRACTION = 0.76;

const px = (v) => {
	const r = Math.round(v * 100) / 100;
	return Object.is(r, -0) ? '0' : String(r);
};
const sec = (v) => String(Math.round(v * 1000) / 1000);
const pct = (v) => String(Math.round(v * 10000) / 100);

function rect(x, y, w, fill, opacity) {
	const width = w ?? 1;
	const f = fill === null ? '' : ` fill="${fill}"`;
	const o = opacity !== undefined ? ` fill-opacity="${opacity}"` : '';
	return `<rect x="${x}" y="${y}" width="${width}" height="1"${f}${o}/>`;
}

/** Accessory pixels in Swift draw order (base fill first, extras after). */
function accessoryRects(accessory) {
	const ax = 7;
	const ay = 1;
	const def = ACCESSORY_DEFS[accessory.type];
	const out = [];
	if (def.coloredPixels) {
		for (const p of def.coloredPixels) out.push(rect(ax + p.dx, ay + p.dy, 1, p.color));
		return out.join('');
	}
	for (const [dx, dy] of def.pixels) out.push(rect(ax + dx, ay + dy, 1, def.defaultColor));
	if (accessory.type === 'cloud') {
		// The reference redraws every cloud pixel white at 0.8 over the white base.
		for (const [dx, dy] of def.pixels) out.push(rect(ax + dx, ay + dy, 1, '#FFFFFF', 0.8));
	} else if (accessory.type === 'flower') {
		out.push(rect(ax, ay, 1, SWIFTUI_YELLOW));
	} else if (accessory.type === 'bubble') {
		out.push(rect(ax + 1, ay - 2, 1, '#FFFFFF', 0.6));
	} else if (accessory.type === 'pixelCoin') {
		out.push(rect(ax, ay, 1, '#000000', 0.3));
	}
	return out.join('');
}

/** Body, eyes, mouth and non-premium accessories, grouped for animation. */
function monsterArt(config, id) {
	// Body — one group, one fill.
	let body = '';
	for (const [x, y] of BODY_PIXELS[config.bodyType]) body += rect(x, y, 1, null);

	// Eyes — one group whose FILL blinks to the body color, exactly as the
	// reference paints blinking eyes in the body color.
	let eyes = '';
	const eyePixels = EYE_PIXELS[config.eye.type];
	for (const [ex, ey] of config.eye.positions) {
		if (config.eye.type === 'wink' && ex > 8) {
			// Winking side renders as a 2-wide sleepy eye.
			eyes += rect(ex - 1, ey, 2, null);
		} else {
			for (const [dx, dy] of eyePixels) eyes += rect(ex + dx, ey + dy, 1, null);
		}
	}

	// Mouth + specials.
	let mouth = '';
	const my = mouthY(config.bodyType);
	for (const [x, dy] of MOUTH_PIXELS[config.mouthType]) {
		mouth += rect(x, my + dy, 1, '#000000', 0.8);
	}
	if (config.mouthType === 'tongue') {
		mouth += rect(7, my + 1, 2, SWIFTUI_PINK);
	} else if (config.mouthType === 'teeth') {
		for (const x of [6, 8, 10]) mouth += rect(x, my + 1, 1, '#FFFFFF');
	} else if (config.mouthType === 'vampire') {
		mouth += rect(6, my + 1, 1, '#FFFFFF');
		mouth += rect(9, my + 1, 1, '#FFFFFF');
	}

	let accessories = '';
	for (const accessory of config.accessories) {
		if (!accessory.isPremium) accessories += accessoryRects(accessory);
	}

	return (
		`<g fill="${config.bodyColor}">${body}</g>` +
		`<g class="e${id}" fill="${config.eye.color}">${eyes}</g>` +
		`<g>${mouth}</g>` +
		(accessories ? `<g>${accessories}</g>` : '')
	);
}

function premiumArt(config) {
	let out = '';
	for (const accessory of config.accessories) {
		if (accessory.isPremium) out += accessoryRects(accessory);
	}
	return out;
}

/**
 * Render seeds into one looping, self-contained SVG banner.
 *
 * Two modes:
 *   march (default) — the chain walks leftward forever. The full strip of
 *     monsters scrolls at a constant speed and is laid out twice, one strip
 *     width apart, so the loop wraps seamlessly: when the first copy has
 *     scrolled fully out, the second copy is exactly where the first began.
 *     Both copies share every animation class, so each monster's idle phase
 *     is identical in the two copies and the seam is invisible. The viewport
 *     shows `visible` slots; fresh monsters keep entering from the right.
 *   static — the old fixed row (every seed in its own slot, no travel).
 *
 * @param {number[]} seeds
 * @param {{slot?: number, gap?: number, pad?: number, labels?: boolean,
 *          labelColor?: string, march?: boolean, speed?: number,
 *          visible?: number}} [options]
 * @returns {string}
 */
export function renderBanner(seeds, options = {}) {
	const slot = options.slot ?? 96;
	const gap = options.gap ?? 10;
	const pad = options.pad ?? 12;
	const labels = options.labels ?? true;
	const labelColor = options.labelColor ?? '#8b949e';
	const march = options.march ?? true;
	const speed = options.speed ?? 28; // leftward, px per second
	const visible = Math.min(options.visible ?? 8, seeds.length);
	const labelBand = labels ? 22 : 0;

	const stride = slot + gap;
	const cols = march ? visible : seeds.length;
	const width = pad * 2 + cols * slot + Math.max(0, cols - 1) * gap;
	const height = pad * 2 + slot + labelBand;
	// Periodic strip width — the marquee's wrap distance and travel per loop.
	const stripW = seeds.length * stride;

	let css =
		'text{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px}' +
		'@media (prefers-reduced-motion:reduce){*{animation:none !important}}';
	let defs = '';
	const monsters = [];

	seeds.forEach((seed, i) => {
		const config = generateMonster(seed);
		const box = bounds(config);

		// Optical sizing: normalise on the longer side of the occupied box, so
		// a tall body and a squat one span the same fraction of the slot.
		const cell = (slot * SAFE_FRACTION) / box.extent;
		const unit = Math.max(box.width, box.height) * cell; // motion amplitude base

		// Presentation-level randomness on an offset-seed rng (never the
		// generator's stream): the hop and blink phase offsets.
		const prng = new SeededRng(Number(BigInt.asUintN(50, BigInt(seed) * 6364136223846793005n + 99n)));
		const phase = prng.doubleClosed(0, 4);
		const blinkPhase = prng.doubleClosed(0, config.blinkInterval);

		const b = config.bounceSpeed;
		const blink = config.blinkInterval;

		// Blink keyframes: closed for 0.15s with 0.1s fades, once per interval.
		const f = 0.1 / blink;
		const hold = 0.15 / blink;
		const p1 = Math.max(0, 1 - (2 * f + hold) - 0.02);

		defs +=
			`@keyframes b${i}{to{transform:translateY(${px(-unit * HOP_FRACTION)}px)}}` +
			`@keyframes k${i}{0%,${pct(p1)}%{fill:${config.eye.color}}${pct(p1 + f)}%,${pct(p1 + f + hold)}%{fill:${config.bodyColor}}${pct(p1 + 2 * f + hold)}%,100%{fill:${config.eye.color}}}`;

		css +=
			`.b${i}{animation:b${i} ${sec(b)}s cubic-bezier(.4,0,.6,1) -${sec(phase)}s infinite alternate}` +
			`.e${i}{animation:k${i} ${sec(blink)}s linear -${sec(blinkPhase)}s infinite}`;

		const art = `transform="scale(${px(cell)}) translate(${px(-box.centerX)} ${px(-box.centerY)})"`;
		const premium = premiumArt(config);
		let premiumLayer = '';
		if (premium) {
			defs += `@keyframes f${i}{to{transform:translateY(${px(-unit * FLOAT_FRACTION)}px)}}`;
			css += `.f${i}{animation:f${i} 2s ease-in-out -${sec(phase)}s infinite alternate}`;
			premiumLayer = `<g class="f${i}"><g ${art} shape-rendering="crispEdges">${premium}</g></g>`;
		}

		// One monster, centred on its local origin — placed per copy below.
		// A single rigid translateY carries the whole figure: no scale, no
		// rotation, nothing that would stretch or wiggle the art.
		let inner =
			`<g class="b${i}">` +
			`<g ${art} shape-rendering="crispEdges">${monsterArt(config, i)}</g>` +
			premiumLayer +
			`</g>`;
		if (labels) {
			inner += `<text x="0" y="${px(slot / 2 + 15)}" text-anchor="middle" fill="${labelColor}">#${seed}</text>`;
		}
		monsters.push(inner);
	});

	const cy = pad + slot / 2;
	const place = (i, offset) =>
		`<g transform="translate(${px(pad + i * stride + slot / 2 + offset)} ${px(cy)})">${monsters[i]}</g>`;

	let content = '';
	if (march) {
		// Travel one strip width per loop at a constant speed, then wrap.
		const dur = stripW / speed;
		defs += `@keyframes march{to{transform:translateX(${px(-stripW)}px)}}`;
		css += `.chain{animation:march ${sec(dur)}s linear infinite}`;
		let strip = '';
		for (let i = 0; i < seeds.length; i++) strip += place(i, 0) + place(i, stripW);
		content = `<g class="chain">${strip}</g>`;
	} else {
		for (let i = 0; i < seeds.length; i++) content += place(i, 0);
	}

	const title = march
		? `${seeds.length} pixel monsters marching by — seeds ${seeds.join(', ')}`
		: `${seeds.length} pixel monsters — seeds ${seeds.join(', ')}`;
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${title}">` +
		`<title>${title}</title>` +
		`<style>${css}${defs}</style>` +
		content +
		`</svg>`
	);
}
