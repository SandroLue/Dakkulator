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

describe("matchAbility: effects on enemy units", () => {
	it("turns an effect on a cursed enemy into a defence for the owner's list", () => {
		const r = one(
			'While an enemy unit is within 6" of this unit, it is Cursed. Each time a model in this unit makes a melee attack, subtract 1 from the Hit roll.',
		);
		// The enemy's melee attacks are worse: your units are harder to hit.
		expect(r.scope).toBe("list");
		expect(r.reasons).toContain("enemy unit");
		expect(r.modifier).toMatchObject({
			role: "defending",
			phase: "fight",
			hitModifier: -1,
		});
	});

	it("still reads the owner's attacks against a selected enemy unit", () => {
		expect(
			one(
				"Select one enemy unit visible to this unit. Each time a model in this unit makes an attack that targets that unit, re-roll a Hit roll of 1.",
			).modifier,
		).toMatchObject({ rerollHits: "ones" });
	});
});

describe("matchAbility: the bearer's own models", () => {
	it("limits the bearer and this model to their own models", () => {
		expect(
			one(
				"Each time the bearer makes a melee attack, an unmodified Hit roll of 5+ scores a Critical Hit.",
			).modifier,
		).toMatchObject({ critHitOn: 5, ownModelsOnly: true });
		expect(
			one(
				"Each time an attack is allocated to this model, subtract 1 from the Damage characteristic of that attack.",
			).modifier.ownModelsOnly,
		).toBe(true);
	});

	it("keeps abilities for the led unit unit-wide", () => {
		expect(
			one(
				"While this model is leading a unit, each time a model in this unit makes an attack, re-roll a Hit roll of 1.",
			).modifier.ownModelsOnly,
		).toBeUndefined();
		expect(
			one(
				"Each time a model in the bearer's unit makes an attack, add 1 to the Wound roll.",
			).modifier.ownModelsOnly,
		).toBeUndefined();
	});
});

describe("matchAbility: characteristics and Strength vs Toughness", () => {
	it("reads a Strength-vs-Toughness condition as a checkable condition", () => {
		const short = one(
			"Attacks that target this unit with a S greater than this unit's T have -1 to wound rolls.",
		);
		expect(short.conditional).toBe(false);
		expect(short.modifier).toMatchObject({
			role: "defending",
			woundModifier: -1,
			strengthVsToughness: "gt",
		});
		const long = one(
			"Each time a melee attack targets this model, if the Strength characteristic of that attack is less than or equal to the Toughness characteristic of this model, add 1 to the Hit roll.",
		);
		expect(long.modifier).toMatchObject({
			phase: "fight",
			strengthVsToughness: "lte",
		});
	});

	it("reads changes to the unit's own characteristics", () => {
		const t = one(
			"Add 1 to the Toughness characteristic of models in this unit.",
		);
		expect(t.conditional).toBe(false);
		expect(t.modifier).toMatchObject({ role: "defending", toughnessChange: 1 });
		expect(t.modifier.ownModelsOnly).toBeUndefined();
		expect(
			one("Improve the Save characteristic of this model by 1.").modifier,
		).toMatchObject({ saveChange: 1, ownModelsOnly: true });
		expect(one("This model has +2 W.").modifier).toMatchObject({
			woundsChange: 2,
		});
	});

	it("reads army-wide characteristic changes by keyword", () => {
		const r = one(
			"Add 1 to the Toughness characteristic of Beast models from your army.",
		);
		expect(r.scope).toBe("list");
		expect(r.modifier).toMatchObject({
			role: "defending",
			unitKeywords: "BEAST",
			toughnessChange: 1,
		});
	});

	it("changes a picked enemy unit's characteristics for your attacks", () => {
		const r = one(
			"Select one enemy unit. Subtract 1 from the Toughness characteristic of models in that unit.",
		);
		expect(r.reasons).toContain("selected target");
		expect(r.modifier).toMatchObject({
			role: "attacking",
			toughnessChange: -1,
		});
	});

	it("leaves a picked friendly unit's characteristics to that unit", () => {
		expect(
			one(
				"Select one other friendly Beast unit. Add 1 to the Toughness characteristic of models in that unit.",
			).modifier,
		).toMatchObject({ role: "defending", toughnessChange: 1 });
	});
});

describe("matchAbility: the bearer's unit", () => {
	it("reads the bearer's unit as the whole unit", () => {
		expect(
			one(
				"Each time a melee attack targets the bearer's unit, subtract 1 from the Wound roll.",
			).modifier.ownModelsOnly,
		).toBeUndefined();
	});
});

describe("matchAbility: critical hit wording", () => {
	it("reads 'successful unmodified' and the 'unmodifed' typo", () => {
		const r = one(
			"While this model is leading a unit, each time a model in that unit makes a ranged attack, a successful unmodifed Hit roll of 5+ scores a Critical Hit.",
		);
		expect(r.conditional).toBe(false);
		expect(r.modifier).toMatchObject({ phase: "shooting", critHitOn: 5 });
		expect(r.modifier.ownModelsOnly).toBeUndefined();
	});
});

describe("matchAbility: aura exclusions", () => {
	it("reads an exclusion in a 'while a friendly unit is within' aura", () => {
		const r = one(
			'While a friendly Infantry unit (excluding Beast and Swarm units) is within 6" of this model, each time a model in that unit makes an attack, that attack has the [LETHAL HITS] ability.',
		);
		expect(r.scope).toBe("list");
		expect(r.modifier).toMatchObject({
			unitKeywords: "INFANTRY",
			excludeUnitKeywords: "BEAST, SWARM",
			weaponAbilities: "[LETHAL HITS]",
		});
	});
});

describe("matchAbility: auras from one model of the unit, selected friendly units", () => {
	it("reads an aura measured from one model of this unit", () => {
		const r = one(
			"While a friendly Infantry unit (excluding Beast units) is within 6\" of this unit's Overlord model, each time a model in that unit makes an attack, re-roll a Hit roll of 1.",
		);
		expect(r.scope).toBe("list");
		expect(r.modifier).toMatchObject({
			unitKeywords: "INFANTRY",
			excludeUnitKeywords: "BEAST",
			rerollHits: "ones",
		});
	});

	it("gives a selected friendly unit's effect to the units with its keyword", () => {
		const r = one(
			'After this model fights, select one other friendly Beast unit within 6" of it. Until the end of the turn, each time a model in that unit makes an attack, re-roll a Wound roll of 1.',
		);
		expect(r.scope).toBe("list");
		expect(r.reasons).toContain("earlier: select");
		expect(r.modifier).toMatchObject({
			unitKeywords: "BEAST",
			rerollWounds: "ones",
		});
	});
});

describe("matchAbility: more subject shapes", () => {
	it("reads leader abilities phrased with the bearer or a named leader", () => {
		const bearer = one(
			"While the bearer is leading a unit, each time a model in that unit makes a melee attack, add 1 to the Wound roll.",
		);
		expect(bearer.conditional).toBe(false);
		expect(bearer.modifier).toMatchObject({ phase: "fight", woundModifier: 1 });
		const extra = one(
			"While this unit is leading a unit and contains a Herald model, weapons equipped by models in that unit have the [LETHAL HITS] ability.",
		);
		expect(extra.reasons).toContain("contains a herald model");
	});

	it("reads friendly units by keyword, with comma lists and exclusions", () => {
		const r = one(
			"Each time a Ranger, Scout or Sniper model from your army (excluding Vehicle models) makes an attack, add 1 to the Hit roll.",
		);
		expect(r.modifier).toMatchObject({
			unitKeywords: "RANGER, SCOUT, SNIPER",
			excludeUnitKeywords: "VEHICLE",
		});
		expect(
			one(
				"Ranged weapons equipped by Hunter models from your army have the [ASSAULT] ability.",
			).modifier,
		).toMatchObject({ phase: "shooting", unitKeywords: "HUNTER" });
	});

	it("reads auras written around the attack", () => {
		const attack = one(
			'Each time a friendly Hunter unit within 6" of this model makes a melee attack, add 1 to the Wound roll.',
		);
		expect(attack.reasons).toContain("aura");
		expect(attack.modifier).toMatchObject({
			unitKeywords: "HUNTER",
			phase: "fight",
		});
		const defence = one(
			'Each time an attack is allocated to a friendly Hunter unit within 3" of this model, subtract 1 from the Hit roll.',
		);
		expect(defence.modifier).toMatchObject({
			role: "defending",
			hitModifier: -1,
		});
	});

	it("reads conditions on friendly units as list-wide and conditional", () => {
		const r = one(
			"While a friendly Hunter unit is within range of an objective, attacks that target that unit with a S greater than that unit's T have -1 to wound rolls.",
		);
		expect(r.scope).toBe("list");
		expect(r.reasons).toContain("while is within range of an objective");
		expect(r.modifier).toMatchObject({
			role: "defending",
			unitKeywords: "HUNTER",
			strengthVsToughness: "gt",
		});
		expect(
			matchAbility(
				"While a friendly Herald model is leading this unit, add 1 to the Strength characteristic of melee weapons equipped by models in this unit.",
			)[0].scope,
		).toBe("unit");
	});

	it("marks attacks against a target picked during the game", () => {
		const r = one(
			"Each time a model in this unit makes an attack that targets your Hunt target, re-roll the Hit roll.",
		);
		expect(r.reasons).toContain("selected target");
		expect(r.modifier.rerollHits).toBe("all");
	});

	it("reads other short forms", () => {
		expect(
			one(
				"Each time a model in this unit makes a range attack, re-roll a Hit roll of 1.",
			).modifier.phase,
		).toBe("shooting");
		expect(
			one(
				"Each time this model makes a charge move, until the end of the turn, its melee weapons have the [LANCE] ability.",
			).modifier,
		).toMatchObject({ phase: "fight", weaponAbilities: "[LANCE]" });
		expect(
			one(
				"Each time a model in this unit targets an enemy unit with a melee attack, re-roll a Wound roll of 1.",
			).modifier,
		).toMatchObject({ phase: "fight", rerollWounds: "ones" });
		expect(
			one(
				"If the S of those attacks is lower than the T of the target, those attacks have +1 to wound rolls. Each time this unit makes an attack, if the S of that attack is lower than the T of the target, add 1 to the Wound roll.",
			).modifier.strengthVsToughness,
		).toBe("lt");
	});
});

describe("matchAbility: enemy debuffs, weapons and Feel No Pain", () => {
	it("weakens the attacks of an enemy unit in an aura, with exclusions", () => {
		const r = one(
			'While an enemy unit (excluding Monster units) is within 6" of this unit, each time a model in that unit makes an attack, subtract 1 from the Wound roll.',
		);
		expect(r.modifier).toMatchObject({
			role: "defending",
			woundModifier: -1,
			excludeVsKeywords: "MONSTER",
		});
	});

	it("weakens a picked enemy unit's attacks, Strength included", () => {
		const r = one(
			"Select one enemy unit. Until the end of the turn, each time a model in that unit makes an attack, subtract 1 from the Strength characteristic of that attack.",
		);
		expect(r.reasons).not.toContain("selected target");
		expect(r.modifier).toMatchObject({
			role: "defending",
			strengthModifier: -1,
		});
	});

	it("takes cover away from a status-marked enemy", () => {
		const r = one(
			"While a unit is Marked, that unit cannot have the benefit of cover.",
		);
		expect(r.modifier).toMatchObject({
			role: "attacking",
			weaponAbilities: "[IGNORES COVER]",
		});
	});

	it("reads attacks with one named or keyword weapon", () => {
		expect(
			one("Add 3 to the Attacks characteristic of this model's Glaive weapons.")
				.modifier,
		).toMatchObject({ attacksModifier: 3, weaponFilter: "GLAIVE" });
		expect(
			one(
				"While this model is leading a unit, add 1 to the Attacks characteristic of torrent weapons equipped by models in that unit.",
			).modifier,
		).toMatchObject({ attacksModifier: 1, weaponFilter: "TORRENT" });
		expect(
			one(
				"Each time a psychic attack targets this unit, subtract 1 from the Wound roll.",
			).modifier,
		).toMatchObject({
			role: "defending",
			woundModifier: -1,
			weaponFilter: "PSYCHIC",
		});
	});

	it("reads 'it' in a triggered ability as the model", () => {
		expect(
			one(
				"Once per battle, this model can use this ability. If it does, until the end of the phase, each time it makes an attack, re-roll the Wound roll.",
			).modifier,
		).toMatchObject({ rerollWounds: "all", ownModelsOnly: true });
	});

	it("reads Feel No Pain against mortal wounds and psychic attacks", () => {
		// One modifier, so the ability shows as one card.
		expect(
			one(
				'While a friendly Infantry unit is within 6" of this model, models in that unit have the Feel No Pain 5+ ability against mortal wounds and psychic attacks.',
			).modifier,
		).toMatchObject({ role: "defending", mortalFnp: 5, psychicFnp: 5 });
	});
});
