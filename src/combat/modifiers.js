import { addFlat } from "./diceExpr";
import { parseSkill } from "./probability";
import { parseWeaponAbilities } from "./weaponKeywords";

/**
 * User-built modifiers.
 *
 * Datasheet, faction and detachment abilities are free text full of conditions,
 * so the engine does not interpret them. Instead the user composes an
 * ability's effect from the primitives below and decides when it is active.
 * Modifiers are plain JSON so they can be persisted and used as a cache key.
 */

export const LISTS = ["A", "B", "any"];
export const ROLES = ["attacking", "defending"];
export const PHASES = ["any", "shooting", "fight"];
export const REROLL_MODES = ["none", "ones", "all"];

/** Numeric effects, always from the attack's point of view (+1 helps the attacker). */
export const NUMERIC_EFFECTS = {
	attacking: [
		"skillModifier",
		"hitModifier",
		"woundModifier",
		"apModifier",
		"strengthModifier",
		"attacksModifier",
		"damageModifier",
	],
	defending: ["hitModifier", "woundModifier", "apModifier", "damageModifier"],
};

export const EFFECT_LABELS = {
	skillModifier: "BS / WS",
	hitModifier: "Hit roll",
	woundModifier: "Wound roll",
	apModifier: "AP",
	strengthModifier: "Strength",
	attacksModifier: "Attacks",
	damageModifier: "Damage",
};

const pick = (value, allowed, fallback) =>
	allowed.includes(value) ? value : fallback;

const toInt = (value) => {
	const n = Math.trunc(Number(value));
	return Number.isFinite(n) ? Math.max(-6, Math.min(6, n)) : 0;
};

const toThreshold = (value) => {
	const n = Math.trunc(Number(String(value ?? "").replace("+", "")));
	return n >= 2 && n <= 6 ? n : null;
};

const newId = () =>
	`${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Fills defaults and drops anything malformed, e.g. from localStorage. */
export function normalizeModifier(raw = {}) {
	const modifier = {
		id: String(raw.id || newId()),
		name: String(raw.name ?? "").slice(0, 80),
		enabled: raw.enabled !== false,
		list: pick(raw.list, LISTS, "A"),
		unitName: typeof raw.unitName === "string" ? raw.unitName : "",
		role: pick(raw.role, ROLES, "attacking"),
		phase: pick(raw.phase, PHASES, "any"),
		vsKeywords: typeof raw.vsKeywords === "string" ? raw.vsKeywords : "",
		rerollHits: pick(raw.rerollHits, REROLL_MODES, "none"),
		rerollWounds: pick(raw.rerollWounds, REROLL_MODES, "none"),
		weaponAbilities:
			typeof raw.weaponAbilities === "string" ? raw.weaponAbilities : "",
		ignoreHitModifiers: raw.ignoreHitModifiers === true,
		fnp: toThreshold(raw.fnp),
		invuln: toThreshold(raw.invuln),
		cover: raw.cover === true,
	};
	for (const key of NUMERIC_EFFECTS.attacking) modifier[key] = toInt(raw[key]);
	return modifier;
}

export function createModifier(overrides = {}) {
	return normalizeModifier({ ...overrides, id: newId() });
}

export function parseModifierList(json) {
	try {
		const parsed = JSON.parse(json || "[]");
		return Array.isArray(parsed) ? parsed.map(normalizeModifier) : [];
	} catch {
		return [];
	}
}

export function parseKeywords(text) {
	return [
		...new Set(
			String(text ?? "")
				.split(/,|\bor\b|\//i)
				.map((k) => k.trim().toUpperCase())
				.filter(Boolean),
		),
	];
}

function keywordSet(unit) {
	return new Set(
		[...(unit?.keywords || [])].map((k) => String(k).toUpperCase()),
	);
}

function belongsTo(modifier, unit, list) {
	if (modifier.list !== "any" && modifier.list !== list) return false;
	if (!modifier.unitName) return true;
	return (
		unit?.name === modifier.unitName ||
		Boolean(unit?.attachedFrom?.includes(modifier.unitName))
	);
}

function opponentMatches(modifier, opponent) {
	const required = parseKeywords(modifier.vsKeywords);
	if (!required.length) return true;
	const keywords = keywordSet(opponent);
	return required.some((keyword) => keywords.has(keyword));
}

/** The enabled modifiers that affect one attacker → defender pairing. */
export function selectModifiers(
	modifiers,
	{ attacker, defender, attackerList = "A", defenderList = "B", phase },
) {
	const active = (modifiers || [])
		.map(normalizeModifier)
		.filter((m) => m.enabled && (m.phase === "any" || m.phase === phase));
	return {
		attacking: active.filter(
			(m) =>
				m.role === "attacking" &&
				belongsTo(m, attacker, attackerList) &&
				opponentMatches(m, defender),
		),
		defending: active.filter(
			(m) =>
				m.role === "defending" &&
				belongsTo(m, defender, defenderList) &&
				opponentMatches(m, attacker),
		),
	};
}

const REROLL_RANK = { none: 0, ones: 1, all: 2 };
const bestReroll = (a, b) => (REROLL_RANK[b] > REROLL_RANK[a] ? b : a);

/** Grants weapon abilities on top of a weapon's own; duplicates keep the best (§24.02). */
export function mergeAbilities(base, extra) {
	const merged = {
		...base,
		anti: base.anti.map((a) => ({ ...a })),
		restrictions: { ...base.restrictions },
		raw: { ...base.raw },
		unknown: [...base.unknown, ...extra.unknown],
	};
	for (const [key, value] of Object.entries(extra)) {
		const restriction = extra.restrictions[key];
		if (value === true) {
			if (!base[key]) {
				merged[key] = true;
				if (restriction) merged.restrictions[key] = restriction;
			} else if (!restriction) {
				delete merged.restrictions[key];
			}
		} else if (typeof value === "number" && value > (base[key] || 0)) {
			if (restriction && base[key]) continue;
			merged[key] = value;
			merged.raw[key] = extra.raw[key];
			if (restriction) merged.restrictions[key] = restriction;
			else delete merged.restrictions[key];
		}
	}
	for (const entry of extra.anti) {
		const existing = merged.anti.find((a) => a.keyword === entry.keyword);
		if (existing)
			existing.threshold = Math.min(existing.threshold, entry.threshold);
		else merged.anti.push({ ...entry });
	}
	return merged;
}

function total(modifiers, role, key) {
	if (!NUMERIC_EFFECTS[role].includes(key)) return 0;
	return modifiers.reduce((sum, m) => sum + (m[key] || 0), 0);
}

/**
 * Folds the selected modifiers into the resolver inputs.
 * @returns `{ ctx, profiles, groups, applied }` — `applied` lists modifier names
 */
export function applyUserModifiers({
	ctx,
	profiles,
	groups,
	attacking = [],
	defending = [],
}) {
	if (!attacking.length && !defending.length) {
		return { ctx, profiles, groups, applied: [] };
	}
	const both = (key) =>
		total(attacking, "attacking", key) + total(defending, "defending", key);

	const nextCtx = {
		...ctx,
		skillModifier: (ctx.skillModifier || 0) + both("skillModifier"),
		hitModifier: (ctx.hitModifier || 0) + both("hitModifier"),
		woundModifier: (ctx.woundModifier || 0) + both("woundModifier"),
		apModifier: (ctx.apModifier || 0) + both("apModifier"),
		damageModifier: (ctx.damageModifier || 0) + both("damageModifier"),
		rerollHits: attacking.reduce(
			(mode, m) => bestReroll(mode, m.rerollHits),
			ctx.rerollHits || "none",
		),
		rerollWounds: attacking.reduce(
			(mode, m) => bestReroll(mode, m.rerollWounds),
			ctx.rerollWounds || "none",
		),
		ignoreHitModifiers:
			Boolean(ctx.ignoreHitModifiers) ||
			attacking.some((m) => m.ignoreHitModifiers),
		targetInCover: Boolean(ctx.targetInCover) || defending.some((m) => m.cover),
	};

	const strength = both("strengthModifier");
	const attacks = both("attacksModifier");
	const granted = attacking
		.map((m) => m.weaponAbilities.trim())
		.filter(Boolean)
		.map(parseWeaponAbilities);
	let nextProfiles = profiles;
	if (strength || attacks || granted.length) {
		const modify = (profile) => ({
			...profile,
			strength: Math.max(1, profile.strength + strength),
			attacksExpr: attacks
				? addFlat(profile.attacksExpr, attacks)
				: profile.attacksExpr,
			abilities: granted.reduce(mergeAbilities, profile.abilities),
		});
		nextProfiles = profiles.map(modify);
		nextProfiles.alternatives = (profiles.alternatives || []).map(modify);
	}

	// A modifier on one member of an attached unit protects only that member's models.
	const covers = (m, group) => !m.unitName || group.unitName === m.unitName;
	const nextGroups = groups.map((group) => {
		let fnp = group.fnp || 7;
		let invuln = group.invuln ? parseSkill(group.invuln, 7) : 7;
		for (const m of defending) {
			if (!covers(m, group)) continue;
			if (m.fnp) fnp = Math.min(fnp, m.fnp);
			if (m.invuln) invuln = Math.min(invuln, m.invuln);
		}
		return {
			...group,
			fnp: fnp < 7 ? fnp : group.fnp,
			invuln: invuln < 7 ? `${invuln}+` : group.invuln,
		};
	});

	return {
		ctx: nextCtx,
		profiles: nextProfiles,
		groups: nextGroups,
		applied: [...attacking, ...defending].map(modifierLabel),
	};
}

const signed = (n) => (n > 0 ? `+${n}` : `${n}`);
const REROLL_LABEL = { ones: "1s", all: "all" };

/** One-line summary for the modifier list. */
export function describeModifier(raw) {
	const m = normalizeModifier(raw);
	const conditions = [
		m.role === "attacking" ? "when attacking" : "when defending",
		m.phase === "any" ? null : `${m.phase} only`,
		parseKeywords(m.vsKeywords).length
			? `vs ${parseKeywords(m.vsKeywords).join(" / ")}`
			: null,
	].filter(Boolean);

	return `${describeEffects(m)} — ${conditions.join(", ")}`;
}

/** The ability name, or its effects when the user left the name blank. */
export function modifierLabel(raw) {
	return String(raw?.name ?? "").trim() || describeEffects(raw);
}

function describeEffects(raw) {
	const m = normalizeModifier(raw);
	const effects = [];
	for (const key of NUMERIC_EFFECTS[m.role]) {
		if (m[key]) effects.push(`${signed(m[key])} ${EFFECT_LABELS[key]}`);
	}
	if (m.role === "attacking") {
		if (m.rerollHits !== "none")
			effects.push(`re-roll hits (${REROLL_LABEL[m.rerollHits]})`);
		if (m.rerollWounds !== "none")
			effects.push(`re-roll wounds (${REROLL_LABEL[m.rerollWounds]})`);
		if (m.weaponAbilities.trim()) effects.push(m.weaponAbilities.trim());
		if (m.ignoreHitModifiers) effects.push("ignore hit modifiers");
	} else {
		if (m.fnp) effects.push(`Feel No Pain ${m.fnp}+`);
		if (m.invuln) effects.push(`${m.invuln}+ invulnerable`);
		if (m.cover) effects.push("benefit of cover");
	}
	return effects.join(", ") || "no effect";
}

/** The army a roster belongs to, e.g. "Imperium - Adeptus Custodes". */
export const armyOf = (roster) => roster?.forces?.[0]?.catalog || "";

/**
 * Modifiers are stored per army: `{ armies: { [army]: Modifier[] }, shared }`.
 * A list-A or list-B modifier belongs to that list's army, so it comes back
 * whenever a roster of the same army is loaded, in either slot. "Both lists"
 * modifiers belong to no army and are `shared`.
 */
export function parseModifierStore(json) {
	try {
		const parsed = JSON.parse(json || "{}");
		const armies = {};
		for (const [army, list] of Object.entries(parsed?.armies ?? {})) {
			if (Array.isArray(list)) armies[army] = list.map(normalizeModifier);
		}
		const shared = Array.isArray(parsed?.shared)
			? parsed.shared.map(normalizeModifier)
			: [];
		return { armies, shared };
	} catch {
		return { armies: {}, shared: [] };
	}
}

/** The modifiers in play for the two loaded armies, labelled with their list. */
export function modifiersForArmies(store, armyA, armyB) {
	const mirror = armyA === armyB;
	const forList = (army, list) =>
		(store.armies[army] ?? [])
			// In a mirror match both lists share one army; the stored list tells them apart.
			.filter((m) => !mirror || m.list === list)
			.map((m) => (m.list === list ? m : { ...m, list }));
	return [
		...forList(armyA, "A"),
		...forList(armyB, "B"),
		...store.shared.filter((m) => m.list === "any"),
	];
}

/** Writes the edited modifiers back to the loaded armies; other armies are kept. */
export function storeModifiersForArmies(store, armyA, armyB, modifiers) {
	const ofList = (list) => modifiers.filter((m) => m.list === list);
	const armies = { ...store.armies };
	if (armyA === armyB) {
		armies[armyA] = [...ofList("A"), ...ofList("B")];
	} else {
		armies[armyA] = ofList("A");
		armies[armyB] = ofList("B");
	}
	for (const [army, list] of Object.entries(armies)) {
		if (!list.length) delete armies[army];
	}
	return { armies, shared: ofList("any") };
}
