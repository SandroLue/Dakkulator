/**
 * Pure probability helpers for the 11th-edition attack sequence (§05).
 *
 * Sign convention, used consistently across the engine:
 *   - `skillModifier`  — a **characteristic** modifier. `+1` means "improve
 *     BS/WS by 1" (the target number goes down). Cumulative, no ±1 cap (§4.9).
 *   - `rollModifier`   — a **dice roll** modifier. `+1` means "+1 to the roll".
 *     Summed then clamped to ±1 (§02.02.01).
 */

export function clamp(value, min, max) {
	return Math.min(max, Math.max(min, value));
}

/** `"3+"` -> `3`. Multi-profile strings such as `"3+|4+"` take the first value. */
export function parseSkill(value, fallback = 4) {
	if (typeof value === "number") return value;
	if (value === null || value === undefined) return fallback;
	const text = String(value).trim();
	if (!text || text === "-" || text === "N/A") return fallback;
	const plus = text.match(/(\d+)\s*\+/);
	if (plus) return Number(plus[1]);
	const bare = Number(text);
	return Number.isFinite(bare) ? bare : fallback;
}

/** AP is printed negative; the engine works with the magnitude. */
export function parseAp(value) {
	if (value === null || value === undefined) return 0;
	const match = String(value).match(/-?\d+/);
	return match ? Math.abs(Number(match[0])) : 0;
}

/** Re-rolls happen before modifiers, so they act on the unmodified die. */
function rerollFactor(mode, successProbability) {
	if (mode === "ones") return 1 / 6;
	if (mode === "all") return 1 - successProbability;
	return 0;
}

/** p' = p + P(re-rolled) * p */
export function applyReroll(
	probability,
	mode,
	successProbability = probability,
) {
	const factor = rerollFactor(mode, successProbability);
	return probability + factor * probability;
}

export function applyModifiers({
	skill,
	skillModifier = 0,
	rollModifier = 0,
	ignoreNegative = false,
}) {
	// §02.02.02 — "ignore modifiers" is optional per modifier, so the optimal
	// play is to drop only the detrimental ones.
	const characteristic = ignoreNegative
		? Math.max(skillModifier, 0)
		: skillModifier;
	const roll = ignoreNegative ? Math.max(rollModifier, 0) : rollModifier;
	return {
		effectiveSkill: clamp(skill - characteristic, 1, 7),
		rollModifier: clamp(roll, -1, 1),
	};
}

/**
 * §05.01. An unmodified 1 always fails and an unmodified 6 always hits, so the
 * target number is clamped to 2..6.
 */
export function hitProbability({
	skill,
	skillModifier = 0,
	rollModifier = 0,
	torrent = false,
	reroll = "none",
	indirect = false,
	indirectSpotted = false,
	ignoreNegative = false,
}) {
	if (torrent) {
		// No hit roll is made, so there is no critical hit.
		return { hit: 1, critHit: 0, target: null, autoHit: true };
	}

	const modified = applyModifiers({
		skill,
		skillModifier,
		rollModifier,
		ignoreNegative,
	});
	let target = clamp(modified.effectiveSkill - modified.rollModifier, 2, 6);

	// §24.19 — indirect fire sets a floor on the unmodified roll and forbids
	// hit re-rolls.
	let rerollMode = reroll;
	if (indirect) {
		target = Math.max(target, indirectSpotted ? 4 : 6);
		rerollMode = "none";
	}

	const base = (7 - target) / 6;
	return {
		hit: applyReroll(base, rerollMode),
		critHit: applyReroll(1 / 6, rerollMode, base),
		target,
		autoHit: false,
	};
}

/** §05.02 wound table. */
export function woundThreshold(strength, toughness) {
	if (strength >= 2 * toughness) return 2;
	if (strength > toughness) return 3;
	if (strength === toughness) return 4;
	if (strength * 2 <= toughness) return 6;
	return 5;
}

/**
 * §05.02 plus `[ANTI-X Y+]` (§24.03) and `[TWIN-LINKED]` (§24.38).
 * `anti` entries are `{ keyword, threshold }`; `targetKeywords` is a Set of
 * upper-case keywords.
 */
export function woundProbability({
	strength,
	toughness,
	rollModifier = 0,
	anti = [],
	targetKeywords = new Set(),
	twinLinked = false,
	reroll = "none",
	ignoreNegative = false,
}) {
	const threshold = woundThreshold(strength, toughness);
	const roll = clamp(
		ignoreNegative ? Math.max(rollModifier, 0) : rollModifier,
		-1,
		1,
	);
	const target = clamp(threshold - roll, 2, 6);

	let critTarget = 6;
	for (const entry of anti) {
		if (!targetKeywords.has(entry.keyword)) continue;
		critTarget = Math.min(critTarget, clamp(entry.threshold, 2, 6));
	}

	const baseCrit = (7 - critTarget) / 6;
	// A critical wound always wounds, so it is a lower bound on P(wound).
	const base = Math.max((7 - target) / 6, baseCrit);

	const mode = twinLinked ? "all" : reroll;
	return {
		wound: applyReroll(base, mode),
		critWound: applyReroll(baseCrit, mode, base),
		target,
		critTarget,
	};
}

/**
 * §05.03. One D6 is compared against both saves and the better outcome for the
 * defender applies automatically. A roll of 1 always fails.
 */
export function saveProbability({ save, invuln, ap = 0, apModifier = 0 }) {
	const armour = parseSkill(save, 7);
	const invulnerable = invuln ? parseSkill(invuln, 7) : 7;
	// AP cannot be worsened past 0 (§4.9 hard bounds).
	const armourPenetration = Math.max(0, parseAp(ap) + apModifier);

	const target = clamp(
		Math.min(armour + armourPenetration, invulnerable),
		2,
		7,
	);
	const saved = Math.max(0, (7 - target) / 6);
	return { save: saved, fail: 1 - saved, target };
}

/** §24.12 — probability a wound is *not* ignored. */
export function fnpFailProbability(fnp) {
	if (!fnp) return 1;
	const target = clamp(parseSkill(fnp, 7), 2, 7);
	return 1 - Math.max(0, (7 - target) / 6);
}
