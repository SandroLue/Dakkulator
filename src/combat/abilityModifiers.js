import { matchAbility } from "./abilityRules";
import { createModifier, normalizeModifier } from "./modifiers";
import { unitAbilityEntries } from "./profiles";
import ROSTER_APPLIED from "./rosterApplied.json";
import { listUnits } from "./unitList";

/** Rules the engine already applies itself; as modifiers they would count twice. */
const HANDLED_ELSEWHERE = /^(?:damaged\b|stealth$|leader$|support$)/i;

/**
 * Leaves out what the roster already shows: BSData applies e.g. Memento
 * Moritoi's +1 A, S and D to the bearer's weapon profiles itself
 * (scripts/rosterApplied.mjs). Null when nothing is left.
 */
export function withoutRosterApplied(name, result) {
	const applied = ROSTER_APPLIED[name.trim().toLowerCase()];
	if (!applied) return result;
	const modifier = Object.fromEntries(
		Object.entries(result.modifier).filter(([key]) => !applied.includes(key)),
	);
	const effects = Object.keys(modifier).filter((key) => EFFECT_FIELDS.has(key));
	return effects.length ? { ...result, modifier } : null;
}

/** "dacatarai stance" → "Dacatarai Stance". */
const title = (text) => text.replace(/\b[a-z]/g, (c) => c.toUpperCase());

/**
 * Modifiers built from the abilities in a roster's own text (see
 * abilityRules.js), for the list in `slot` ("A" | "B").
 *
 * - Abilities start switched on, conditional ones too, like the best-case
 *   battlefield defaults; the user switches off what does not apply.
 * - Choices ("select one of the following") become one modifier per option,
 *   switched off: only one can apply at a time.
 * - Auras apply list-wide: they reach every friendly unit in range.
 * - Effects on a selected unit ("that unit": an enemy picked earlier) and rules
 *   the engine handles itself are left out.
 * - An ability every unit has (an army rule) becomes one list-wide modifier.
 */
export function abilityModifiers(roster, slot) {
	const units = listUnits(roster).map((entry) => entry.unit);
	const unitNames = new Set(units.map((unit) => unit.name));
	const found = new Map();
	for (const unit of units) {
		for (const [name, text] of unitAbilityEntries(unit)) {
			if (HANDLED_ELSEWHERE.test(name)) continue;
			for (const part of mergeParts(matchAbility(text))) {
				const result = withoutRosterApplied(name, part);
				if (!result || result.reasons.includes("that unit")) continue;
				// "select one of the following": one of several options, so off.
				// Picking a target ("select one enemy unit") is no such choice.
				const choice = result.reasons.includes("earlier: choice");
				const label =
					choice && result.option ? `${name} – ${title(result.option)}` : name;
				const key = `${label}|${JSON.stringify(result.modifier)}`;
				if (!found.has(key)) {
					found.set(key, { name: label, result, choice, units: new Set() });
				}
				found.get(key).units.add(unit.name);
			}
		}
	}

	const modifiers = [];
	for (const { name, result, choice, units: owners } of found.values()) {
		// One option a whole army picks from is one switch, not one per unit.
		// Auras reach every unit in range; best case, that is the whole list.
		const listWide =
			result.scope === "list" ||
			(unitNames.size > 1 && owners.size === unitNames.size) ||
			// …but "this model" picks for itself, model by model.
			(choice && owners.size > 1 && !result.modifier.ownModelsOnly);
		for (const unitName of listWide ? [""] : owners) {
			modifiers.push(
				createModifier({
					...result.modifier,
					name,
					list: slot,
					unitName,
					// A target picked during the game is the user's call, like a choice.
					enabled: !choice && !result.reasons.includes("selected target"),
				}),
			);
		}
	}
	return modifiers;
}

// What a modifier does, as opposed to whom and when it applies to.
const EFFECT_FIELDS = new Set([
	"hitModifier",
	"woundModifier",
	"skillModifier",
	"apModifier",
	"strengthModifier",
	"attacksModifier",
	"damageModifier",
	"rerollHits",
	"rerollWounds",
	"rerollDamage",
	"weaponAbilities",
	"ignoreHitModifiers",
	"ignoreWoundModifiers",
	"critHitOn",
	"critWoundOn",
	"cover",
	"fnp",
	"mortalFnp",
	"psychicFnp",
	"invuln",
	"halveDamage",
	"damageToOne",
	"toughnessChange",
	"saveChange",
	"woundsChange",
]);

const isChoice = (result) => result.reasons.includes("earlier: choice");

/** Who, when and how sure: parts of one ability with the same context are one modifier. */
const contextOf = (result) =>
	JSON.stringify({
		scope: result.scope,
		option: result.option,
		selected: result.reasons.includes("selected target"),
		modifier: Object.fromEntries(
			Object.entries(result.modifier).filter(
				([key]) => !EFFECT_FIELDS.has(key),
			),
		),
	});

/**
 * "+3 A and [DEVASTATING WOUNDS]", or "re-roll hit rolls of 1 / re-roll wound
 * rolls of 1" in a list, are one ability: one card, one switch. Options of a
 * choice stay apart, and so do two parts that change the same thing.
 */
export function mergeParts(results) {
	const merged = [];
	for (const result of results) {
		const same = isChoice(result)
			? null
			: merged.find(
					(other) =>
						!isChoice(other) &&
						contextOf(other) === contextOf(result) &&
						!Object.keys(result.modifier).some(
							(key) => EFFECT_FIELDS.has(key) && key in other.modifier,
						),
				);
		if (!same) {
			merged.push({ ...result, reasons: [...result.reasons] });
			continue;
		}
		Object.assign(same.modifier, result.modifier);
		for (const reason of result.reasons) {
			if (!same.reasons.includes(reason)) same.reasons.push(reason);
		}
		same.conditional ||= result.conditional;
	}
	return merged;
}

/** What makes two modifiers the same, whatever their id, list or on/off state. */
const signature = (modifier) =>
	JSON.stringify({
		...normalizeModifier(modifier),
		id: undefined,
		list: undefined,
		enabled: undefined,
	});

/** Adds generated modifiers, skipping any the user already has. */
export function mergeAbilityModifiers(existing, generated) {
	const known = new Set(existing.map(signature));
	const added = generated.filter((modifier) => !known.has(signature(modifier)));
	return added.length ? [...existing, ...added] : existing;
}
