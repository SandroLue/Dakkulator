import { describe, expect, it } from "vitest";
import { engineInputs, scenarioGenerator } from "./__fixtures__/scenarios";
import { pmf } from "./diceExpr";
import {
	allocateAttacks,
	computeAttackStreams,
	lossDistribution,
	resolveWeaponVsGroup,
} from "./resolve";

const EPS = 1e-9;
const SCENARIOS = 150;

function resolve(sc) {
	const { profile, group, ctx } = engineInputs(sc);
	return resolveWeaponVsGroup(profile, group, ctx);
}

function forEachScenario(seed, check) {
	const next = scenarioGenerator(seed);
	for (let i = 0; i < SCENARIOS; i++) {
		const sc = next();
		check(sc, JSON.stringify(sc));
	}
}

describe("bounds", () => {
	it("keeps every metric inside what is physically possible", () => {
		forEachScenario(11, (sc, label) => {
			const r = resolve(sc);
			// Expected damage per attack, after re-rolls, halving and the like.
			const damage =
				r.damagePmf.reduce((sum, p, value) => sum + p * value, 0) || 1;
			expect(r.pDestroyed, label).toBeGreaterThanOrEqual(-EPS);
			expect(r.pDestroyed, label).toBeLessThanOrEqual(1 + EPS);
			expect(r.modelsSlain, label).toBeLessThanOrEqual(sc.count + EPS);
			expect(r.woundsLost, label).toBeLessThanOrEqual(
				sc.count * sc.wounds + EPS,
			);
			// Damage is capped per model and reduced by Feel No Pain, never increased.
			expect(r.woundsLost, label).toBeLessThanOrEqual(
				(r.failedSaves + r.mortalWounds) * Math.max(damage, 1) + EPS,
			);
			// Each damaging attack destroys at most one model.
			expect(r.modelsSlain, label).toBeLessThanOrEqual(
				r.failedSaves + r.mortalWounds + EPS,
			);
			expect(r.woundsLost, label).toBeGreaterThanOrEqual(
				r.modelsSlain * sc.wounds - EPS,
			);
			expect(r.pDestroyed, label).toBeLessThanOrEqual(
				r.modelsSlain / sc.count + EPS,
			);
			expect(r.hits, label).toBeLessThanOrEqual(r.attacks * 4 + EPS);
			expect(r.failedSaves + r.mortalWounds, label).toBeLessThanOrEqual(
				r.wounds + EPS,
			);
		});
	});
});

describe("probability mass is conserved", () => {
	it("in dice, loss and target-state distributions", () => {
		const sum = (values) => [...values].reduce((a, b) => a + b, 0);
		for (const expr of ["1", "D3", "D6+2", "2D6", "3D3-2"]) {
			expect(sum(pmf(expr, 1))).toBeCloseTo(1, 12);
			for (const fnp of [null, 4, 5, 6]) {
				expect(sum(lossDistribution(pmf(expr, 1), fnp))).toBeCloseTo(1, 12);
			}
		}
		forEachScenario(12, (sc, label) => {
			const { profile, group, ctx } = engineInputs(sc);
			const streams = computeAttackStreams(profile, group, ctx);
			const { state } = allocateAttacks([[streams]], [group]);
			expect(sum(state), label).toBeCloseTo(1, 9);
		});
	});
});

describe("monotonicity — a better attack never does less", () => {
	const better = {
		"better BS": (sc) => ({ ...sc, skill: Math.max(2, sc.skill - 1) }),
		"+1 AP": (sc) => ({ ...sc, ap: sc.ap + 1 }),
		"+1 Strength": (sc) => ({ ...sc, strength: sc.strength + 1 }),
		"worse save": (sc) => ({ ...sc, save: Math.min(7, sc.save + 1) }),
		"no Feel No Pain": (sc) => ({ ...sc, fnp: null }),
		"re-roll all hits": (sc) => ({ ...sc, rerollHits: "all" }),
		"re-roll all wounds": (sc) => ({ ...sc, rerollWounds: "all" }),
		"[TWIN-LINKED]": (sc) => ({ ...sc, twinLinked: true }),
		"one more weapon": (sc) => ({ ...sc, models: sc.models + 1 }),
		"+1 hit roll": (sc) => ({ ...sc, hitModifier: sc.hitModifier + 1 }),
		"+1 wound roll": (sc) => ({ ...sc, woundModifier: sc.woundModifier + 1 }),
		"no cover": (sc) => ({ ...sc, cover: false }),
		// Not with [DEVASTATING WOUNDS]: skipping the wound roll can lose a critical wound.
		"[LETHAL HITS]": (sc) => ({ ...sc, lethal: !sc.devastating || sc.lethal }),
		"[SUSTAINED HITS 1]": (sc) =>
			sc.sustained === "0" ? { ...sc, sustained: "1" } : sc,
		"more damage": (sc) => ({
			...sc,
			damage: sc.damage === "1" ? "2" : sc.damage,
		}),
		"critical hits on 5+": (sc) => ({
			...sc,
			critHitOn: Math.min(sc.critHitOn ?? 6, 5),
		}),
		"critical wounds on 5+": (sc) => ({
			...sc,
			critWoundOn: Math.min(sc.critWoundOn ?? 6, 5),
		}),
		"[DEVASTATING WOUNDS]": (sc) => ({ ...sc, devastating: true }),
		// A re-rolled low damage roll is never worse than the roll it replaces.
		"re-roll damage": (sc) => ({ ...sc, rerollDamage: true }),
		"no halved damage": (sc) => ({ ...sc, halveDamage: false }),
		"no 'damage becomes 1'": (sc) => ({ ...sc, damageToOne: false }),
		"no Feel No Pain against mortal wounds": (sc) => ({
			...sc,
			mortalFnp: null,
		}),
	};
	// Re-rolling every failed hit gives a worse hit roll more chances at a
	// critical hit; with [LETHAL HITS] or [SUSTAINED HITS] that can be worth more
	// than the extra hits, so a better hit roll may genuinely do slightly less.
	const critFishing = (sc) =>
		sc.rerollHits === "all" && (sc.lethal || sc.sustained !== "0");
	// With [LETHAL HITS], a critical hit wounds automatically and so can no
	// longer roll a critical wound: with [DEVASTATING WOUNDS] that can cost more.
	const lethalSkipsDevastating = (sc) => sc.lethal && sc.devastating;
	// A mortal wound skips the save but meets the Feel No Pain "against mortal
	// wounds"; a failed save does not, so the mortal wound can do less.
	const mortalFnp = (sc) => sc.mortalFnp != null;
	const exceptions = {
		"better BS": critFishing,
		"+1 hit roll": critFishing,
		"critical hits on 5+": lethalSkipsDevastating,
		"critical wounds on 5+": (sc) => sc.devastating && mortalFnp(sc),
		"[DEVASTATING WOUNDS]": mortalFnp,
	};
	for (const [name, improve] of Object.entries(better)) {
		it(name, () => {
			forEachScenario(13, (sc, label) => {
				if (exceptions[name]?.(sc)) return;
				const base = resolve(sc);
				const improved = resolve(improve(sc));
				for (const metric of ["woundsLost", "modelsSlain", "pDestroyed"]) {
					expect(improved[metric], `${metric} ${label}`).toBeGreaterThanOrEqual(
						base[metric] - EPS,
					);
				}
			});
		});
	}
});

describe("structural invariants", () => {
	it("scales expected counts linearly with the number of weapons", () => {
		forEachScenario(14, (sc, label) => {
			const one = resolve({ ...sc, models: 1 });
			const three = resolve({ ...sc, models: 3 });
			for (const metric of [
				"attacks",
				"hits",
				"wounds",
				"critWounds",
				"mortalWounds",
				"failedSaves",
			]) {
				expect(three[metric], `${metric} ${label}`).toBeCloseTo(
					3 * one[metric],
					9,
				);
			}
		});
	});

	it("gives the same result for 4 weapons or 2 + 2 identical weapons", () => {
		forEachScenario(15, (sc, label) => {
			const { profile, group, ctx } = engineInputs({ ...sc, models: 4 });
			const four = computeAttackStreams(profile, group, ctx);
			const two = computeAttackStreams({ ...profile, count: 2 }, group, ctx);
			const a = allocateAttacks([[four]], [group]);
			const b = allocateAttacks([[two], [two]], [group]);
			expect(b.woundsLost, label).toBeCloseTo(a.woundsLost, 9);
			expect(b.pDestroyed, label).toBeCloseTo(a.pDestroyed, 9);
		});
	});

	it("does not depend on weapon order against single-wound models", () => {
		const next = scenarioGenerator(16);
		for (let i = 0; i < SCENARIOS; i++) {
			const first = { ...next(), wounds: 1, fnp: null };
			const second = {
				...next(),
				wounds: 1,
				fnp: null,
				count: first.count,
				blast: 0,
			};
			const { group } = engineInputs({ ...first, blast: 0 });
			const streams = [first, second].map((sc) => {
				const { profile, ctx } = engineInputs({ ...sc, blast: 0 });
				return computeAttackStreams(profile, group, ctx);
			});
			const ab = allocateAttacks([[streams[0]], [streams[1]]], [group]);
			const ba = allocateAttacks([[streams[1]], [streams[0]]], [group]);
			expect(ba.woundsLost).toBeCloseTo(ab.woundsLost, 9);
			expect(ba.pDestroyed).toBeCloseTo(ab.pDestroyed, 9);
		}
	});
});
