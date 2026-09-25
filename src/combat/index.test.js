import { describe, expect, it } from "vitest";
import {
	boltgunSquad,
	fnpHorde,
	marineTarget,
	mixedSquad,
	vehicleTarget,
} from "./__fixtures__/units";
import { calculateMatchup, resolveUnitVsUnit, simulatePairing } from "./index";
import { createModifier } from "./modifiers";

describe("resolveUnitVsUnit", () => {
	it("aggregates every weapon against the chosen allocation group", () => {
		const result = resolveUnitVsUnit(boltgunSquad, marineTarget);
		expect(result.totals.attacks).toBeCloseTo(20, 10);
		expect(result.totals.hits).toBeCloseTo(13.3333, 3);
		expect(result.totals.woundsLost).toBeCloseTo(2.2222, 3);
		expect(result.weapons).toHaveLength(1);
	});

	it("reports rounds to clear and damage efficiency", () => {
		const result = resolveUnitVsUnit(boltgunSquad, marineTarget);
		expect(result.totals.roundsToClear).toBeCloseTo(20 / 2.2222, 2);
		expect(result.totals.damagePer100Points).toBeCloseTo(2.2222, 2);
	});

	it("resolves the fight phase with melee weapons", () => {
		const result = resolveUnitVsUnit(boltgunSquad, marineTarget, {
			phase: "fight",
		});
		expect(result.totals.attacks).toBeCloseTo(30, 10);
		expect(result.weapons[0].weaponName).toBe("Close combat weapon");
	});

	it("resolves unchosen profiles separately without counting them", () => {
		const unit = structuredClone(boltgunSquad);
		unit.models[0].meleeWeapons = [
			...unit.models[0].meleeWeapons,
			{ ...unit.models[0].meleeWeapons[0], name: "Knife", attacks: "1" },
		];
		const base = resolveUnitVsUnit(boltgunSquad, marineTarget, {
			phase: "fight",
		});
		const result = resolveUnitVsUnit(unit, marineTarget, { phase: "fight" });
		expect(result.alternatives.map((w) => w.weaponName)).toEqual(["Knife"]);
		expect(result.alternatives[0].attacks).toBeGreaterThan(0);
		expect(result.totals).toEqual(base.totals);
	});

	it("respects the invulnerable save of a vehicle", () => {
		const result = resolveUnitVsUnit(boltgunSquad, vehicleTarget);
		expect(result.weapons[0].detail.saveTarget).toBe(2);
		expect(result.totals.woundsLost).toBeLessThan(1);
	});

	it("applies the target's Feel No Pain", () => {
		const bare = resolveUnitVsUnit(boltgunSquad, marineTarget);
		const resilient = resolveUnitVsUnit(boltgunSquad, fnpHorde);
		expect(resilient.totals.woundsLost).toBeLessThan(bare.totals.woundsLost);
	});

	it("surfaces abilities the engine does not model", () => {
		const result = resolveUnitVsUnit(boltgunSquad, vehicleTarget);
		expect(result.warnings.unknownWeaponAbilities).toEqual([]);
		expect(Array.isArray(result.warnings.unmodelledDefenderAbilities)).toBe(
			true,
		);
	});

	it("spills attacks onto the next allocation group once one is wiped", () => {
		const result = resolveUnitVsUnit(boltgunSquad, mixedSquad);
		// The 6+ save Grunt is resolved first, then the 5+ save Troopers.
		expect(result.groups.map((g) => g.save)).toEqual(["6+", "5+"]);
		expect(result.weapons.map((w) => w.groupIndex)).toEqual([0, 1]);
		// 20 shots overwhelm the lone Grunt, so most of them carry over.
		expect(result.weapons[1].attacks).toBeGreaterThan(
			result.weapons[0].attacks,
		);
		// The rest find the whole unit already destroyed and are lost.
		const used = result.weapons[0].attacks + result.weapons[1].attacks;
		expect(used).toBeLessThan(20);
		expect(used).toBeGreaterThan(20 * (1 - result.totals.pDestroyed));
		expect(result.totals.modelsSlain).toBeGreaterThan(3);
	});

	it("does not spill when the first group survives", () => {
		const result = resolveUnitVsUnit(boltgunSquad, marineTarget);
		expect(result.weapons).toHaveLength(1);
	});
});

describe("simulatePairing", () => {
	it("agrees with the analytic expectation", () => {
		const pairing = resolveUnitVsUnit(boltgunSquad, marineTarget);
		const sim = simulatePairing(pairing, { trials: 20000, seed: 7 });
		expect(sim.meanWoundsLost).toBeCloseTo(pairing.totals.woundsLost, 1);
		expect(sim.pDestroyed).toBeLessThan(0.01);
		expect(sim.histogram.length).toBeGreaterThan(1);
	});

	it("is reproducible for a given seed", () => {
		const pairing = resolveUnitVsUnit(boltgunSquad, marineTarget);
		const a = simulatePairing(pairing, { trials: 2000, seed: 42 });
		const b = simulatePairing(pairing, { trials: 2000, seed: 42 });
		expect(a.meanWoundsLost).toBe(b.meanWoundsLost);
	});

	it("agrees with the analytic model against a single multi-wound model", () => {
		const pairing = resolveUnitVsUnit(boltgunSquad, vehicleTarget);
		const sim = simulatePairing(pairing, { trials: 20000, seed: 11 });
		expect(sim.meanWoundsLost).toBeCloseTo(pairing.totals.woundsLost, 1);
		expect(sim.meanModelsSlain).toBeCloseTo(pairing.totals.modelsSlain, 1);
	});

	it("carries damage over rounds until the unit is cleared", () => {
		const pairing = resolveUnitVsUnit(boltgunSquad, marineTarget);
		const sim = simulatePairing(pairing, { trials: 5000, seed: 5 });
		expect(sim.clearedBy).toHaveLength(10);
		expect(sim.clearedBy[0]).toBe(sim.pDestroyed);
		for (let i = 1; i < sim.clearedBy.length; i++) {
			expect(sim.clearedBy[i]).toBeGreaterThanOrEqual(sim.clearedBy[i - 1]);
		}
		// 20 wounds at ~2.2 per round.
		expect(sim.medianRounds).toBeGreaterThanOrEqual(8);
		expect(sim.medianRounds).toBeLessThanOrEqual(10);
	});

	it("spills attacks across allocation groups like the analytic model", () => {
		const pairing = resolveUnitVsUnit(boltgunSquad, mixedSquad);
		const sim = simulatePairing(pairing, { trials: 20000, seed: 9 });
		expect(sim.meanModelsSlain).toBeCloseTo(pairing.totals.modelsSlain, 0);
	});
});

describe("calculateMatchup", () => {
	it("caps user-built and context hit modifiers together at ±1", () => {
		const aura = createModifier({
			list: "A",
			role: "attacking",
			hitModifier: -1,
		});
		const curse = createModifier({
			list: "B",
			role: "defending",
			hitModifier: -1,
		});
		const result = resolveUnitVsUnit(
			boltgunSquad,
			marineTarget,
			{ hitModifier: -1 },
			{ modifiers: [aura, curse], attackerList: "A", defenderList: "B" },
		);
		// -3 in total, capped to -1: BS 3+ hits on 4+.
		expect(result.weapons[0].detail.hitTarget).toBe(4);
		expect(result.totals.hits).toBeCloseTo(10, 10);
	});

	it("builds a row per attacker and a cell per defender", () => {
		const result = calculateMatchup(
			[boltgunSquad],
			[marineTarget, vehicleTarget],
		);
		expect(result.rows).toHaveLength(1);
		expect(result.rows[0].cells).toHaveLength(2);
		expect(result.rows[0].cells[0].defenderName).toBe("Marine Target");
	});

	it("memoises identical calls", () => {
		const a = calculateMatchup([boltgunSquad], [marineTarget]);
		const b = calculateMatchup([boltgunSquad], [marineTarget]);
		expect(a).toBe(b);
	});
});
