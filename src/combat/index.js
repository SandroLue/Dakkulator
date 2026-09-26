import { applyUserModifiers, selectModifiers } from "./modifiers";
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

export { defaultContext } from "./resolve";
export {
	buildAttackerProfiles,
	buildDefenderProfiles,
	mineUnitAbilities,
} from "./profiles";
export { parseWeaponAbilities } from "./weaponKeywords";

const cache = new Map();
const MAX_CACHE_ENTRIES = 200;

function cacheKey(attackerUnits, defenderUnits, ctx, options) {
	return JSON.stringify([
		attackerUnits.map((u) => `${u.name}#${u.cost?.points}`),
		defenderUnits.map((u) => `${u.name}#${u.cost?.points}`),
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
			targetInCover: ctx.targetInCover || defenderAbilities.stealth,
		},
		profiles: buildAttackerProfiles(attacker, ctx.phase),
		groups: buildDefenderProfiles(defender),
		...selected,
	});
	const { groups } = modified;
	const effectiveCtx = modified.ctx;
	const targetModelCount = getUnitTotalModels(defender) || 1;
	const profiles = pickBestProfiles(
		modified.profiles,
		groups,
		targetModelCount,
		effectiveCtx,
	);

	const empty = {
		attackerName: attacker?.name,
		defenderName: defender?.name,
		phase: ctx.phase,
		weapons: [],
		alternatives: [],
		groups,
		groupIndex: 0,
		groupStreams: [],
		appliedModifiers: modified.applied,
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
	const fullStreams = groups.map((base) =>
		profiles.map((profile) =>
			computeAttackStreams(
				profile,
				{ ...base, targetModelCount },
				effectiveCtx,
			),
		),
	);
	const allocation = allocateAttacks(
		profiles.map((_, weapon) => fullStreams.map((row) => row[weapon])),
		groups,
	);

	// `attacks` counts only dice rolled while the unit still stood; `declaredAttacks`
	// is the weapon's full attack count, split between groups like its dice.
	const shownShares = allocation.diceShare.map((shares) =>
		shares.map((share, index) => (index > 0 && share < 1e-4 ? 0 : share)),
	);
	for (const [index, row] of fullStreams.entries()) {
		for (const [weapon, full] of row.entries()) {
			const share = shownShares[weapon][index];
			if (index > 0 && share === 0) continue;
			const shownTotal = shownShares[weapon].reduce((a, b) => a + b, 0);
			const w = {
				...scaleStreams(full, share),
				declaredAttacks:
					shownTotal > 0 ? (full.attacks * share) / shownTotal : full.attacks,
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
	totals.woundsLost = allocation.woundsLost;
	totals.modelsSlain = allocation.modelsSlain;
	totals.pointsKilled = allocation.pointsKilled;
	const pDestroyed = allocation.pDestroyed;

	// Unchosen profiles, each resolved alone against a fresh first group; never totalled.
	const firstGroup = { ...groups[0], targetModelCount };
	const alternatives = (profiles.alternatives || []).map((profile) => ({
		...withDeclared(computeAttackStreams(profile, firstGroup, effectiveCtx)),
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

const withDeclared = (streams) => ({
	...streams,
	declaredAttacks: streams.attacks,
});

/**
 * A model uses one firing mode per weapon and one normal melee weapon. Of the
 * profiles sharing a `choice`, keep the one that alone removes the most wounds
 * from this defender; ties keep the default pick.
 */
function pickBestProfiles(profiles, groups, targetModelCount, ctx) {
	const alternatives = profiles.alternatives || [];
	if (!alternatives.length || !groups.length) return profiles;
	const woundsLostBy = (profile) =>
		allocateAttacks(
			[
				groups.map((group) =>
					computeAttackStreams(profile, { ...group, targetModelCount }, ctx),
				),
			],
			groups,
		).woundsLost;

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
	clearedBy: [],
	medianRounds: null,
};

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
