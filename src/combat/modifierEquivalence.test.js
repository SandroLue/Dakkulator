import { describe, expect, it } from "vitest";
import { engineInputs, scenarioGenerator } from "./__fixtures__/scenarios";
import { applyUserModifiers, createModifier } from "./modifiers";
import { resolveWeaponVsGroup } from "./resolve";

/**
 * Every modifier field must do exactly what the matching scenario rule does:
 * a modifier "critical hits on 5+" against a scenario with critical hits on
 * 5+, and so on. The scenarios are checked against the brute-force oracle
 * (oracle.test.js), so this ties the modifier path to it too.
 */

const SCENARIOS = 60;

function resolveScenario(sc) {
	const { profile, group, ctx } = engineInputs(sc);
	return resolveWeaponVsGroup(profile, group, ctx);
}

function resolveWithModifiers(sc, { attacking = [], defending = [] }) {
	const { profile, group, ctx } = engineInputs(sc);
	const modified = applyUserModifiers({
		ctx,
		profiles: [profile],
		groups: [group],
		attacking: attacking.map((m) =>
			createModifier({ ...m, role: "attacking" }),
		),
		defending: defending.map((m) =>
			createModifier({ ...m, role: "defending", list: "B" }),
		),
	});
	return resolveWeaponVsGroup(
		modified.profiles[0],
		modified.groups[0],
		modified.ctx,
	);
}

const plusOneDamage = {
	1: "2",
	2: "3",
	3: "4",
	D3: "D3+1",
	D6: "D6+1",
	"D6+1": "D6+2",
};
const lowerThreshold = (current, to) => Math.min(current ?? 6, to);
const betterFnp = (current, to) => (current ? Math.min(current, to) : to);

// [modifier, the scenario with the same rule]
const CASES = {
	"critical hits on 5+": [
		{ attacking: [{ critHitOn: 5 }] },
		(sc) => ({ ...sc, critHitOn: lowerThreshold(sc.critHitOn, 5) }),
	],
	"critical wounds on 4+": [
		{ attacking: [{ critWoundOn: 4 }] },
		(sc) => ({ ...sc, critWoundOn: lowerThreshold(sc.critWoundOn, 4) }),
	],
	"re-roll damage": [
		{ attacking: [{ rerollDamage: true }] },
		(sc) => ({ ...sc, rerollDamage: true }),
	],
	"re-roll all hits": [
		{ attacking: [{ rerollHits: "all" }] },
		(sc) => ({ ...sc, rerollHits: "all" }),
	],
	"[LETHAL HITS]": [
		{ attacking: [{ weaponAbilities: "[LETHAL HITS]" }] },
		(sc) => ({ ...sc, lethal: true }),
	],
	"+1 wound roll": [
		{ attacking: [{ woundModifier: 1 }] },
		(sc) => ({ ...sc, woundModifier: (sc.woundModifier || 0) + 1 }),
	],
	"+1 Strength": [
		{ attacking: [{ strengthModifier: 1 }] },
		(sc) => ({ ...sc, strength: sc.strength + 1 }),
	],
	"+1 AP": [
		{ attacking: [{ apModifier: 1 }] },
		(sc) => ({ ...sc, ap: (sc.ap || 0) + 1 }),
	],
	"+1 Damage": [
		{ attacking: [{ damageModifier: 1 }] },
		(sc) => ({ ...sc, damage: plusOneDamage[sc.damage] }),
	],
	"-1 Strength on the defender": [
		{ defending: [{ strengthModifier: -1 }] },
		(sc) => ({ ...sc, strength: Math.max(1, sc.strength - 1) }),
	],
	"target -1 Toughness": [
		{ attacking: [{ toughnessChange: -1 }] },
		(sc) => ({ ...sc, toughness: Math.max(1, sc.toughness - 1) }),
	],
	"+1 Toughness": [
		{ defending: [{ toughnessChange: 1 }] },
		(sc) => ({ ...sc, toughness: sc.toughness + 1 }),
	],
	"+1 Save": [
		{ defending: [{ saveChange: 1 }] },
		(sc) => ({ ...sc, save: sc.save >= 7 ? 7 : Math.max(2, sc.save - 1) }),
	],
	"+1 Wounds": [
		{ defending: [{ woundsChange: 1 }] },
		(sc) => ({ ...sc, wounds: sc.wounds + 1 }),
	],
	"Feel No Pain 5+": [
		{ defending: [{ fnp: 5 }] },
		(sc) => ({ ...sc, fnp: betterFnp(sc.fnp, 5) }),
	],
	"Feel No Pain 4+ against mortal wounds": [
		{ defending: [{ mortalFnp: 4 }] },
		(sc) => ({ ...sc, mortalFnp: betterFnp(sc.mortalFnp, 4) }),
	],
	"halve damage": [
		{ defending: [{ halveDamage: true }] },
		(sc) => ({ ...sc, halveDamage: true }),
	],
	"damage becomes 1": [
		{ defending: [{ damageToOne: true }] },
		(sc) => ({ ...sc, damageToOne: true }),
	],
	"-1 wound roll if S > T": [
		{ defending: [{ woundModifier: -1, strengthVsToughness: "gt" }] },
		(sc) =>
			sc.strength > sc.toughness
				? { ...sc, woundModifier: (sc.woundModifier || 0) - 1 }
				: sc,
	],
	"Feel No Pain 4+ against psychic attacks": [
		{ defending: [{ psychicFnp: 4 }] },
		(sc) => (sc.psychic ? { ...sc, fnp: betterFnp(sc.fnp, 4) } : sc),
	],
	"a filter naming the weapon": [
		{ attacking: [{ critHitOn: 4, weaponFilter: "WEAPON" }] },
		(sc) => ({ ...sc, critHitOn: lowerThreshold(sc.critHitOn, 4) }),
	],
	"a filter naming another weapon": [
		{ attacking: [{ critHitOn: 4, weaponFilter: "SOLITAIRE" }] },
		(sc) => sc,
	],
};

describe("a modifier does what the scenario rule does", () => {
	for (const [name, [modifiers, scenario]] of Object.entries(CASES)) {
		it(name, () => {
			const next = scenarioGenerator(31);
			for (let i = 0; i < SCENARIOS; i++) {
				const sc = next();
				const label = `${name} ${JSON.stringify(sc)}`;
				const viaModifier = resolveWithModifiers(sc, modifiers);
				const viaScenario = resolveScenario(scenario(sc));
				for (const metric of ["woundsLost", "modelsSlain", "pDestroyed"]) {
					expect(viaModifier[metric], `${metric} ${label}`).toBeCloseTo(
						viaScenario[metric],
						9,
					);
				}
			}
		});
	}
});
