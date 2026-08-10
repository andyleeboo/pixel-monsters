/**
 * Bit-exact port of the Swift random plumbing the monster generator draws from:
 *
 *   - `SeededRng` is an LCG with Knuth's MMIX constants over UInt64.
 *   - The draw helpers mirror the Swift STANDARD LIBRARY algorithms
 *     (`Int.random(in:using:)`, `Double.random(in:using:)`,
 *     `Bool.random(using:)`). `nextUpperBound` is stdlib `next(upperBound:)` —
 *     Lemire's "nearly divisionless" method; `doubleClosed` is the ClosedRange
 *     Double algorithm (a Lemire draw with bound 2^53 + 1).
 *
 * Every helper is pinned against value dumps from the compiled Swift kit
 * (test/parity.test.mjs) — identical seed → identical monster is the entire
 * point. Do not "simplify" the math: BigInt is what keeps the 64-bit
 * wraparound and the 128-bit Lemire multiply exact.
 */

const MASK64 = (1n << 64n) - 1n;
const MAX_SIGNIFICAND = 1n << 53n; // Double.significandBitCount + 1 bits

export class SeededRng {
	#state;

	constructor(seed) {
		if (!Number.isSafeInteger(seed)) {
			throw new RangeError(`seed must be a safe integer, got ${seed}`);
		}
		// Swift: UInt64(bitPattern: Int64(seed)), then 0 -> 1.
		this.#state = BigInt.asUintN(64, BigInt(seed));
		if (this.#state === 0n) this.#state = 1n;
	}

	/** One LCG step: state = state &* 6364136223846793005 &+ 1442695040888963407. */
	next() {
		this.#state = (this.#state * 6364136223846793005n + 1442695040888963407n) & MASK64;
		return this.#state;
	}

	/** Swift stdlib `next(upperBound:)` — Lemire, arXiv:1805.10941. */
	nextUpperBound(bound) {
		let random = this.next();
		let m = random * bound;
		let low = m & MASK64;
		if (low < bound) {
			const threshold = (MASK64 - bound + 1n) % bound; // (2^64 - bound) % bound
			while (low < threshold) {
				random = this.next();
				m = random * bound;
				low = m & MASK64;
			}
		}
		return m >> 64n;
	}

	/** Swift `Int.random(in: lo..<hi, using:)`. */
	intHalfOpen(lo, hi) {
		return lo + Number(this.nextUpperBound(BigInt(hi - lo)));
	}

	/** Swift `Int.random(in: lo...hi, using:)`. */
	intClosed(lo, hi) {
		return lo + Number(this.nextUpperBound(BigInt(hi - lo) + 1n));
	}

	/** Swift `Bool.random(using:)` — bit 17 of the next raw draw. */
	bool() {
		return ((this.next() >> 17n) & 1n) === 0n;
	}

	/**
	 * Swift `Double.random(in: lo...hi, using:)` — ClosedRange form: a Lemire
	 * draw with bound 2^53 + 1, where landing exactly on 2^53 returns the upper
	 * bound, and a rounded-up result re-draws.
	 */
	doubleClosed(lo, hi) {
		const delta = hi - lo;
		for (;;) {
			const rand = this.nextUpperBound(MAX_SIGNIFICAND + 1n);
			if (rand === MAX_SIGNIFICAND) return hi;
			const unitRandom = Number(rand) * 2 ** -53; // Double(rand) * (ulpOfOne / 2)
			const value = delta * unitRandom + lo;
			if (value === hi) continue;
			return value;
		}
	}
}
