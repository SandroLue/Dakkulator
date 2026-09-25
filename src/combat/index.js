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
	const { profiles, groups } = modified;
	const effectiveCtx = modified.ctx;
	const targetModelCount = getUnitTotalModels(defender) || 1;

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
		},
		warnings: buildWarnings(profiles, attackerAbilities, defenderAbilities),
	};
	if (!groups.length || !profiles.length) return empty;

	const weapons = [];
	const totals = {
		attacks: 0,
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

	for (const [index, row] of fullStreams.entries()) {
		for (const [weapon, full] of row.entries()) {
			const share = allocation.diceShare[weapon][index];
			if (index > 0 && share < 1e-4) continue;
			const w = { ...scaleStreams(full, share), groupIndex: index };
			weapons.push(w);
			totals.attacks += w.attacks;
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
		...computeAttackStreams(profile, firstGroup, effectiveCtx),
		groupIndex: 0,
	}));

	const totalWounds = getGroupTotalWounds(groups);
	const attackerPoints = attacker?.cost?.points || 0;

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
		},
	};
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
