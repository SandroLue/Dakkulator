import { describe, expect, it } from "vitest";
import { matchAbility, normalizeAbilityText } from "./abilityRules";
import { normalizeModifier } from "./modifiers";

// Phrasings follow the structure of real ability templates, in our own words.
const one = (text) => {
	const results = matchAbility(text);
	expect(results).toHaveLength(1);
	return results[0];
};

describe("normalizeAbilityText", () => {
	it("drops keyword markup and odd hyphens", () => {
		expect(
			normalizeAbilityText("Targets a **^^Monster^^** unit with ‑1 D"),
		).toBe("targets a monster unit with -1 d");
	});
});

describe("matchAbility: attacks made by the unit", () => {
	it("reads re-rolls", () => {
		expect(
			one(
				"Each time a model in this unit makes an attack, re-roll a Hit roll of 1.",
			).modifier,
		).toMatchObject({ role: "attacking", phase: "any", rerollHits: "ones" });
		expect(
			one(
				"Each time this model makes an attack, you can re-roll the Wound roll.",
			).modifier,
		).toMatchObject({ rerollWounds: "all" });
	});

	it("reads roll and characteristic modifiers, and the phase", () => {
		const r = one(
			"Each time a model in this unit makes a melee attack, add 1 to the Hit roll and add 1 to the Wound roll.",
		);
		expect(r.conditional).toBe(false);
		expect(r.modifier).toMatchObject({
			phase: "fight",
			hitModifier: 1,
			woundModifier: 1,
		});
		expect(
			one(
				"Add 1 to the Strength and Attacks characteristics of the bearer's melee weapons.",
			).modifier,
		).toMatchObject({ strengthModifier: 1, attacksModifier: 1 });
	});

	it("reads granted weapon abilities", () => {
		expect(
			one(
				"Ranged weapons equipped by models in this unit have the [LETHAL HITS] and [SUSTAINED HITS 1] abilities.",
			).modifier,
		).toMatchObject({
			phase: "shooting",
			weaponAbilities: "[LETHAL HITS], [SUSTAINED HITS 1]",
		});
	});

	it("reads target keywords, in every spelling", () => {
		expect(
			one(
				"Each time this model makes an attack that targets a MONSTER or VEHICLE unit, add 1 to the Wound roll.",
			).modifier.vsKeywords,
		).toBe("MONSTER, VEHICLE");
		expect(
			one(
				"Each time a ranged attack made by this model targets an enemy INFANTRY unit, improve the Armour Penetration characteristic of that attack by 1.",
			).modifier,
		).toMatchObject({ vsKeywords: "INFANTRY", apModifier: 1 });
		expect(
			one(
				"This model's attacks that target a CHARACTER/MONSTER unit have +1 to wound rolls.",
			).modifier.vsKeywords,
		).toBe("CHARACTER, MONSTER");
		expect(
			one(
				"Each time this model makes a ranged attack that targets a unit that can FLY, add 1 to the Hit roll.",
			).modifier.vsKeywords,
		).toBe("FLY");
	});

	it("applies a leader's ability to the unit it leads", () => {
		const r = one(
			"While this model is leading a unit, each time a model in that unit makes an attack, add 1 to the Wound roll.",
		);
		expect(r.conditional).toBe(false);
		expect(r.modifier).toMatchObject({ role: "attacking", woundModifier: 1 });
	});

	it("ignores eligibility notes on enhancements", () => {
		const r = one(
			"Captain model only. Melee weapons equipped by the bearer have the [LANCE] ability.",
		);
		expect(r.conditional).toBe(false);
		expect(r.modifier.weaponAbilities).toBe("[LANCE]");
	});
});

describe("matchAbility: attacks against the unit", () => {
	it("reads defensive modifiers from the attack's point of view", () => {
		expect(
			one(
				"Each time an attack targets this unit, subtract 1 from the Hit roll.",
			).modifier,
		).toMatchObject({ role: "defending", hitModifier: -1 });
		expect(
			one(
				"Each time an attack is allocated to the bearer, subtract 1 from the Damage characteristic of that attack.",
			).modifier,
		).toMatchObject({ role: "defending", damageModifier: -1 });
		expect(
			one("Melee attacks that target this unit have -1 to hit rolls.").modifier,
		).toMatchObject({
			role: "defending",
			phase: "fight",
			hitModifier: -1,
		});
	});

	it("never gives a defender attack-only effects", () => {
		expect(
			matchAbility(
				"Each time an attack targets this unit, it has the [LETHAL HITS] ability.",
			),
		).toEqual([]);
	});
});

describe("matchAbility: conditions", () => {
	it("marks situational effects conditional, with the reason", () => {
		const r = one(
			"While this unit is within range of an objective marker, each time a model in this unit makes an attack, add 1 to the Hit roll.",
		);
		expect(r.conditional).toBe(true);
		expect(r.reasons).toContain("while");
	});

	it("carries a condition from an earlier sentence", () => {
		const r = one(
			"Once per battle, at the start of the Fight phase, select one of the following. Each time a model in this unit makes an attack, add 1 to the Wound roll.",
		);
		expect(r.conditional).toBe(true);
		expect(r.reasons.some((reason) => reason.startsWith("earlier:"))).toBe(
			true,
		);
	});

	it("does not take a state for a keyword", () => {
		expect(
			one(
				"Each time this model makes an attack that targets a unit that is below its Starting Strength, add 1 to the Hit roll.",
			).conditional,
		).toBe(true);
	});

	it("does not scope an effect to one named weapon", () => {
		expect(
			one(
				"Each time this model makes a ranged attack with its lascannon that targets a VEHICLE unit, that attack has the [DEVASTATING WOUNDS] ability.",
			).conditional,
		).toBe(true);
	});

	it("leaves out effects the engine cannot express", () => {
		expect(
			matchAbility(
				"Each time an attack targets this unit, set the Strength characteristic of that attack to 3.",
			),
		).toEqual([]);
		expect(matchAbility("This model has the Feel No Pain 5+ ability.")).toEqual(
			[],
		);
	});
});

describe("matchAbility output", () => {
	it("is a valid modifier", () => {
		const { modifier } = one(
			"Each time a model in this unit makes a ranged attack that targets a MONSTER unit, re-roll a Wound roll of 1 and improve the Armour Penetration characteristic of that attack by 1.",
		);
		const normalized = normalizeModifier({ ...modifier, name: "Test" });
		for (const [key, value] of Object.entries(modifier)) {
			expect(normalized[key]).toEqual(value);
		}
	});
});

describe("matchAbility: auras", () => {
	it("reads an aura with its effects listed below", () => {
		const results = matchAbility(
			'Friendly ^^**Adeptus Custodes**^^ units (excluding ^^**MONSTER/VEHICLE**^^ units) within 6" of this model can:\n- Re-roll hit rolls of 1\n- Re-roll wound rolls of 1',
		);
		expect(results.map((r) => r.modifier)).toEqual([
			expect.objectContaining({ role: "attacking", rerollHits: "ones" }),
			expect.objectContaining({ role: "attacking", rerollWounds: "ones" }),
		]);
		expect(results.every((r) => r.scope === "list")).toBe(true);
	});

	it("reads an aura that names the unit in range", () => {
		const r = one(
			'While a friendly TYRANIDS unit is within 6" of this model, ranged weapons equipped by models in that unit have the [LETHAL HITS] ability.',
		);
		expect(r.scope).toBe("list");
		expect(r.reasons).not.toContain("that unit");
		expect(r.modifier).toMatchObject({
			phase: "shooting",
			weaponAbilities: "[LETHAL HITS]",
		});
	});

	it("keeps a unit's own ability for that unit", () => {
		expect(
			one(
				"Each time a model in this unit makes an attack, re-roll a Hit roll of 1.",
			).scope,
		).toBe("unit");
	});
});

describe("matchAbility: critical rolls and damage", () => {
	it("reads lowered critical thresholds", () => {
		expect(
			one(
				"Each time a model in this unit makes an attack, a Critical Hit is scored on an unmodified Hit roll of 5+.",
			),
		).toMatchObject({ conditional: false, modifier: { critHitOn: 5 } });
		const r = one(
			"Each time this unit makes a ranged attack, an unmodified successful Wound roll of 5+ scores a Critical Wound, instead of only a 6.",
		);
		expect(r.conditional).toBe(false);
		expect(r.modifier).toMatchObject({ phase: "shooting", critWoundOn: 5 });
	});

	it("reads ignoring wound modifiers and damage re-rolls", () => {
		expect(
			one(
				"Each time a model in this unit makes an attack, you can ignore any or all modifiers to the Wound roll.",
			).modifier,
		).toMatchObject({ ignoreWoundModifiers: true });
		expect(
			one(
				"Each time a model in this unit makes an attack, you can re-roll the Damage roll.",
			).modifier,
		).toMatchObject({ rerollDamage: true });
	});

	it("reads defensive damage reduction", () => {
		expect(
			one(
				"Each time an attack is allocated to a model in this unit, halve the Damage characteristic of that attack.",
			).modifier,
		).toMatchObject({ role: "defending", halveDamage: true });
		expect(
			one(
				"Each time an attack is allocated to this model, change the Damage characteristic of that attack to 1.",
			).modifier,
		).toMatchObject({ role: "defending", damageToOne: true });
	});

	it("does not give an attacker defensive effects", () => {
		expect(
			matchAbility(
				"Each time this unit makes an attack, halve the Damage characteristic of that attack.",
			),
		).toHaveLength(0);
	});
});

describe("matchAbility: army rules by keyword", () => {
	it("scopes attacks of the army's units by keyword", () => {
		const r = one(
			"Each time an Infantry model from your army makes a melee attack, add 1 to the Wound roll.",
		);
		expect(r.scope).toBe("list");
		expect(r.modifier).toMatchObject({
			role: "attacking",
			phase: "fight",
			unitKeywords: "INFANTRY",
			woundModifier: 1,
		});
	});

	it("keeps the defender's keywords out of the target keywords", () => {
		const r = one(
			"Each time a ranged attack targets a Vehicle unit from your army, subtract 1 from the Hit roll.",
		);
		expect(r.scope).toBe("list");
		expect(r.modifier).toMatchObject({
			role: "defending",
			phase: "shooting",
			unitKeywords: "VEHICLE",
			vsKeywords: "",
			hitModifier: -1,
		});
	});

	it("applies to every unit when no keyword is named", () => {
		const r = one(
			"Each time a model from your army makes an attack, re-roll a Hit roll of 1.",
		);
		expect(r.scope).toBe("list");
		expect(r.modifier.unitKeywords).toBeFalsy();
	});

	it("scopes auras by keyword and exclusion", () => {
		const r = one(
			'Friendly Infantry or Mounted units (excluding Monster units) within 6" of this model can re-roll Hit rolls of 1.',
		);
		expect(r.scope).toBe("list");
		expect(r.modifier).toMatchObject({
			unitKeywords: "INFANTRY, MOUNTED",
			excludeUnitKeywords: "MONSTER",
		});
	});
});

describe("matchAbility: short notation", () => {
	it("reads -1AP without a space", () => {
		const r = one("Attacks that target this unit have -1AP.");
		expect(r.conditional).toBe(false);
		expect(r.modifier).toMatchObject({ role: "defending", apModifier: -1 });
	});
});
