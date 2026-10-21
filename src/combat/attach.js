import {
	getUnitTotalModels,
	mineUnitAbilities,
	normalizeName,
	unitAbilityEntries,
} from "./profiles";

/**
 * Leader / attached units.
 *
 * Which leader joined which bodyguard is chosen before the battle, in the
 * Muster Armies step, so a roster file cannot record it. All a datasheet gives
 * us is the list of units a leader is *allowed* to join, as free text in its
 * `Leader` ability — the pairing itself has to come from the user.
 */

// The Leader ability, and 11e's Support ability, both use this phrase.
const LEADER_TARGETS = /attached to the following units:\s*([^.]+)/i;

/** Words a renamed datasheet gained or lost: "PROSECUTORS" is now "Prosecutor Squad". */
const GENERIC_WORDS = new Set(["squad", "sodality", "unit", "units"]);

/**
 * A datasheet name reduced to what stays stable across renames: lowercase,
 * singular, without "Squad" or "Sodality".
 */
export function datasheetKey(name) {
	return normalizeName(name)
		.split(" ")
		.filter((word) => word && !GENERIC_WORDS.has(word))
		.map((word) => (word.length > 3 ? word.replace(/s$/, "") : word))
		.join(" ");
}

/** Datasheet keys this unit may be attached to, if it is a leader or support unit. */
export function getLeaderTargets(unit) {
	for (const [, description] of unitAbilityEntries(unit)) {
		const match = LEADER_TARGETS.exec(String(description ?? ""));
		if (!match) continue;
		// "A, B, C" or "- A - B - C". Never split on "and": it is part of
		// names like "Custodian Guard with Adrasite and Pyrithite Spears".
		return match[1]
			.split(/,|\n|[■•]|(?:^|\s)-\s/)
			.map((target) => target.trim().replace(/^(?:and|or)\s+/i, ""))
			.map(datasheetKey)
			.filter(Boolean);
	}
	return [];
}

export function isLeader(unit) {
	return getLeaderTargets(unit).length > 0;
}

export function canLead(leader, bodyguard) {
	if (!leader || !bodyguard || leader === bodyguard) return false;
	const name = datasheetKey(bodyguard.name);
	if (!name) return false;
	return getLeaderTargets(leader).some(
		(target) => name === target || name.startsWith(`${target} `),
	);
}

/**
 * Merges a bodyguard unit and its leaders into the single attached unit they
 * form for the battle: one pool of weapons, and one allocation group per
 * statline with the leaders resolved last.
 */
export function attachLeaders(bodyguard, leaders = []) {
	if (!bodyguard || !leaders.length) return bodyguard;

	const units = [bodyguard, ...leaders];
	const keywords = new Set();
	const factions = new Set();
	const rules = new Map();
	const abilities = {};
	const models = [];
	const modelStats = [];
	let points = 0;

	for (const unit of units) {
		for (const keyword of unit.keywords || []) keywords.add(keyword);
		for (const faction of unit.factions || []) factions.add(faction);
		unit.rules?.forEach?.((description, name) => rules.set(name, description));
		for (const [group, map] of Object.entries(unit.abilities || {})) {
			if (!map?.forEach) continue;
			if (!abilities[group]) abilities[group] = new Map();
			map.forEach((description, name) =>
				abilities[group].set(name, description),
			);
		}
		models.push(...(unit.models || []));
		points += unit.cost?.points || 0;

		// Feel No Pain and points are per source unit, not per attached unit.
		const mined = mineUnitAbilities(unit);
		const perModel =
			(unit.cost?.points || 0) / (getUnitTotalModels(unit) || 1) || 0;
		for (const stat of unit.modelStats || []) {
			modelStats.push({
				...stat,
				attachedLeader: unit !== bodyguard,
				attachedFnp: mined.fnp,
				attachedPoints: perModel,
				attachedUnitName: unit.name,
			});
		}
	}

	return {
		...bodyguard,
		name: [bodyguard.name, ...leaders.map((l) => l.name)].join(" + "),
		keywords,
		factions,
		rules,
		abilities,
		models,
		modelStats,
		modelList: units.flatMap((unit) => unit.modelList || []),
		rangedWeapons: units.flatMap((unit) => unit.rangedWeapons || []),
		meleeWeapons: units.flatMap((unit) => unit.meleeWeapons || []),
		cost: { ...(bodyguard.cost || {}), points },
		attachedFrom: units.map((unit) => unit.name),
	};
}
