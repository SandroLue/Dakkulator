import { getUnitTotalModels } from "../profiles";

/** The metrics the results matrix can show. */

export const format = (value, digits = 2) =>
	Number.isFinite(value) ? value.toFixed(digits) : "∞";

const woundShare = (t) =>
	Number.isFinite(t.roundsToClear) && t.roundsToClear > 0
		? 1 / t.roundsToClear
		: 0;

/**
 * `get` fills the cell; `share` colours it on a fixed 0–1 scale so the colour
 * means the same in every matchup (1 = `full`). `usesPoints` shows unit
 * costs in the matrix.
 */
export const METRICS = {
	pointsReturn: {
		usesPoints: true,
		// Percent of its own cost the attacker destroys.
		label: "Efficiency",
		get: (t) => t.pointsReturnPer100,
		digits: 0,
		suffix: "%",
		share: (t) => (t.pointsReturnPer100 ?? 0) / 100,
		full: "own cost removed",
		// Points' worth of the target removed, out of the target's cost.
		detail: (t, _attacker, defender) =>
			`${format(t.pointsRemoved ?? 0, 0)} / ${defender.cost?.points ?? 0} pts`,
	},
	pDestroyed: {
		label: "Clear in one round",
		get: (t) => t.pDestroyed * 100,
		digits: 0,
		suffix: "%",
		share: (t) => t.pDestroyed,
		full: "certain kill",
	},
	woundsLost: {
		label: "Wounds dealt",
		get: (t) => t.woundsLost,
		share: woundShare,
		full: "unit wiped",
	},
	modelsSlain: {
		label: "Models slain",
		get: (t) => t.modelsSlain,
		share: (t, _attacker, defender) =>
			t.modelsSlain / (getUnitTotalModels(defender) || 1),
		full: "unit wiped",
	},
	pointsKilled: {
		usesPoints: true,
		label: "Points killed",
		get: (t) => t.pointsKilled,
		digits: 0,
		share: (t, _attacker, defender) =>
			t.pointsKilled / (defender.cost?.points || 1),
		full: "unit wiped",
	},
	damagePer100Points: {
		usesPoints: true,
		label: "Damage per 100 points",
		get: (t) => t.damagePer100Points,
		digits: 1,
		// Points' worth of wounds dealt, relative to the attacker's own cost.
		share: (t, attacker, defender) =>
			(woundShare(t) * (defender.cost?.points || 0)) /
			(attacker.cost?.points || 1),
		full: "own cost traded",
	},
	roundsToClear: {
		label: "Rounds to clear",
		get: (t) => t.roundsToClear,
		digits: 1,
		lowerIsBetter: true,
		share: woundShare,
		full: "cleared in one round",
	},
};

/** A metric value, formatted with its digits and suffix. */
export function formatValue(key, value) {
	const { digits = 2, suffix = "" } = METRICS[key];
	return `${format(value, digits)}${suffix}`;
}
