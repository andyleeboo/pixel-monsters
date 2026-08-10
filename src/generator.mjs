/**
 * Seed → monster configuration, a bit-exact port of the Swift reference kit's
 * `MonsterGenerator.generateConfiguration(from:)`. The DRAW ORDER is
 * load-bearing — every random call maps 1:1 to the Swift original so the
 * shared LCG stream stays in phase:
 *
 *   body type → body color → eye count → eye type → eye color → eye positions
 *   → mouth → accessory chance (+ pick) → pattern chance (+ type + color)
 *   → bounce speed → blink interval
 *
 * Fixtures dumped from the compiled Swift kit pin this file's output
 * (test/parity.test.mjs).
 */

import { SeededRng } from './rng.mjs';
import {
	ACCESSORY_DEFS,
	ACCESSORY_TYPES,
	BODY_COLORS,
	BODY_TYPES,
	EYE_COLORS,
	EYE_COUNTS,
	EYE_TYPES,
	MOUTH_TYPES,
	PATTERN_COLORS,
	PATTERN_TYPES
} from './data.mjs';

function eyePositions(rng, count) {
	switch (count) {
		case 1:
			return [[8, 6]];
		case 2: {
			const spacing = rng.intClosed(2, 4);
			const yPos = rng.intClosed(5, 7);
			const half = Math.trunc(spacing / 2);
			return [
				[8 - half, yPos],
				[8 + half, yPos]
			];
		}
		case 3:
			return rng.bool()
				? [
						[8, 5],
						[6, 7],
						[10, 7]
					]
				: [
						[5, 6],
						[8, 6],
						[11, 6]
					];
	}
}

/** Deterministic: the same seed always yields the same monster as the Swift kit. */
export function generateMonster(seed) {
	const rng = new SeededRng(seed);

	const bodyType = BODY_TYPES[rng.intHalfOpen(0, BODY_TYPES.length)];
	const bodyColor = BODY_COLORS[rng.intHalfOpen(0, BODY_COLORS.length)];

	const eyeCount = EYE_COUNTS[rng.intHalfOpen(0, EYE_COUNTS.length)];
	const eyeType = EYE_TYPES[rng.intHalfOpen(0, EYE_TYPES.length)];
	const eyeColor = EYE_COLORS[rng.intHalfOpen(0, EYE_COLORS.length)];
	const positions = eyePositions(rng, eyeCount);

	const mouthType = MOUTH_TYPES[rng.intHalfOpen(0, MOUTH_TYPES.length)];

	const accessories = [];
	if (rng.doubleClosed(0, 1) < 0.2) {
		const type = ACCESSORY_TYPES[rng.intHalfOpen(0, ACCESSORY_TYPES.length)];
		accessories.push({ type, position: 'topCenter', isPremium: ACCESSORY_DEFS[type].isPremium });
	}

	let pattern = null;
	if (rng.doubleClosed(0, 1) < 0.3) {
		const type = PATTERN_TYPES[rng.intHalfOpen(0, PATTERN_TYPES.length)];
		const color = PATTERN_COLORS[rng.intHalfOpen(0, PATTERN_COLORS.length)];
		pattern = { type, color };
	}

	const bounceSpeed = rng.doubleClosed(0.6, 1.2);
	const blinkInterval = rng.doubleClosed(2.0, 6.0);

	return {
		seed,
		bodyType,
		bodyColor,
		eye: { count: eyeCount, type: eyeType, color: eyeColor, positions },
		mouthType,
		accessories,
		pattern,
		bounceSpeed,
		blinkInterval
	};
}
