import {
	applyUserModifiers,
	grantAbilities,
	normalizeModifier,
	selectModifiers,
} from "./modifiers";
import {
	buildAttackerProfiles,
	buildDefenderProfiles,
	getGroupTotalWounds,
	getUnitTotalModels,
	mineUnitAbilities,
} from "./profiles";
import {
	allocateAttacks,
	computeAttackStreams,
	defaultContext,
	scaleStreams,
} from "./resolve";
import { simulate } from "./simulate";
import { sustainedHitsValue } from "./weaponKeywords";

export { defaultContext } from "./resolve";
export { sustainedHitsValue } from "./weaponKeywords";
export {
	buildAttackerProfiles,
	buildDefenderProfiles,
	mineUnitAbilities,
} from "./profiles";
export { parseWeaponAbilities } from "./weaponKeywords";

const cache = new Map();
const MAX_CACHE_ENTRIES = 200;

// Units are keyed by identity: two lists can share unit names and points but
// differ in wargear, and a re-imported list must not reuse old results.
const unitIds = new WeakMap();
let nextUnitId = 0;
const unitId = (unit) => {
	if (!unitIds.has(unit)) unitIds.set(unit, ++nextUnitId);
	return unitIds.get(unit);
};

function cacheKey(attackerUnits, defenderUnits, ctx, options) {
	return JSON.stringify([
		attackerUnits.map(unitId),
		defenderUnits.map(unitId),
		ctx,
		options,
	]);
}

/**
 * One attacking unit against one defending unit.
 *
 * §05.03 allocation groups are resolved in defender-optimal order: the first
 * group absorbs the attack, and whatever finds no surviving model spills onto
 * the next group.
 *
 * @param {object} options `{ modifiers, attackerList, defenderList }` — the
 * user-built modifiers and which list ("A" | "B") each side comes from
 */
export function resolveUnitVsUnit(
	attacker,
	defender,
	context = {},
	options = {},
) {
	const ctx = defaultContext(context);
	const attackerAbilities = mineUnitAbilities(attacker);
	const defenderAbilities = mineUnitAbilities(defender);
	const targetModelCount = getUnitTotalModels(defender) || 1;

	// "Shooting + Fight" resolves the shooting phase, then the fight phase, against
	// the same unit; each phase keeps its own modifiers and context.
	const phases = ctx.phase === "combined" ? ["shooting", "fight"] : [ctx.phase];
	const parts = phases.map((phase) =>
		preparePhase(attacker, defender, { ...ctx, phase }, options, {
			stealth: defenderAbilities.stealth,
			targetModelCount,
		}),
	);
	// Every phase builds the same allocation groups, in the same order.
	const { groups } = parts[0];
	const attacks = parts.flatMap((part) =>
		part.profiles.map((profile) => ({ profile, part })),
	);
	const alternativeAttacks = parts.flatMap((part) =>
		(part.profiles.alternatives || []).map((profile) => ({ profile, part })),
	);
	const profiles = attacks.map((a) => a.profile);
	profiles.alternatives = alternativeAttacks.map((a) => a.profile);

	const empty = {
		attackerName: attacker?.name,
		defenderName: defender?.name,
		phase: ctx.phase,
		weapons: [],
		alternatives: [],
		groups,
		groupIndex: 0,
		groupStreams: [],
		appliedModifiers: [...new Set(parts.flatMap((part) => part.applied))],
		totals: {
			attacks: 0,
			declaredAttacks: 0,
			hits: 0,
			wounds: 0,
			failedSaves: 0,
			mortalWounds: 0,
			woundsLost: 0,
			modelsSlain: 0,
			pointsKilled: 0,
			pDestroyed: 0,
			roundsToClear: Number.POSITIVE_INFINITY,
			damagePer100Points: 0,
			pointsRemoved: 0,
			pointsReturnPer100: 0,
		},
		warnings: buildWarnings(profiles, attackerAbilities, defenderAbilities),
	};
	if (!groups.length || !profiles.length) return empty;

	const weapons = [];
	const totals = {
		attacks: 0,
		declaredAttacks: 0,
		hits: 0,
		wounds: 0,
		failedSaves: 0,
		mortalWounds: 0,
	};
	const fullStreams = groups.map((_, index) =>
		attacks.map(({ profile, part }) =>
			computeAttackStreams(
				profile,
				{ ...part.groups[index], targetModelCount },
				part.ctx,
			),
		),
	);
	const allocation = allocateAttacks(
		profiles.map((_, weapon) => fullStreams.map((row) => row[weapon])),
		groups,
	);

	// The breakdown's view: every attack, overkill included (see `potentialRows`).
	const potential = options.potential
		? potentialRows(profiles, fullStreams, groups)
		: null;

	// `attacks` counts only dice rolled while the unit still stood; `declaredAttacks`
	// is the weapon's full attack count, split between groups like its dice.
	const shownShares = allocation.diceShare.map((shares) =>
		shares.map((share, index) => (index > 0 && share < 1e-4 ? 0 : share)),
	);
	for (const [index, row] of potential ? [] : fullStreams.entries()) {
		for (const [weapon, full] of row.entries()) {
			const share = shownShares[weapon][index];
			if (index > 0 && share === 0) continue;
			const shownTotal = shownShares[weapon].reduce((a, b) => a + b, 0);
			const w = {
				...scaleStreams(full, share),
				declaredAttacks:
					shownTotal > 0 ? (full.attacks * share) / shownTotal : full.attacks,
				// Split between groups like the dice, so the rows add up to the weapon's share.
				woundsLost:
					allocation.weaponWoundsLost[weapon] *
					(shownTotal > 0 ? share / shownTotal : index === 0 ? 1 : 0),
				groupIndex: index,
			};
			weapons.push(w);
			totals.attacks += w.attacks;
			totals.declaredAttacks += w.declaredAttacks;
			totals.hits += w.hits;
			totals.wounds += w.wounds;
			totals.failedSaves += w.failedSaves;
			totals.mortalWounds += w.mortalWounds;
		}
	}
	for (const w of potential?.weapons ?? []) {
		weapons.push(w);
		for (const key of Object.keys(totals)) totals[key] += w[key] ?? 0;
	}
	totals.woundsLost = allocation.woundsLost;
	// Everything the attacks could do: more than the unit has when it overkills.
	totals.potentialWoundsLost = potential?.woundsLost ?? allocation.woundsLost;
	totals.modelsSlain = allocation.modelsSlain;
	totals.pointsKilled = allocation.pointsKilled;
	const pDestroyed = allocation.pDestroyed;

	// Unchosen profiles, each resolved alone against a fresh first group; never totalled.
	const alternatives = alternativeAttacks.map(({ profile, part }) => ({
		...computeAttackStreams(
			profile,
			{ ...part.groups[0], targetModelCount },
			part.ctx,
		),
		woundsLost: woundsLostAlone(
			profile,
			potential ? withExtraModels(part.groups, potential.extra) : part.groups,
			targetModelCount,
			part.ctx,
		),
		groupIndex: 0,
	}));

	const totalWounds = getGroupTotalWounds(groups);
	const attackerPoints = attacker?.cost?.points || 0;
	// Share of the target's wounds removed, valued at the target's cost: unlike raw
	// wounds this is comparable across targets, and unlike points killed it credits
	// damage left on a surviving multi-wound model.
	const pointsRemoved =
		totalWounds > 0
			? (defender?.cost?.points || 0) *
				Math.min(1, totals.woundsLost / totalWounds)
			: 0;

	return {
		...empty,
		weapons,
		alternatives,
		// Structured-clone friendly, so it can be posted to the simulation worker.
		groupStreams: groups.map((group, index) => ({
			group: { wounds: group.wounds, count: group.count, fnp: group.fnp },
			streams: fullStreams[index].map((s) => ({
				sampling: s.sampling,
				damageExpr: s.damageExpr,
			})),
		})),
		totals: {
			...totals,
			pDestroyed,
			roundsToClear:
				totals.woundsLost > 0
					? totalWounds / totals.woundsLost
					: Number.POSITIVE_INFINITY,
			damagePer100Points:
				attackerPoints > 0 ? (totals.woundsLost / attackerPoints) * 100 : 0,
			pointsRemoved,
			pointsReturnPer100:
				attackerPoints > 0 ? (pointsRemoved / attackerPoints) * 100 : 0,
		},
	};
}

/**
 * One phase's attacker profiles, defender groups and context, with the user
 * modifiers for that phase applied and the best firing modes chosen.
 */
function preparePhase(attacker, defender, ctx, options, defenderState) {
	const selected = selectModifiers(options.modifiers, {
		attacker,
		defender,
		attackerList: options.attackerList,
		defenderList: options.defenderList,
		phase: ctx.phase,
	});
	const modified = applyUserModifiers({
		ctx: {
			...ctx,
			// `Stealth` always grants the benefit of cover against ranged attacks.
			targetInCover: ctx.targetInCover || defenderState.stealth,
		},
		profiles: grantAbilities(
			buildAttackerProfiles(attacker, ctx.phase),
			appliedToAll(ctx),
		),
		groups: buildDefenderProfiles(defender),
		...selected,
		defending: [...selected.defending, ...defendedByAll(ctx)],
	});
	return {
		ctx: modified.ctx,
		groups: modified.groups,
		// "Apply to all" is shown in its own panel, not as one of the abilities.
		applied: modified.applied.filter((name) => name !== APPLY_TO_ALL),
		profiles: pickBestProfiles(
			modified.profiles,
			modified.groups,
			defenderState.targetModelCount,
			modified.ctx,
		),
	};
}

/** The "apply to all" context options as weapon-ability strings. */
function appliedToAll(ctx) {
	const sustained = sustainedHitsValue(ctx.allSustainedHits);
	return [
		ctx.allLethalHits && "[LETHAL HITS]",
		ctx.allDevastatingWounds && "[DEVASTATING WOUNDS]",
		sustained && `[SUSTAINED HITS ${sustained}]`,
	].filter(Boolean);
}

const APPLY_TO_ALL = "Apply to all";

/** The "apply to all" defences as a defensive ability every defender has. */
function defendedByAll(ctx) {
	if (!ctx.allFnp && !ctx.allInvuln) return [];
	return [
		normalizeModifier({
			id: "apply-to-all",
			name: APPLY_TO_ALL,
			role: "defending",
			list: "any",
			fnp: ctx.allFnp,
			invuln: ctx.allInvuln,
		}),
	];
}

/** Wounds one profile removes from the whole unit when it attacks alone. */
function woundsLostAlone(profile, groups, targetModelCount, ctx) {
	return allocateAttacks(
		[
			groups.map((group) =>
				computeAttackStreams(profile, { ...group, targetModelCount }, ctx),
			),
		],
		groups,
	).woundsLost;
}

/**
 * A model uses one firing mode per weapon and one normal melee weapon. Of the
 * profiles sharing a `choice`, keep the one that alone removes the most wounds
 * from this defender; ties keep the default pick.
 */
function pickBestProfiles(profiles, groups, targetModelCount, ctx) {
	const alternatives = profiles.alternatives || [];
	if (!alternatives.length || !groups.length) return profiles;
	const woundsLostBy = (profile) =>
		woundsLostAlone(profile, groups, targetModelCount, ctx);

	const chosen = [...profiles];
	const rejected = [];
	for (const [index, current] of profiles.entries()) {
		const rivals = alternatives.filter(
			(p) => current.choice && p.choice === current.choice,
		);
		if (!rivals.length) continue;
		let best = current;
		let bestWounds = woundsLostBy(current);
		for (const rival of rivals) {
			const wounds = woundsLostBy(rival);
			if (wounds > bestWounds + 1e-9) {
				best = rival;
				bestWounds = wounds;
			}
		}
		chosen[index] = best;
		rejected.push(...[current, ...rivals].filter((p) => p !== best));
	}
	// Alternatives without a surviving rival in `profiles` stay as they were.
	for (const p of alternatives) {
		if (!chosen.includes(p) && !rejected.includes(p)) rejected.push(p);
	}
	chosen.alternatives = rejected;
	return chosen;
}

function buildWarnings(profiles, attackerAbilities, defenderAbilities) {
	const unknownWeaponAbilities = new Set();
	for (const profile of profiles) {
		for (const token of profile.abilities.unknown) {
			unknownWeaponAbilities.add(token);
		}
	}
	return {
		unknownWeaponAbilities: [...unknownWeaponAbilities],
		unmodelledAttackerAbilities: attackerAbilities.unmodelled,
		unmodelledDefenderAbilities: defenderAbilities.unmodelled,
		unusedWeaponProfiles: (profiles.alternatives || []).map(
			(p) => p.weaponName,
		),
	};
}

export const EMPTY_SIMULATION = {
	trials: 0,
	pDestroyed: 0,
	meanWoundsLost: 0,
	meanModelsSlain: 0,
	histogram: [],
	meanPotentialWoundsLost: 0,
	potentialHistogram: [],
	clearedBy: [],
	medianRounds: null,
};

/** The unit with `extra` more models of its last type. */
function withExtraModels(groups, extra) {
	const last = groups.length - 1;
	return groups.map((group, index) =>
		index === last ? { ...group, count: group.count + extra } : group,
	);
}

/**
 * One row per weapon with every attack it makes, as if the unit had as many
 * models of its last type as it takes: the attacks that would land after the
 * unit is destroyed still roll against that model type. Hits, wounds, damage
 * and wounds lost then show the weapon in full, overkill included.
 */
function potentialRows(profiles, fullStreams, groups) {
	const last = fullStreams.length - 1;
	const weaponStreams = profiles.map((_, weapon) =>
		fullStreams.map((row) => row[weapon]),
	);
	// Enough extra models that the unit outlasts the attack; doubled until it does.
	const lastDamage = fullStreams[last].reduce((sum, s) => sum + s.rawDamage, 0);
	const maxDamage = Math.max(
		1,
		...fullStreams[last].map((s) => s.damagePmf.length - 1),
	);
	let extra =
		Math.ceil((3 * lastDamage + 10 * maxDamage) / groups[last].wounds) + 1;
	let allocation = allocateAttacks(
		weaponStreams,
		withExtraModels(groups, extra),
	);
	for (let tries = 0; allocation.pDestroyed > 1e-9 && tries < 5; tries++) {
		extra *= 2;
		allocation = allocateAttacks(weaponStreams, withExtraModels(groups, extra));
	}

	const weapons = profiles.map((_, weapon) => {
		const shares = allocation.diceShare[weapon];
		const parts = weaponStreams[weapon].map((streams, g) =>
			scaleStreams(streams, shares[g]),
		);
		// The rolls (and so the to-wound and save numbers) of the group most dice met.
		const main = shares.indexOf(Math.max(...shares));
		const row = { ...parts[main], groupIndex: main };
		for (const key of POTENTIAL_SUMMED) {
			row[key] = parts.reduce((sum, part) => sum + (part[key] ?? 0), 0);
		}
		row.declaredAttacks = row.attacks;
		row.woundsLost = allocation.weaponWoundsLost[weapon];
		// The model groups this weapon's attacks reach, for the breakdown.
		row.targetGroups = shares
			.map((share, g) => (share >= 1e-4 ? g : null))
			.filter((g) => g !== null);
		return row;
	});
	return { weapons, woundsLost: allocation.woundsLost, extra };
}

const POTENTIAL_SUMMED = [
	"attacks",
	"hits",
	"critHits",
	"sustainedHits",
	"autoWounds",
	"wounds",
	"critWounds",
	"mortalWounds",
	"failedSaves",
	"rawDamage",
];

/** The minimal input `simulate` needs, so it can be posted to a Web Worker cheaply. */
export function pairingStreamGroups(pairing) {
	if (!pairing?.weapons?.length) return [];
	return pairing.groupStreams ?? [];
}

/** Monte-Carlo pass over an already-resolved pairing (§2.6). */
export function simulatePairing(pairing, options = {}) {
	const streamGroups = pairingStreamGroups(pairing);
	if (!streamGroups.length) return EMPTY_SIMULATION;
	return simulate(streamGroups, options);
}

/**
 * @param {Array} attackerUnits units selected from List A
 * @param {Array} defenderUnits units selected from List B
 * @param {object} context the §5.6 modifier context
 * @param {object} options see `resolveUnitVsUnit`
 */
export function calculateMatchup(
	attackerUnits,
	defenderUnits,
	context = {},
	options = {},
) {
	const ctx = defaultContext(context);
	const key = cacheKey(attackerUnits, defenderUnits, ctx, options);
	const cached = cache.get(key);
	if (cached) return cached;

	const rows = attackerUnits.map((attacker) => ({
		attacker,
		cells: defenderUnits.map((defender) =>
			resolveUnitVsUnit(attacker, defender, ctx, options),
		),
	}));

	const result = { ctx, attackerUnits, defenderUnits, rows };
	if (cache.size >= MAX_CACHE_ENTRIES) cache.clear();
	cache.set(key, result);
	return result;
}
