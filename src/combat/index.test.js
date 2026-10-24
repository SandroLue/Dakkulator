import { describe, expect, it } from "vitest";
import {
	boltgunSquad,
	fnpHorde,
	makeModelStats,
	makeUnit,
	makeWeapon,
	marineTarget,
	mixedSquad,
	vehicleTarget,
} from "./__fixtures__/units";
import {
	calculateMatchup,
	resolveUnitVsUnit,
	simulatePairing,
	sustainedHitsValue,
} from "./index";
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
		// 2.2222 of 20 wounds on a 100-point target, bought with 100 points.
		expect(result.totals.pointsRemoved).toBeCloseTo(11.111, 2);
		expect(result.totals.pointsReturnPer100).toBeCloseTo(11.111, 2);
	});

	it("grants the 'apply to all' abilities to every weapon", () => {
		const lethal = resolveUnitVsUnit(boltgunSquad, marineTarget, {
			allLethalHits: true,
		});
		const critHits = 20 / 6;
		expect(lethal.totals.wounds).toBeCloseTo(
			(13.3333 - critHits) * 0.5 + critHits,
			3,
		);
		expect(lethal.weapons[0].abilities.lethalHits).toBe(true);
		expect(lethal.weapons[0].baseAbilities.lethalHits).toBe(false);

		const sustained = resolveUnitVsUnit(boltgunSquad, marineTarget, {
			allSustainedHits: 2,
		});
		expect(sustained.totals.hits).toBeCloseTo(13.3333 + 2 * critHits, 3);

		const devastating = resolveUnitVsUnit(boltgunSquad, marineTarget, {
			allDevastatingWounds: true,
		});
		expect(devastating.totals.mortalWounds).toBeCloseTo(13.3333 / 6, 3);
	});

	it("reads 'apply to all' Sustained Hits as a number or dice", () => {
		expect(sustainedHitsValue(0)).toBe(null);
		expect(sustainedHitsValue("")).toBe(null);
		expect(sustainedHitsValue("0")).toBe(null);
		expect(sustainedHitsValue(2)).toBe("2");
		expect(sustainedHitsValue(" d3 ")).toBe("D3");
		expect(sustainedHitsValue("2D6")).toBe("2D6");
		expect(sustainedHitsValue("D")).toBe(null);
		expect(sustainedHitsValue("100")).toBe("100");
		expect(sustainedHitsValue("101")).toBe(null);
		expect(sustainedHitsValue("10D6")).toBe("10D6");
		expect(sustainedHitsValue("11D6")).toBe(null);
		expect(sustainedHitsValue("1D3")).toBe("D3");
		expect(sustainedHitsValue("D20")).toBe(null);

		const d3 = resolveUnitVsUnit(boltgunSquad, marineTarget, {
			allSustainedHits: "D3",
		});
		const two = resolveUnitVsUnit(boltgunSquad, marineTarget, {
			allSustainedHits: 2,
		});
		// D3 averages 2 extra hits per critical hit.
		expect(d3.totals.hits).toBeCloseTo(two.totals.hits, 6);
	});

	it("gives every defender the 'apply to all' Feel No Pain and invulnerable save", () => {
		const plain = resolveUnitVsUnit(boltgunSquad, marineTarget, {});
		const fnp = resolveUnitVsUnit(boltgunSquad, marineTarget, { allFnp: 5 });
		// A 5+ Feel No Pain stops a third of the damage.
		expect(fnp.totals.woundsLost).toBeCloseTo(
			(plain.totals.woundsLost * 2) / 3,
			6,
		);
		expect(fnp.appliedModifiers ?? []).not.toContain("Apply to all");

		const invuln = resolveUnitVsUnit(boltgunSquad, marineTarget, {
			allInvuln: 2,
		});
		expect(invuln.totals.woundsLost).toBeLessThan(plain.totals.woundsLost);
	});

	it("opting out of [LETHAL HITS] overrides 'apply to all'", () => {
		const result = resolveUnitVsUnit(boltgunSquad, marineTarget, {
			allLethalHits: true,
			useLethalHits: false,
		});
		expect(result.totals.wounds).toBeCloseTo(6.6667, 3);
	});

	it("'Shooting + Fight' resolves shooting, then fighting, against one unit", () => {
		const shoot = resolveUnitVsUnit(boltgunSquad, marineTarget, {
			phase: "shooting",
		});
		const fight = resolveUnitVsUnit(boltgunSquad, marineTarget, {
			phase: "fight",
		});
		const both = resolveUnitVsUnit(boltgunSquad, marineTarget, {
			phase: "combined",
		});
		const names = (r) => r.weapons.map((w) => w.weaponName);
		expect(names(both)).toEqual([...names(shoot), ...names(fight)]);
		expect(both.totals.declaredAttacks).toBeCloseTo(50, 6);
		expect(both.totals.hits).toBeCloseTo(
			shoot.totals.hits + fight.totals.hits,
			3,
		);
		expect(both.totals.woundsLost).toBeGreaterThan(fight.totals.woundsLost);
		expect(both.totals.woundsLost).toBeLessThanOrEqual(
			shoot.totals.woundsLost + fight.totals.woundsLost + 1e-9,
		);
		expect(both.totals.pDestroyed).toBeGreaterThanOrEqual(
			Math.max(shoot.totals.pDestroyed, fight.totals.pDestroyed),
		);
	});

	it("'Shooting + Fight' applies phase-specific modifiers to their phase only", () => {
		const options = {
			modifiers: [
				createModifier({ list: "A", phase: "shooting", hitModifier: 1 }),
			],
			attackerList: "A",
			defenderList: "B",
		};
		const shoot = resolveUnitVsUnit(
			boltgunSquad,
			marineTarget,
			{ phase: "shooting" },
			options,
		);
		const fight = resolveUnitVsUnit(
			boltgunSquad,
			marineTarget,
			{ phase: "fight" },
			options,
		);
		const both = resolveUnitVsUnit(
			boltgunSquad,
			marineTarget,
			{ phase: "combined" },
			options,
		);
		expect(both.totals.hits).toBeCloseTo(
			shoot.totals.hits + fight.totals.hits,
			3,
		);
		expect(both.appliedModifiers).toHaveLength(1);
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

	it("picks the firing mode that does the most against each target", () => {
		const unit = structuredClone(boltgunSquad);
		// Krak scores higher on A × S × D, but frag removes more of a 1-wound horde.
		unit.models[0].rangedWeapons = [
			{
				...unit.models[0].rangedWeapons[0],
				name: "Launcher - frag",
				attacks: "6",
				str: "4",
				ap: "0",
				damage: "1",
			},
			{
				...unit.models[0].rangedWeapons[0],
				name: "Launcher - krak",
				attacks: "1",
				str: "9",
				ap: "-2",
				damage: "D6",
			},
		];
		const vsHorde = resolveUnitVsUnit(unit, fnpHorde);
		const vsTank = resolveUnitVsUnit(unit, vehicleTarget);
		expect(vsHorde.weapons[0].weaponName).toBe("Launcher - frag");
		expect(vsHorde.alternatives.map((w) => w.weaponName)).toEqual([
			"Launcher - krak",
		]);
		expect(vsTank.weapons[0].weaponName).toBe("Launcher - krak");
		expect(vsTank.alternatives.map((w) => w.weaponName)).toEqual([
			"Launcher - frag",
		]);
		// The alternative did less on its own than the chosen profile.
		expect(vsTank.alternatives[0].woundsLost).toBeLessThan(
			vsTank.totals.woundsLost,
		);
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
		// The breakdown still shows the 20 declared shots, split across groups.
		expect(result.totals.declaredAttacks).toBeCloseTo(20, 10);
		expect(result.weapons[1].declaredAttacks).toBeGreaterThan(
			result.weapons[1].attacks,
		);
		// Each row's wounds lost adds up to the unit's.
		const rowsLost = result.weapons.reduce((sum, w) => sum + w.woundsLost, 0);
		expect(rowsLost).toBeCloseTo(result.totals.woundsLost, 10);
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

	it("does not reuse results for a different unit with the same name and points", () => {
		// Same datasheet and cost, better wargear: every Boltgun deals 2 damage.
		const upgraded = structuredClone(boltgunSquad);
		const visit = (node) => {
			if (!node || typeof node !== "object") return;
			if (node.name === "Boltgun" && "damage" in node) node.damage = "2";
			for (const value of Object.values(node)) visit(value);
		};
		visit(upgraded);
		const plain = calculateMatchup([boltgunSquad], [marineTarget]);
		const better = calculateMatchup([upgraded], [marineTarget]);
		expect(better.rows[0].cells[0].totals.woundsLost).toBeGreaterThan(
			plain.rows[0].cells[0].totals.woundsLost,
		);
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

describe("the breakdown's potential: every attack, overkill included", () => {
	// Ten boltguns (20 shots) into a 2-model W2 unit: dead long before the last shot.
	const fragile = {
		...marineTarget,
		models: [{ ...marineTarget.models[0], count: 2 }],
	};

	it("shows each weapon once, with all its attacks", () => {
		const real = resolveUnitVsUnit(boltgunSquad, fragile);
		const full = resolveUnitVsUnit(
			boltgunSquad,
			fragile,
			{},
			{ potential: true },
		);
		expect(full.weapons).toHaveLength(1);
		expect(full.weapons[0].attacks).toBeCloseTo(20, 9);
		expect(full.weapons[0].declaredAttacks).toBeCloseTo(20, 9);
		// BS3+: every attack rolls, so two thirds hit.
		expect(full.weapons[0].hits).toBeCloseTo(20 * (4 / 6), 9);
		expect(real.weapons[0].hits).toBeLessThan(full.weapons[0].hits);
	});

	it("keeps the real result in the totals and adds the overkill", () => {
		const real = resolveUnitVsUnit(boltgunSquad, fragile);
		const full = resolveUnitVsUnit(
			boltgunSquad,
			fragile,
			{},
			{ potential: true },
		);
		for (const key of ["woundsLost", "modelsSlain", "pDestroyed"]) {
			expect(full.totals[key]).toBeCloseTo(real.totals[key], 12);
		}
		expect(full.totals.potentialWoundsLost).toBeGreaterThan(
			real.totals.woundsLost,
		);
		expect(full.weapons.reduce((sum, w) => sum + w.woundsLost, 0)).toBeCloseTo(
			full.totals.potentialWoundsLost,
			9,
		);
	});

	it("covers every group a weapon reaches in one row", () => {
		const full = resolveUnitVsUnit(
			boltgunSquad,
			mixedSquad,
			{},
			{ potential: true },
		);
		const names = full.weapons.map((w) => w.weaponName);
		expect(new Set(names).size).toBe(names.length);
		expect(full.weapons[0].targetGroups.length).toBeGreaterThanOrEqual(1);
		expect(full.weapons[0].attacks).toBeCloseTo(20, 9);
	});

	it("agrees with the Monte-Carlo's overkill", () => {
		const full = resolveUnitVsUnit(
			boltgunSquad,
			fragile,
			{},
			{ potential: true },
		);
		const sim = simulatePairing(full, { trials: 20000, seed: 5, rounds: 1 });
		let square = 0;
		for (const { value, probability } of sim.potentialHistogram) {
			square += value * value * probability;
		}
		const se = Math.sqrt(
			Math.max(square - sim.meanPotentialWoundsLost ** 2, 1e-4) / 20000,
		);
		expect(
			Math.abs(full.totals.potentialWoundsLost - sim.meanPotentialWoundsLost),
		).toBeLessThanOrEqual(4.5 * se);
	});
});

describe("close-quarters weapons (§24.27)", () => {
	// A model with a pistol and a heavier gun shoots one or the other.
	const pistol = makeWeapon({
		name: "Pistol",
		attacks: "6",
		str: "4",
		ap: "0",
		damage: "1",
		type: "Pistol",
	});
	const gun = makeWeapon({
		name: "Melta",
		attacks: "1",
		str: "9",
		ap: "-4",
		damage: "D6",
	});
	const shooter = (keywords = ["INFANTRY"]) =>
		makeUnit({
			name: "Shooters",
			keywords,
			modelStats: [makeModelStats({ name: "Shooter", bs: "3+" })],
			models: [
				{
					name: "Shooter",
					count: 3,
					rangedWeapons: [pistol, gun],
					meleeWeapons: [],
				},
			],
		});
	const names = (result) => result.weapons.map((w) => w.weaponName);

	it("shoots the side that does more and lists the other as an alternative", () => {
		// Against a tank the melta is worth more than six pistol shots.
		const vsTank = resolveUnitVsUnit(shooter(), vehicleTarget);
		expect(names(vsTank)).toEqual(["Melta"]);
		expect(vsTank.alternatives.map((w) => w.weaponName)).toContain("Pistol");
		// Against a horde of one-wound models, six shots are worth more.
		const vsHorde = resolveUnitVsUnit(shooter(), fnpHorde);
		expect(names(vsHorde)).toEqual(["Pistol"]);
	});

	it("lets MONSTER and VEHICLE models shoot both", () => {
		const both = resolveUnitVsUnit(shooter(["VEHICLE"]), vehicleTarget);
		expect(names(both).sort()).toEqual(["Melta", "Pistol"]);
	});
});

describe("[ONE SHOT] weapons fire once per battle", () => {
	const missile = makeWeapon({
		name: "Missile",
		attacks: "1",
		str: "14",
		ap: "-3",
		damage: "D6",
		type: "One Shot",
	});
	const rifle = makeWeapon({
		name: "Rifle",
		attacks: "2",
		str: "5",
		ap: "-1",
		damage: "2",
	});
	const carrier = (weapons) =>
		makeUnit({
			name: "Carrier",
			modelStats: [makeModelStats({ name: "Carrier", bs: "3+" })],
			models: [
				{ name: "Carrier", count: 3, rangedWeapons: weapons, meleeWeapons: [] },
			],
		});

	it("count in the first round only when estimating rounds to clear", () => {
		const both = resolveUnitVsUnit(carrier([missile, rifle]), vehicleTarget);
		const t = both.totals;
		// Every round as good as the first would be total / woundsLost.
		expect(t.roundsToClear).toBeGreaterThan(12 / t.woundsLost);
		// Missiles alone: once they are gone, nothing is left to finish the job.
		const alone = resolveUnitVsUnit(carrier([missile]), vehicleTarget);
		expect(alone.totals.pDestroyed).toBeLessThan(1);
		expect(alone.totals.roundsToClear).toBe(Number.POSITIVE_INFINITY);
	});

	it("fire in the first round of the Monte-Carlo, never again", () => {
		const alone = resolveUnitVsUnit(carrier([missile]), vehicleTarget);
		const sim = simulatePairing(alone, { trials: 4000, seed: 3, rounds: 5 });
		expect(sim.clearedBy[0]).toBeGreaterThan(0);
		// No more kills after the first round.
		expect(sim.clearedBy.at(-1)).toBe(sim.clearedBy[0]);
	});
});
