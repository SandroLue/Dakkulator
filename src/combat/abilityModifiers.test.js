import { describe, expect, it } from "vitest";
import { boltgunSquad, captain } from "./__fixtures__/units";
import { abilityModifiers, mergeAbilityModifiers } from "./abilityModifiers";
import { createModifier } from "./modifiers";

const withAbilities = (unit, abilities, rules = {}) => ({
	...structuredClone(unit),
	abilities: { Abilities: new Map(Object.entries(abilities)) },
	rules: new Map(Object.entries(rules)),
});

// Phrased like real templates, in our own words.
const ARMY_RULE = {
	"Stalwart Host":
		"Each time a model in this unit makes an attack, re-roll a Hit roll of 1.",
};
const roster = {
	forces: [
		{
			catalog: "Test",
			units: [
				withAbilities(
					boltgunSquad,
					{
						"Steady Aim":
							"Each time a model in this unit makes a ranged attack, add 1 to the Hit roll.",
						"Close Guard":
							"While this unit is within range of an objective marker, each time an attack targets this unit, subtract 1 from the Wound roll.",
					},
					ARMY_RULE,
				),
				withAbilities(
					captain,
					{
						"Iron Halo": "This model has the Feel No Pain 5+ ability.",
					},
					ARMY_RULE,
				),
			],
		},
	],
};

describe("abilityModifiers", () => {
	const modifiers = abilityModifiers(roster, "A");
	const byName = (name) => modifiers.filter((m) => m.name === name);

	it("turns unconditional abilities into active modifiers for their unit", () => {
		expect(byName("Steady Aim")).toEqual([
			expect.objectContaining({
				list: "A",
				unitName: "Intercessor Squad",
				role: "attacking",
				phase: "shooting",
				hitModifier: 1,
				enabled: true,
			}),
		]);
	});

	it("adds conditional abilities switched on too", () => {
		expect(byName("Close Guard")).toEqual([
			expect.objectContaining({
				role: "defending",
				woundModifier: -1,
				enabled: true,
			}),
		]);
	});

	it("makes an ability every unit has one list-wide modifier", () => {
		expect(byName("Stalwart Host")).toEqual([
			expect.objectContaining({
				unitName: "",
				rerollHits: "ones",
				enabled: true,
			}),
		]);
	});

	it("leaves out what the engine reads elsewhere", () => {
		expect(byName("Iron Halo")).toEqual([]);
	});
});

describe("mergeAbilityModifiers", () => {
	it("skips modifiers the user already has, whatever their on/off state", () => {
		const generated = abilityModifiers(roster, "A");
		const own = { ...generated[0], id: "mine", enabled: false };
		const extra = createModifier({ name: "Mine", hitModifier: 1 });
		const merged = mergeAbilityModifiers([own, extra], generated);
		expect(merged).toHaveLength(generated.length + 1);
		expect(merged[0]).toBe(own);
		expect(mergeAbilityModifiers(merged, generated)).toBe(merged);
	});
});

describe("abilityModifiers: choices and other units", () => {
	const unit = withAbilities(boltgunSquad, {
		"Battle Stances":
			"At the start of the Fight phase, select one of the following stances for this unit. Swift Stance melee weapons equipped by models in this unit have the [SUSTAINED HITS 1] ability. Iron Stance melee weapons equipped by models in this unit have the [LETHAL HITS] ability.",
		"Rallying Cry (Aura)":
			'While a friendly unit is within 6" of this model, ranged weapons equipped by models in that unit have the [LETHAL HITS] ability.',
		"Damaged: 1-3 Wounds Remaining":
			"While this model has 1-3 wounds remaining, each time this model makes an attack, subtract 1 from the Hit roll.",
	});
	const modifiers = abilityModifiers(
		{ forces: [{ catalog: "Test", units: [unit] }] },
		"A",
	);

	it("adds each option of a choice switched off, under its own name", () => {
		expect(
			modifiers
				.filter((m) => m.name.startsWith("Battle Stances"))
				.map((m) => [m.name, m.weaponAbilities, m.enabled]),
		).toEqual([
			["Battle Stances – Swift Stance", "[SUSTAINED HITS 1]", false],
			["Battle Stances – Iron Stance", "[LETHAL HITS]", false],
		]);
	});

	it("applies auras to the whole list and leaves out rules the engine handles", () => {
		const aura = modifiers.find((m) => m.name === "Rallying Cry (Aura)");
		expect(aura).toMatchObject({
			unitName: "",
			phase: "shooting",
			weaponAbilities: "[LETHAL HITS]",
		});
		expect(modifiers.map((m) => m.name)).not.toContain(
			"Damaged: 1-3 Wounds Remaining",
		);
	});
});
