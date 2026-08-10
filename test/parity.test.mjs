/**
 * Pins the generator bit-for-bit against value dumps from the compiled Swift
 * reference kit (test/fixtures.json), and sanity-checks the SVG banner.
 * If any fixture assertion fails, the port has drifted from the reference —
 * fix the port, never the fixture.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { renderBanner } from '../src/banner.mjs';
import { generateMonster } from '../src/generator.mjs';
import { bounds } from '../src/layout.mjs';

const fixtures = JSON.parse(new URL('./fixtures.json', import.meta.url).pathname ? readFileSync(new URL('./fixtures.json', import.meta.url), 'utf8') : '{}');

/** Double.bitPattern decimal string → the exact float64 it encodes. */
function fromBits(bits) {
	const view = new DataView(new ArrayBuffer(8));
	view.setBigUint64(0, BigInt(bits));
	return view.getFloat64(0);
}

/** float64 → Double.bitPattern decimal string. */
function toBits(value) {
	const view = new DataView(new ArrayBuffer(8));
	view.setFloat64(0, value);
	return view.getBigUint64(0).toString();
}

test('generator matches the Swift reference corpus bit-for-bit', () => {
	assert.ok(fixtures.configs.length >= 50, `fixture corpus too small: ${fixtures.configs.length}`);
	for (const expected of fixtures.configs) {
		const actual = generateMonster(expected.seed);
		const at = `seed ${expected.seed}`;
		assert.equal(actual.bodyType, expected.bodyType, `${at}: bodyType`);
		assert.equal(actual.bodyColor, expected.bodyColor, `${at}: bodyColor`);
		assert.equal(actual.eye.count, expected.eye.count, `${at}: eye.count`);
		assert.equal(actual.eye.type, expected.eye.type, `${at}: eye.type`);
		assert.equal(actual.eye.color, expected.eye.color, `${at}: eye.color`);
		assert.deepEqual(actual.eye.positions, expected.eye.positions, `${at}: eye.positions`);
		assert.equal(actual.mouthType, expected.mouthType, `${at}: mouthType`);
		assert.deepEqual(
			actual.accessories.map((a) => a.type),
			expected.accessories.map((a) => a.type),
			`${at}: accessories`
		);
		assert.deepEqual(actual.pattern, expected.pattern ?? null, `${at}: pattern`);
		// Animation params are pinned to the exact bit pattern, not an epsilon.
		assert.equal(toBits(actual.bounceSpeed), expected.bounceSpeedBits, `${at}: bounceSpeed (${actual.bounceSpeed} vs ${fromBits(expected.bounceSpeedBits)})`);
		assert.equal(toBits(actual.blinkInterval), expected.blinkIntervalBits, `${at}: blinkInterval (${actual.blinkInterval} vs ${fromBits(expected.blinkIntervalBits)})`);
	}
});

test('generation is deterministic and animation params stay in range', () => {
	for (let seed = 0; seed < 500; seed++) {
		const a = generateMonster(seed);
		const b = generateMonster(seed);
		assert.deepEqual(a, b, `seed ${seed} not deterministic`);
		assert.ok(a.bounceSpeed >= 0.6 && a.bounceSpeed <= 1.2, `seed ${seed}: bounceSpeed ${a.bounceSpeed}`);
		assert.ok(a.blinkInterval >= 2.0 && a.blinkInterval <= 6.0, `seed ${seed}: blinkInterval ${a.blinkInterval}`);
		assert.ok(a.accessories.length <= 1, `seed ${seed}: accessory count`);
	}
});

test('occupied bounds stay inside the drawable grid band', () => {
	for (let seed = 0; seed < 500; seed++) {
		const box = bounds(generateMonster(seed));
		assert.ok(box.extent >= 4 && box.extent <= 16, `seed ${seed}: extent ${box.extent}`);
		// Accessories may be authored above the grid's top edge (y = -1), never past it.
		assert.ok(box.minY >= -1 && box.maxY <= 15, `seed ${seed}: y band ${box.minY}..${box.maxY}`);
		assert.ok(box.minX >= 0 && box.maxX <= 15, `seed ${seed}: x band ${box.minX}..${box.maxX}`);
	}
});

test('banner renders every seed, well-formed and looping', () => {
	const seeds = [0, 1, 2, 54710, 831042, 999999, 424242, 77];
	for (const march of [true, false]) {
		const svg = renderBanner(seeds, { slot: 96, march });
		const at = march ? 'march' : 'static';
		assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'), `${at}: svg root`);
		assert.ok(svg.endsWith('</svg>'), `${at}: closed root`);
		for (const seed of seeds) assert.ok(svg.includes(`#${seed}<`), `${at}: label for seed ${seed}`);
		for (let i = 0; i < seeds.length; i++) {
			assert.ok(svg.includes(`@keyframes b${i}{`), `${at}: bounce keyframes for slot ${i}`);
			assert.ok(svg.includes(`class="e${i}"`), `${at}: blinking eye group for slot ${i}`);
		}
		assert.ok(svg.includes('infinite alternate'), `${at}: looping idle animations`);
		assert.ok(svg.includes('prefers-reduced-motion'), `${at}: reduced-motion escape`);
		assert.ok(!svg.includes('NaN') && !svg.includes('undefined') && !svg.includes('Infinity'), `${at}: no bad numbers`);
		// Only the safe attribute vocabulary — nothing user-controlled reaches markup.
		assert.ok(!/on\w+=/.test(svg) && !svg.includes('<script'), `${at}: inert svg`);
	}
});

test('march mode scrolls left and wraps seamlessly', () => {
	const seeds = Array.from({ length: 12 }, (_, i) => i * 1000 + 7);
	const slot = 96;
	const gap = 10;
	const visible = 8;
	const svg = renderBanner(seeds, { slot, gap, visible, speed: 28 });

	// The wrap distance is one full strip; travel is leftward by exactly that.
	const stripW = seeds.length * (slot + gap);
	assert.ok(svg.includes(`@keyframes march{to{transform:translateX(-${stripW}px)}}`), 'march travel = strip width');
	assert.ok(/\.chain\{animation:march [\d.]+s linear infinite\}/.test(svg), 'constant-speed loop');

	// Every monster is laid out twice, one strip width apart, for the seamless seam.
	for (const seed of seeds) {
		assert.equal(svg.split(`#${seed}<`).length - 1, 2, `seed ${seed} placed in both strip copies`);
	}

	// The viewport is the visible window, not the strip.
	const expectedWidth = 12 * 2 + visible * slot + (visible - 1) * gap;
	assert.ok(svg.includes(`viewBox="0 0 ${expectedWidth} `), 'viewport clips to the visible window');

	// Static mode places each monster once and has no marquee.
	const stat = renderBanner(seeds, { slot, gap, march: false });
	assert.ok(!stat.includes('@keyframes march'), 'static: no marquee');
	for (const seed of seeds) {
		assert.equal(stat.split(`#${seed}<`).length - 1, 1, `static: seed ${seed} placed once`);
	}
});

test('the same seed list renders byte-identical banners', () => {
	const seeds = [12, 345, 6789];
	assert.equal(renderBanner(seeds), renderBanner(seeds));
});
