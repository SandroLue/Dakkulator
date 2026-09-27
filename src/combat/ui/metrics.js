import { getUnitTotalModels } from "../profiles";

/** The metrics the results matrix and the comparison panel can show. */

export const format = (value, digits = 2) =>
	Number.isFinite(value) ? value.toFixed(digits) : "∞";

const woundShare = (t) =>
	Number.isFinite(t.roundsToClear) && t.roundsToClear > 0
		? 1 / t.roundsToClear
		: 0;

/**
 * `get` fills the cell; `share` colours it on a fixed 0–1 scale so the colour
 * means the same in every matchup (1 = `full`). ★ marks the best attacker
 * against each defender. `short` heads the comparison table.
 */
export const METRICS = {
	pointsReturn: {
		label: "Efficiency (% of own cost removed)",
		short: "Efficiency",
		get: (t) => t.pointsReturnPer100,
		digits: 0,
		suffix: "%",
		share: (t) => (t.pointsReturnPer100 ?? 0) / 100,
		full: "own cost removed",
		// Points' worth of the target removed, out of the target's cost.
		detail: (t, _attacker, defender) =>
			`${format(t.pointsRemoved ?? 0, 0)} / ${defender.cost?.points ?? 0} pts`,
	},
	woundsLost: {
		label: "Wounds lost",
		short: "Wounds lost",
		get: (t) => t.woundsLost,
		share: woundShare,
		full: "unit wiped",
	},
	modelsSlain: {
		label: "Models slain",
		short: "Models slain",
		get: (t) => t.modelsSlain,
		share: (t, _attacker, defender) =>
			t.modelsSlain / (getUnitTotalModels(defender) || 1),
		full: "unit wiped",
	},
	pointsKilled: {
		label: "Points killed",
		short: "Points killed",
		get: (t) => t.pointsKilled,
		digits: 0,
		share: (t, _attacker, defender) =>
			t.pointsKilled / (defender.cost?.points || 1),
		full: "unit wiped",
	},
	damagePer100Points: {
		label: "Wounds lost / 100 pts",
		short: "Wounds / 100 pts",
		get: (t) => t.damagePer100Points,
		digits: 1,
		// Points' worth of wounds dealt, relative to the attacker's own cost.
		share: (t, attacker, defender) =>
			(woundShare(t) * (defender.cost?.points || 0)) /
			(attacker.cost?.points || 1),
		full: "own cost traded",
	},
	pDestroyed: {
		label: "P(unit destroyed)",
		short: "P(destroyed)",
		get: (t) => t.pDestroyed * 100,
		digits: 0,
		suffix: "%",
		share: (t) => t.pDestroyed,
		full: "certain kill",
	},
	roundsToClear: {
		label: "Rounds to clear",
		short: "Rounds to clear",
		get: (t) => t.roundsToClear,
		digits: 1,
		lowerIsBetter: true,
		share: woundShare,
		full: "cleared in one round",
	},
};

/** A metric's value for one pairing, formatted with its digits and suffix. */
export function formatMetric(key, totals) {
	const { get, digits = 2, suffix = "" } = METRICS[key];
	return `${format(get(totals), digits)}${suffix}`;
}
