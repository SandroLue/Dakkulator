import { matchAbility } from "./abilityRules";
import { createModifier, normalizeModifier } from "./modifiers";
import { unitAbilityEntries } from "./profiles";
import { listUnits } from "./unitList";

/** Rules the engine already applies itself; as modifiers they would count twice. */
const HANDLED_ELSEWHERE = /^(?:damaged\b|stealth$|leader$|support$)/i;

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
			for (const result of matchAbility(text)) {
				if (result.reasons.includes("that unit")) continue;
				const choice = result.reasons.some((r) =>
					r.startsWith("earlier: select"),
				);
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
			(choice && owners.size > 1);
		for (const unitName of listWide ? [""] : owners) {
			modifiers.push(
				createModifier({
					...result.modifier,
					name,
					list: slot,
					unitName,
					enabled: !choice,
				}),
			);
		}
	}
	return modifiers;
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
