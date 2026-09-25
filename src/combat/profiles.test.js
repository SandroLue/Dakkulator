import { describe, expect, it } from "vitest";
import {
	boltgunSquad,
	fnpHorde,
	makeWeapon,
	marineTarget,
	vehicleTarget,
} from "./__fixtures__/units";
import {
	buildAttackerProfiles,
	buildDefenderProfiles,
	getGroupTotalWounds,
	mineUnitAbilities,
} from "./profiles";

describe("buildAttackerProfiles", () => {
	it("builds one profile per carrier model and ranged weapon", () => {
		const profiles = buildAttackerProfiles(boltgunSquad, "shooting");
		expect(profiles).toHaveLength(1);
		expect(profiles[0]).toMatchObject({
			weaponName: "Boltgun",
			count: 10,
			skill: 3,
			strength: 4,
			ap: 0,
			damage: "1",
		});
	});

	it("collapses a weapon's firing modes to the strongest profile", () => {
		const unit = structuredCloneUnit(boltgunSquad);
		unit.models[0].rangedWeapons = [
			makeWeapon({
				name: "Missile launcher – frag",
				attacks: "D6",
				str: "4",
				ap: "0",
				damage: "1",
			}),
			makeWeapon({
				name: "Missile launcher – krak",
				attacks: "1",
				str: "9",
				ap: "2",
				damage: "D6",
			}),
			makeWeapon({ name: "Multi-melta", attacks: "2", str: "9", damage: "D6" }),
		];
		const profiles = buildAttackerProfiles(unit, "shooting");
		expect(profiles.map((p) => p.weaponName)).toEqual([
			"Missile launcher – krak",
			"Multi-melta",
		]);
		expect(profiles.alternatives.map((p) => p.weaponName)).toEqual([
			"Missile launcher – frag",
		]);
	});

	it("uses the carrier's WS in the fight phase", () => {
		const profiles = buildAttackerProfiles(boltgunSquad, "fight");
		expect(profiles).toHaveLength(1);
		expect(profiles[0]).toMatchObject({
			weaponName: "Close combat weapon",
			isMelee: true,
			skill: 3,
			count: 10,
		});
	});

	it("picks one melee weapon per model plus every [EXTRA ATTACKS] weapon", () => {
		const unit = structuredCloneUnit(boltgunSquad);
		unit.models[0].meleeWeapons = [
			{
				name: "Chainsword",
				count: 1,
				range: "Melee",
				attacks: "4",
				str: "4",
				ap: "0",
				damage: "1",
				type: "",
			},
			{
				name: "Power fist",
				count: 1,
				range: "Melee",
				attacks: "3",
				str: "8",
				ap: "-2",
				damage: "2",
				type: "",
			},
			{
				name: "Storm shield",
				count: 1,
				range: "Melee",
				attacks: "1",
				str: "4",
				ap: "0",
				damage: "1",
				type: "[EXTRA ATTACKS]",
			},
		];
		const profiles = buildAttackerProfiles(unit, "fight");
		const names = profiles.map((p) => p.weaponName).sort();
		expect(names).toEqual(["Power fist", "Storm shield"]);
		expect(profiles.alternatives.map((p) => p.weaponName)).toEqual([
			"Chainsword",
		]);
	});
});

describe("buildDefenderProfiles", () => {
	it("builds one allocation group per distinct (W, Sv, InSv)", () => {
		const groups = buildDefenderProfiles(marineTarget);
		expect(groups).toHaveLength(1);
		expect(groups[0]).toMatchObject({
			toughness: 4,
			save: "3+",
			wounds: 2,
			count: 10,
		});
		expect(getGroupTotalWounds(groups)).toBe(20);
	});

	it("carries the invulnerable save and keywords", () => {
		const [group] = buildDefenderProfiles(vehicleTarget);
		expect(group).toMatchObject({
			toughness: 10,
			save: "2+",
			invuln: "4+",
			wounds: 12,
			count: 1,
		});
		expect(group.keywords.has("VEHICLE")).toBe(true);
	});

	it("mines Feel No Pain onto the group", () => {
		const [group] = buildDefenderProfiles(fnpHorde);
		expect(group.fnp).toBe(5);
	});
});

describe("mineUnitAbilities", () => {
	it("finds Feel No Pain", () => {
		expect(mineUnitAbilities(fnpHorde).fnp).toBe(5);
	});

	it("does not apply a Feel No Pain that is restricted to certain damage", () => {
		const unit = structuredCloneUnit(fnpHorde);
		unit.abilities.Abilities = new Map([
			[
				"Daughters of the Abyss",
				"Models in this unit have the Feel No Pain 3+ ability against Psychic Attacks and mortal wounds.",
			],
		]);
		const mined = mineUnitAbilities(unit);
		expect(mined.fnp).toBe(null);
		expect(mined.unmodelled).toContain("Daughters of the Abyss");
	});

	it("ignores the Feel No Pain glossary entry", () => {
		const unit = structuredCloneUnit(fnpHorde);
		unit.abilities.Abilities = new Map([
			[
				"Feel No Pain",
				"This ability always takes the form Feel No Pain X+. Each time a model with this ability would lose a wound, roll one D6: on an X+, that wound is not lost.",
			],
		]);
		const mined = mineUnitAbilities(unit);
		expect(mined.fnp).toBe(null);
		expect(mined.unmodelled).not.toContain("Feel No Pain");
	});

	it("finds the Damaged trigger range", () => {
		expect(mineUnitAbilities(vehicleTarget).damaged).toEqual({
			min: 1,
			max: 4,
		});
	});

	it("lists abilities it does not model", () => {
		const unit = structuredCloneUnit(fnpHorde);
		unit.abilities.Abilities.set("Nurgle's Gift", "Something bespoke.");
		expect(mineUnitAbilities(unit).unmodelled).toContain("Nurgle's Gift");
	});
});

/** `structuredClone` cannot copy Maps-in-plain-objects predictably here. */
function structuredCloneUnit(unit) {
	const abilities = {};
	for (const [group, map] of Object.entries(unit.abilities)) {
		abilities[group] = new Map(map);
	}
	return {
		...unit,
		abilities,
		keywords: new Set(unit.keywords),
		models: unit.models.map((m) => ({
			...m,
			rangedWeapons: [...(m.rangedWeapons || [])],
			meleeWeapons: [...(m.meleeWeapons || [])],
		})),
		modelStats: unit.modelStats.map((s) => ({ ...s })),
	};
}
