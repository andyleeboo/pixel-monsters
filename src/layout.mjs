/**
 * Occupancy + centring maths, ported from the Swift kit's `MonsterLayout`.
 *
 * The drawing plots at grid coordinates from the 16×16 grid's top-left, and
 * different bodies, eyes, mouths and accessories occupy wildly different
 * sub-rects of that grid — so centring the *grid* centres nothing. This
 * computes the union bounding box of every cell a configuration paints and
 * lets the renderer centre that box instead.
 *
 * Deliberately pose-independent: eyes and mouth count even though a blink
 * hides the eyes. A monster that resized when it blinked would be worse than
 * one slightly loose in its box.
 */

import { ACCESSORY_DEFS, BODY_PIXELS, EYE_PIXELS, MOUTH_PIXELS, mouthY } from './data.mjs';

/** The art grid is 16×16 cells. */
export const GRID_SIZE = 16;

/** Grid cell an accessory is drawn around (topCenter anchor). */
export const ACCESSORY_ANCHOR = { x: 7, y: 1 };

// Motion amplitudes, as fractions of the art's longer side — matching the
// Swift kit so the animation reads the same at every render size.
export const BOUNCE_FRACTION = 0.04;
export const SWAY_FRACTION = 0.01;
export const FLOAT_FRACTION = 0.03;
export const TILT_DEGREES = 1.5;
export const BREATHING_SCALE = 1.02;

/** Every cell this configuration can paint, as a Set of "x,y" keys. */
export function occupiedCells(config) {
	const cells = new Set();
	const add = (x, y) => cells.add(`${x},${y}`);

	// Body. Patterns are clipped to the body, so they can never extend the
	// silhouette and need no separate pass.
	for (const [x, y] of BODY_PIXELS[config.bodyType]) add(x, y);

	// Eyes.
	const eyePixels = EYE_PIXELS[config.eye.type];
	for (const [px, py] of config.eye.positions) {
		if (config.eye.type === 'wink' && px > 8) {
			// The wink's sleepy eye is one 2-cell-wide rect from x-1.
			add(px - 1, py);
			add(px, py);
		} else {
			for (const [dx, dy] of eyePixels) add(px + dx, py + dy);
		}
	}

	// Mouth, including the extra row some mouth types draw under it.
	const my = mouthY(config.bodyType);
	for (const [x, dy] of MOUTH_PIXELS[config.mouthType]) add(x, my + dy);
	if (config.mouthType === 'tongue') {
		add(7, my + 1);
		add(8, my + 1);
	} else if (config.mouthType === 'teeth') {
		for (const x of [6, 8, 10]) add(x, my + 1);
	} else if (config.mouthType === 'vampire') {
		add(6, my + 1);
		add(9, my + 1);
	}

	// Accessories — they are what actually extends the silhouette.
	for (const accessory of config.accessories) {
		const def = ACCESSORY_DEFS[accessory.type];
		if (def.coloredPixels) {
			for (const p of def.coloredPixels) add(ACCESSORY_ANCHOR.x + p.dx, ACCESSORY_ANCHOR.y + p.dy);
		} else {
			for (const [dx, dy] of def.pixels) add(ACCESSORY_ANCHOR.x + dx, ACCESSORY_ANCHOR.y + dy);
			if (accessory.type === 'bubble') {
				// The highlight sits two cells above the anchor, outside the
				// authored pixel list.
				add(ACCESSORY_ANCHOR.x + 1, ACCESSORY_ANCHOR.y - 2);
			}
		}
	}

	return cells;
}

/** The integer bounding box of every painted cell, in grid units. */
export function bounds(config) {
	let minX = Infinity,
		minY = Infinity,
		maxX = -Infinity,
		maxY = -Infinity;
	for (const key of occupiedCells(config)) {
		const [x, y] = key.split(',').map(Number);
		if (x < minX) minX = x;
		if (x > maxX) maxX = x;
		if (y < minY) minY = y;
		if (y > maxY) maxY = y;
	}
	if (!Number.isFinite(minX)) {
		// A configuration that paints nothing falls back to the whole grid.
		return { minX: 0, minY: 0, maxX: GRID_SIZE - 1, maxY: GRID_SIZE - 1, width: GRID_SIZE, height: GRID_SIZE, extent: GRID_SIZE, centerX: GRID_SIZE / 2, centerY: GRID_SIZE / 2 };
	}
	const width = maxX - minX + 1;
	const height = maxY - minY + 1;
	return {
		minX,
		minY,
		maxX,
		maxY,
		width,
		height,
		/** The longer side, in cells — what optical sizing normalises on. */
		extent: Math.max(width, height),
		// Cell maxX ends at maxX + 1, so the +1 makes this the true centre.
		centerX: (minX + maxX + 1) / 2,
		centerY: (minY + maxY + 1) / 2
	};
}
