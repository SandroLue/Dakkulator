import { describe, expect, it } from "vitest";
import { engineInputs, scenarioGenerator } from "./__fixtures__/scenarios";
import {
	boltgunSquad,
	makeModelStats,
	makeUnit,
	makeWeapon,
	mixedSquad,
} from "./__fixtures__/units";
import { resolveUnitVsUnit, simulatePairing } from "./index";
import { allocateAttacks, computeAttackStreams } from "./resolve";
import { simulate } from "./simulate";

const TRIALS = 20000;
/** 4.5 standard errors: a false alarm is ~1 in 150 000 per assertion. */
const Z = 4.5;

function standardErrors(sim) {
	let square = 0;
	for (const { value, probability } of sim.histogram) {
		square += probability * value * value;
	}
	const variance = Math.max(0, square - sim.meanWoundsLost ** 2);
	const p = sim.pDestroyed;
	return {
		woundsLost: Math.sqrt(variance / sim.trials),
		// Floor at one trial's worth so p = 0 or 1 still gets a tolerance.
		pDestroyed: Math.sqrt(Math.max(p * (1 - p), 1 / sim.trials) / sim.trials),
	};
}

function expectAgreement(exact, sim, label) {
	const se = standardErrors(sim);
	expect(
		Math.abs(exact.woundsLost - sim.meanWoundsLost),
		`woundsLost ${label}: exact ${exact.woundsLost}, MC ${sim.meanWoundsLost} ± ${se.woundsLost}`,
	).toBeLessThanOrEqual(Z * se.woundsLost + 1e-9);
	expect(
		Math.abs(exact.pDestroyed - sim.pDestroyed),
		`pDestroyed ${label}: exact ${exact.pDestroyed}, MC ${sim.pDestroyed} ± ${se.pDestroyed}`,
	).toBeLessThanOrEqual(Z * se.pDestroyed + 1e-9);
}

describe("exact engine vs Monte-Carlo — one weapon, one group", () => {
	const next = scenarioGenerator(77);
	for (let i = 0; i < 30; i++) {
		const sc = next();
		it(`scenario ${i}`, () => {
			const { profile, group, ctx } = engineInputs(sc);
			const streams = computeAttackStreams(profile, group, ctx);
			const exact = allocateAttacks([[streams]], [group]);
			const sim = simulate([{ group, streams: [streams] }], {
				trials: TRIALS,
				seed: i + 1,
				rounds: 1,
			});
			expectAgreement(exact, sim, JSON.stringify(sc));
		});
	}
});

describe("exact engine vs Monte-Carlo — several weapons, one group", () => {
	const next = scenarioGenerator(99);
	for (let i = 0; i < 15; i++) {
		const scenarios = [next(), next(), next()];
		it(`volley ${i}`, () => {
			// Every weapon shoots the first scenario's target.
			const { group } = engineInputs(scenarios[0]);
			const streams = scenarios.map((sc) => {
				const { profile, ctx } = engineInputs(sc);
				return computeAttackStreams(profile, group, ctx);
			});
			const exact = allocateAttacks(
				streams.map((s) => [s]),
				[group],
			);
			const sim = simulate([{ group, streams }], {
				trials: TRIALS,
				seed: 100 + i,
				rounds: 1,
			});
			expectAgreement(exact, sim, JSON.stringify(scenarios));
		});
	}
});

describe("Monte-Carlo [BLAST] dice (§24.05)", () => {
	// Auto-hitting, auto-wounding, unsaveable A1 [BLAST 2] vs 10x W1: 1 + 2x2 dice.
	const sc = {
		attacks: "1",
		torrent: true,
		blast: 2,
		strength: 8,
		toughness: 1,
		wounds: 1,
		count: 10,
	};

	it("counts the models present at target selection for every weapon", () => {
		const { profile, group, ctx } = engineInputs(sc);
		const streams = computeAttackStreams(profile, group, ctx);
		const exact = allocateAttacks([[streams], [streams]], [group]);
		// The first weapon kills ~4 models; the second still gathers 5 dice.
		expect(exact.woundsLost).toBeCloseTo(10 * (5 / 6), 10);
		const sim = simulate([{ group, streams: [streams, streams] }], {
			trials: TRIALS,
			seed: 1,
			rounds: 1,
		});
		expectAgreement(exact, sim, "two [BLAST 2] weapons");
	});

	it("re-counts the models at the next round's target selection", () => {
		const { profile, group, ctx } = engineInputs(sc);
		const streams = computeAttackStreams(profile, group, ctx);
		const options = { trials: TRIALS, seed: 2, rounds: 3 };
		const shrinking = simulate([{ group, streams: [streams] }], options);
		const fixed = simulate(
			[
				{
					group,
					streams: [
						{ ...streams, sampling: { ...streams.sampling, perFive: 0 } },
					],
				},
			],
			options,
		);
		// Round 2 faces 5-9 models, so only 3 dice: 8 dice cannot clear 10 models.
		expect(shrinking.clearedBy[1]).toBe(0);
		expect(fixed.clearedBy[1]).toBeGreaterThan(0.1);
	});
});

const veterans = makeUnit({
	name: "Veterans",
	keywords: ["INFANTRY"],
	modelStats: [
		makeModelStats({ name: "Veteran", toughness: 4, wounds: 2, save: "3+" }),
		makeModelStats({
			name: "Sergeant",
			toughness: 4,
			wounds: 3,
			save: "3+",
			invulnerableSave: "4+",
		}),
	],
	models: [
		{ name: "Veteran", count: 4, rangedWeapons: [], meleeWeapons: [] },
		{ name: "Sergeant", count: 1, rangedWeapons: [], meleeWeapons: [] },
	],
});

const heavySquad = makeUnit({
	name: "Heavy Squad",
	keywords: ["INFANTRY"],
	modelStats: [makeModelStats({ name: "Gunner", bs: "3+", wounds: 2 })],
	models: [
		{
			name: "Gunner",
			count: 5,
			rangedWeapons: [
				makeWeapon({
					name: "Heavy bolter",
					attacks: "3",
					str: "5",
					ap: "-1",
					damage: "2",
					type: "[SUSTAINED HITS 1]",
				}),
				makeWeapon({
					name: "Frag launcher",
					attacks: "D6",
					str: "4",
					damage: "1",
					type: "[BLAST]",
				}),
			],
			meleeWeapons: [],
		},
	],
});

describe("exact engine vs Monte-Carlo — spill across allocation groups", () => {
	const pairs = {
		"boltguns vs mixed squad": [boltgunSquad, mixedSquad],
		"heavy weapons vs mixed squad": [heavySquad, mixedSquad],
		"heavy weapons vs veterans": [heavySquad, veterans],
		"boltguns vs veterans": [boltgunSquad, veterans],
	};
	for (const [name, [attacker, defender]] of Object.entries(pairs)) {
		it(name, () => {
			const pairing = resolveUnitVsUnit(attacker, defender);
			const sim = simulatePairing(pairing, {
				trials: TRIALS,
				seed: 3,
				rounds: 1,
			});
			expectAgreement(pairing.totals, sim, name);
		});
	}
});
