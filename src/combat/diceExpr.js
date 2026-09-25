/**
 * Parsing and probability helpers for 40k random characteristics such as
 * `"2"`, `"D6"`, `"2D6"`, `"D3+3"`, `"D6-1"`.
 *
 * Grammar: `[N]D<S>[+/-M]` | `<M>`
 */

const DICE_PATTERN = /^(\d*)d(\d+)(?:([+-])(\d+))?$/;
const FLAT_PATTERN = /^([+-]?\d+)$/;
const EMPTY_VALUES = new Set(["", "-", "*", "n/a", "na", "user"]);

/** @returns {{ dice: number, sides: number, flat: number }} */
export function emptyExpr() {
	return { dice: 0, sides: 0, flat: 0 };
}

/**
 * @param {string|number|object|null|undefined} input
 * @returns {{ dice: number, sides: number, flat: number }|null} `null` when the
 * input is present but not understood, so callers can surface it as unknown.
 */
export function parseDiceExpr(input) {
	if (input === null || input === undefined) return emptyExpr();
	if (typeof input === "object") {
		return {
			dice: input.dice || 0,
			sides: input.sides || 0,
			flat: input.flat || 0,
		};
	}

	const raw = String(input).trim().toLowerCase().replace(/\s+/g, "");
	if (EMPTY_VALUES.has(raw)) return emptyExpr();

	const flat = raw.match(FLAT_PATTERN);
	if (flat) return { dice: 0, sides: 0, flat: Number(flat[1]) };

	const dice = raw.match(DICE_PATTERN);
	if (dice) {
		const sign = dice[3] === "-" ? -1 : 1;
		return {
			dice: dice[1] === "" ? 1 : Number(dice[1]),
			sides: Number(dice[2]),
			flat: dice[4] ? sign * Number(dice[4]) : 0,
		};
	}

	return null;
}

function toExpr(input) {
	if (input && typeof input === "object" && !Array.isArray(input)) {
		return {
			dice: input.dice || 0,
			sides: input.sides || 0,
			flat: input.flat || 0,
		};
	}
	return parseDiceExpr(input) ?? emptyExpr();
}

/** Expected value of a dice expression. */
export function mean(input) {
	const expr = toExpr(input);
	return expr.dice * ((expr.sides + 1) / 2) + expr.flat;
}

/**
 * Full probability mass function, indexed by value.
 * Values below `min` are folded into `min` (11th ed. hard bounds: S/T/D/A ≥ 1).
 */
export function pmf(input, min = 0) {
	const expr = toExpr(input);

	let dist = [1];
	for (let i = 0; i < expr.dice; i++) {
		if (expr.sides < 1) break;
		const next = new Array(dist.length + expr.sides).fill(0);
		for (let v = 0; v < dist.length; v++) {
			if (!dist[v]) continue;
			for (let face = 1; face <= expr.sides; face++) {
				next[v + face] += dist[v] / expr.sides;
			}
		}
		dist = next;
	}

	const shifted = [];
	for (let v = 0; v < dist.length; v++) {
		if (!dist[v]) continue;
		const value = Math.max(min, v + expr.flat);
		shifted[value] = (shifted[value] || 0) + dist[v];
	}
	for (let i = 0; i < shifted.length; i++) {
		if (shifted[i] === undefined) shifted[i] = 0;
	}
	return shifted.length ? shifted : [1];
}

/** Adds a flat bonus to the characteristic itself (e.g. `[MELTA 2]` on `D6+1`). */
export function addFlat(input, bonus) {
	const expr = toExpr(input);
	return { ...expr, flat: expr.flat + bonus };
}

/** Human-readable form, used in the UI breakdown tables. */
export function formatDiceExpr(input) {
	const expr = toExpr(input);
	if (!expr.dice) return String(expr.flat);
	const head = `${expr.dice > 1 ? expr.dice : ""}D${expr.sides}`;
	if (!expr.flat) return head;
	return `${head}${expr.flat > 0 ? "+" : "-"}${Math.abs(expr.flat)}`;
}
