import { fnpFailProbability } from "./probability";

/**
 * Monte-Carlo replay of the attack sequence, used for the quantities the exact
 * expectation pipeline cannot give cheaply: P(unit destroyed) and the damage
 * distribution.
 */

/** Deterministic PRNG so tests and memoised results are reproducible. */
export function mulberry32(seed) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function sampleExpr(expr, rng, min = 0) {
	let total = expr.flat;
	for (let i = 0; i < expr.dice; i++) {
		total += 1 + Math.floor(rng() * expr.sides);
	}
	return Math.max(min, total);
}

/** Turns a fractional count into an integer with the same mean. */
function randomRound(value, rng) {
	const whole = Math.floor(value);
	return whole + (rng() < value - whole ? 1 : 0);
}

/**
 * Replays whole rounds of attacks die by die. Every attack is resolved against
 * the allocation group that is current at that moment, so a wiped group spills
 * exactly, and damage carries over into the next round.
 *
 * @param {Array} streamGroups `{ group, streams }` in allocation order; every
 * group lists the same weapon profiles, in the same order, resolved against it
 * @returns round-1 statistics plus `clearedBy[n]` = P(unit destroyed by the
 * end of round n + 1)
 */
export function simulate(
	streamGroups,
	{ trials = 10000, seed = 1, rounds = 10 } = {},
) {
	const rng = mulberry32(seed);
	const targets = streamGroups.map(({ group, streams }) => ({
		streams,
		wounds: Math.max(1, group.wounds || 1),
		count: Math.max(1, group.count || 1),
		fnpFail: fnpFailProbability(group.fnp),
	}));
	const totalModels = targets.reduce((sum, t) => sum + t.count, 0);
	const profileCount = targets[0]?.streams.length ?? 0;

	let totalWoundsLost = 0;
	let totalModelsSlain = 0;
	const histogram = new Map();
	const clearedIn = new Array(rounds).fill(0);

	for (let trial = 0; trial < trials; trial++) {
		let groupIndex = 0;
		let remaining = targets[0].wounds;
		let slainInGroup = 0;
		let alive = totalModels;
		let lost = 0;
		let round = 0;

		// Excess damage is lost (§05.04) and a critical wound can only ever
		// damage one model (§24.10).
		const applyDamage = (target, damageExpr) => {
			const damage = sampleExpr(damageExpr, rng, 1);
			let woundsRemoved = 0;
			for (let w = 0; w < damage; w++) {
				if (rng() < target.fnpFail) woundsRemoved++;
			}
			const applied = Math.min(woundsRemoved, remaining);
			if (round === 0) lost += applied;
			remaining -= applied;
			if (remaining > 0) return;
			alive--;
			slainInGroup++;
			if (slainInGroup >= target.count) {
				groupIndex++;
				slainInGroup = 0;
			}
			remaining = targets[groupIndex]?.wounds ?? 0;
		};

		const resolveHit = (profile, autoWound) => {
			const target = targets[groupIndex];
			const { sampling: p, damageExpr } = target.streams[profile];
			if (!autoWound) {
				const roll = rng();
				const isCrit = roll < p.critWound;
				if (!isCrit && roll >= p.wound) return;
				if (isCrit && p.devastatingWounds) {
					applyDamage(target, damageExpr);
					return;
				}
			}
			if (rng() < p.saveFail) applyDamage(target, damageExpr);
		};

		for (; round < rounds && alive > 0; round++) {
			// §24.05 [BLAST] / [CLEAVE] count the models present at target selection.
			const targeted = alive;
			for (let profile = 0; profile < profileCount && alive > 0; profile++) {
				const gathered = targets[groupIndex].streams[profile].sampling;
				const bonus =
					(gathered.perFive || 0) *
					(Math.floor(targeted / 5) - (gathered.fullFives || 0));
				let attacks = 0;
				const instances = randomRound(gathered.instances, rng);
				for (let i = 0; i < instances; i++) {
					attacks += Math.max(
						1,
						sampleExpr(gathered.attacksExpr, rng, 0) + bonus,
					);
				}

				for (let a = 0; a < attacks && alive > 0; a++) {
					const p = targets[groupIndex].streams[profile].sampling;
					const roll = rng();
					if (roll < p.critHit) {
						resolveHit(profile, p.lethalHits);
						const extra = sampleExpr(p.sustainedExpr, rng, 0);
						for (let s = 0; s < extra && alive > 0; s++) {
							resolveHit(profile, false);
						}
					} else if (roll < p.hit) {
						resolveHit(profile, false);
					}
				}
			}
			if (round === 0) {
				totalWoundsLost += lost;
				totalModelsSlain += totalModels - alive;
				histogram.set(lost, (histogram.get(lost) || 0) + 1);
			}
		}
		if (alive <= 0) clearedIn[round - 1]++;
	}

	const clearedBy = [];
	let cumulative = 0;
	for (const count of clearedIn) {
		cumulative += count;
		clearedBy.push(cumulative / trials);
	}
	const median = clearedBy.findIndex((p) => p >= 0.5);

	return {
		trials,
		pDestroyed: clearedBy[0] ?? 0,
		meanWoundsLost: totalWoundsLost / trials,
		meanModelsSlain: totalModelsSlain / trials,
		histogram: [...histogram.entries()]
			.sort((a, b) => a[0] - b[0])
			.map(([value, hits]) => ({ value, probability: hits / trials })),
		clearedBy,
		medianRounds: median >= 0 ? median + 1 : null,
	};
}
