import { fnpFailProbability, parseSkill } from "./probability";

/** The better (lower) of two Feel No Pain thresholds; null is none. */
function betterFnp(a, b) {
	const value = (x) => (x ? parseSkill(x, 7) : 7);
	const best = Math.min(value(a), value(b));
	return best < 7 ? best : null;
}

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

const toDistribution = (counts, trials) =>
	[...counts.entries()]
		.sort((a, b) => a[0] - b[0])
		.map(([value, hits]) => ({ value, probability: hits / trials }));

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
		// Each weapon carries the FNP it was resolved against (phase-specific modifiers).
		streams: streams.map((stream) => {
			const fnp =
				stream.sampling?.fnp !== undefined ? stream.sampling.fnp : group.fnp;
			return {
				...stream,
				fnpFail: fnpFailProbability(fnp),
				// [DEVASTATING WOUNDS] mortal wounds may face a better Feel No Pain.
				mortalFnpFail: fnpFailProbability(
					betterFnp(fnp, stream.sampling?.mortalFnp),
				),
			};
		}),
		wounds: Math.max(1, group.wounds || 1),
		count: Math.max(1, group.count || 1),
	}));
	const totalModels = targets.reduce((sum, t) => sum + t.count, 0);
	const profileCount = targets[0]?.streams.length ?? 0;
	const last = targets.length - 1;

	let totalWoundsLost = 0;
	let totalModelsSlain = 0;
	const histogram = new Map();
	// Round one again, but the attacks go on after the unit is destroyed, against
	// more of its last model type: what the attack could do, overkill included.
	const potentialHistogram = new Map();
	let totalPotential = 0;
	const clearedIn = new Array(rounds).fill(0);

	for (let trial = 0; trial < trials; trial++) {
		let groupIndex = 0;
		let remaining = targets[0].wounds;
		let slainInGroup = 0;
		let alive = totalModels;
		let lost = 0;
		let potential = 0;
		// Set once the unit is gone in round one: the rest of that round's attacks
		// hit fresh copies of the last model type and count only as potential.
		let endless = false;
		let round = 0;
		const attacking = () => alive > 0 || endless;

		// Excess damage is lost (§05.04) and a critical wound can only ever
		// damage one model (§24.10).
		// Same order as `applyDamageRules`: re-roll a low roll, halve, then "becomes 1".
		const rollDamage = (stream) => {
			const rules = stream.sampling?.damageRules ?? {};
			let damage = sampleExpr(stream.damageExpr, rng, 1);
			if (rules.rerollBelow != null && damage < rules.rerollBelow) {
				damage = sampleExpr(stream.damageExpr, rng, 1);
			}
			if (rules.halve) damage = Math.max(1, Math.ceil(damage / 2));
			if (rules.toOne) damage = 1;
			return damage;
		};

		const applyDamage = (target, stream, mortal = false) => {
			const damage = rollDamage(stream);
			const fnpFail = mortal ? stream.mortalFnpFail : stream.fnpFail;
			let woundsRemoved = 0;
			for (let w = 0; w < damage; w++) {
				if (rng() < fnpFail) woundsRemoved++;
			}
			const applied = Math.min(woundsRemoved, remaining);
			if (round === 0) potential += applied;
			remaining -= applied;
			if (endless) {
				if (remaining <= 0) remaining = targets[last].wounds;
				return;
			}
			if (round === 0) lost += applied;
			if (remaining > 0) return;
			alive--;
			slainInGroup++;
			if (slainInGroup >= target.count) {
				groupIndex++;
				slainInGroup = 0;
			}
			if (alive === 0 && round === 0) {
				endless = true;
				groupIndex = last;
				remaining = targets[last].wounds;
				return;
			}
			remaining = targets[groupIndex]?.wounds ?? 0;
		};

		const resolveHit = (profile, autoWound) => {
			const target = targets[groupIndex];
			const stream = target.streams[profile];
			const p = stream.sampling;
			if (!autoWound) {
				const roll = rng();
				const isCrit = roll < p.critWound;
				if (!isCrit && roll >= p.wound) return;
				if (isCrit && p.devastatingWounds) {
					applyDamage(target, stream, true);
					return;
				}
			}
			if (rng() < p.saveFail) applyDamage(target, stream);
		};

		for (; round < rounds && alive > 0; round++) {
			// §24.05 [BLAST] / [CLEAVE] count the models present at target selection.
			const targeted = alive;
			for (let profile = 0; profile < profileCount && attacking(); profile++) {
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

				for (let a = 0; a < attacks && attacking(); a++) {
					const p = targets[groupIndex].streams[profile].sampling;
					const roll = rng();
					if (roll < p.critHit) {
						resolveHit(profile, p.lethalHits);
						const extra = sampleExpr(p.sustainedExpr, rng, 0);
						for (let s = 0; s < extra && attacking(); s++) {
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
				totalPotential += potential;
				potentialHistogram.set(
					potential,
					(potentialHistogram.get(potential) || 0) + 1,
				);
				endless = false;
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
		histogram: toDistribution(histogram, trials),
		// Overkill included: round one's attacks, all of them.
		meanPotentialWoundsLost: totalPotential / trials,
		potentialHistogram: toDistribution(potentialHistogram, trials),
		clearedBy,
		medianRounds: median >= 0 ? median + 1 : null,
	};
}
