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

const LISTS = ["A", "B", "any"];
const ROLES = ["attacking", "defending"];
export const PHASES = ["any", "shooting", "fight"];
export const REROLL_MODES = ["none", "ones", "all"];
export const STRENGTH_VS_TOUGHNESS_MODES = ["", "gt", "gte", "lt", "lte"];
export const STAT_EFFECTS = {
	toughnessChange: "Toughness",
	saveChange: "Save",
	woundsChange: "Wounds",
};

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
	// A defensive modifier can also weaken the attacking weapons (-1 S, -1 A).
	defending: [
		"hitModifier",
		"woundModifier",
		"apModifier",
		"damageModifier",
		"strengthModifier",
		"attacksModifier",
	],
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
		// In an attached unit, only the named member's own models ("the bearer",
		// "this model"), not the whole unit it leads or joins.
		ownModelsOnly: raw.ownModelsOnly === true,
		role: pick(raw.role, ROLES, "attacking"),
		phase: pick(raw.phase, PHASES, "any"),
		vsKeywords: typeof raw.vsKeywords === "string" ? raw.vsKeywords : "",
		// …and not against these ("an enemy unit (excluding MONSTERS)").
		excludeVsKeywords:
			typeof raw.excludeVsKeywords === "string" ? raw.excludeVsKeywords : "",
		// Only the attacking weapons named so or with that keyword: "Solitaire",
		// "TORRENT", "PSYCHIC" (a psychic attack).
		weaponFilter: typeof raw.weaponFilter === "string" ? raw.weaponFilter : "",
		// Feel No Pain against mortal wounds only ([DEVASTATING WOUNDS]).
		mortalFnp: toThreshold(raw.mortalFnp),
		// Which of the list's own units it is for, by keyword ("TERMAGANTS"),
		// and which are left out ("MONSTER, VEHICLE").
		unitKeywords: typeof raw.unitKeywords === "string" ? raw.unitKeywords : "",
		excludeUnitKeywords:
			typeof raw.excludeUnitKeywords === "string"
				? raw.excludeUnitKeywords
				: "",
		rerollHits: pick(raw.rerollHits, REROLL_MODES, "none"),
		rerollWounds: pick(raw.rerollWounds, REROLL_MODES, "none"),
		weaponAbilities:
			typeof raw.weaponAbilities === "string" ? raw.weaponAbilities : "",
		ignoreHitModifiers: raw.ignoreHitModifiers === true,
		ignoreWoundModifiers: raw.ignoreWoundModifiers === true,
		// "a critical hit/wound is scored on an unmodified roll of N+"
		critHitOn: toThreshold(raw.critHitOn),
		critWoundOn: toThreshold(raw.critWoundOn),
		rerollDamage: raw.rerollDamage === true,
		fnp: toThreshold(raw.fnp),
		invuln: toThreshold(raw.invuln),
		cover: raw.cover === true,
		// Incoming attacks: "halve the Damage" (rounding up), "change the Damage to 1".
		halveDamage: raw.halveDamage === true,
		damageToOne: raw.damageToOne === true,
		// The attacked models' own characteristics, natural signs: +1 T is T+1 and
		// +1 Save is a better save. A defensive modifier changes its own unit, an
		// attacking one the target ("subtract 1 from the Toughness of that unit").
		toughnessChange: toInt(raw.toughnessChange),
		saveChange: toInt(raw.saveChange),
		woundsChange: toInt(raw.woundsChange),
		// Only for attacks whose Strength compares so to the target's Toughness.
		strengthVsToughness: pick(
			raw.strengthVsToughness,
			STRENGTH_VS_TOUGHNESS_MODES,
			"",
		),
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

/**
 * Whether a unit has a keyword phrase. Rosters split keywords ("Khorne",
 * "Legiones Daemonica") where rules join them ("KHORNE LEGIONES DAEMONICA"),
 * so a phrase also matches when every word of it is among the unit's keywords.
 */
function hasKeyword(unit, phrase) {
	const keywords = keywordSet(unit);
	if (keywords.has(phrase)) return true;
	const words = new Set(
		[...keywords].flatMap((k) => k.replace(/^FACTION:\s*/, "").split(/\s+/)),
	);
	return phrase.split(/\s+/).every((word) => words.has(word));
}

function belongsTo(modifier, unit, list) {
	if (modifier.list !== "any" && modifier.list !== list) return false;
	const only = parseKeywords(modifier.unitKeywords);
	if (only.length && !only.some((k) => hasKeyword(unit, k))) return false;
	const not = parseKeywords(modifier.excludeUnitKeywords);
	if (not.some((k) => hasKeyword(unit, k))) return false;
	if (!modifier.unitName) return true;
	return (
		unit?.name === modifier.unitName ||
		Boolean(unit?.attachedFrom?.includes(modifier.unitName))
	);
}

function opponentMatches(modifier, opponent) {
	const keywords = keywordSet(opponent);
	const required = parseKeywords(modifier.vsKeywords);
	if (required.length && !required.some((k) => keywords.has(k))) return false;
	const excluded = parseKeywords(modifier.excludeVsKeywords);
	return !excluded.some((k) => keywords.has(k));
}

/** Whether a weapon profile is one a "weaponFilter" names, by name or keyword. */
function weaponMatches(modifier, profile) {
	const wanted = parseKeywords(modifier.weaponFilter);
	if (!wanted.length) return true;
	const text =
		`${profile.weaponName ?? ""} ${profile.weaponKeywords ?? ""}`.toUpperCase();
	return wanted.some((w) => text.includes(w));
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
function mergeAbilities(base, extra) {
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

/**
 * Grants ability strings, e.g. `"[LETHAL HITS]"`, to every profile.
 * `baseAbilities` keeps the weapon's own, so the UI can tell granted ones apart.
 */
export function grantAbilities(profiles, texts) {
	const granted = texts
		.map((text) => text.trim())
		.filter(Boolean)
		.map(parseWeaponAbilities);
	if (!granted.length) return profiles;
	const grant = (profile) => ({
		...profile,
		baseAbilities: profile.baseAbilities ?? profile.abilities,
		abilities: granted.reduce(mergeAbilities, profile.abilities),
	});
	const next = profiles.map(grant);
	next.alternatives = (profiles.alternatives || []).map(grant);
	return next;
}

const statTotal = (modifiers, key) =>
	modifiers.reduce((sum, m) => sum + (m[key] || 0), 0);

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
	// "Attacks with a S greater than this unit's T": decided per weapon and
	// model group while resolving (`applyConditional`).
	const conditional = (m) =>
		m.strengthVsToughness !== "" || m.weaponFilter.trim() !== "";
	const always = (list) => list.filter((m) => !conditional(m));
	const attackingNow = always(attacking);
	const defendingNow = always(defending);
	// "Each time the bearer makes an attack": only that member's own weapons.
	const shared = attackingNow.filter((m) => !ownOnly(m));
	const own = attackingNow.filter(ownOnly);

	const nextCtx = attackerContext(ctx, shared, defendingNow);
	const pending = {
		attacking: attacking.filter(conditional),
		defending: defending.filter(conditional),
	};
	if (pending.attacking.length || pending.defending.length) {
		nextCtx.conditional = pending;
	}
	// A defender's -1 S / -1 A weakens every weapon attacking it.
	let nextProfiles = modifyProfiles(profiles, [...shared, ...defendingNow]);
	if (own.length) {
		const forMember = (profile) => {
			const mods = own.filter((m) => m.unitName === profile.sourceUnitName);
			if (!mods.length) return profile;
			return {
				...modifyProfiles([profile], mods)[0],
				context: attackerContext(nextCtx, mods, []),
			};
		};
		const alternatives = nextProfiles.alternatives || [];
		nextProfiles = nextProfiles.map(forMember);
		nextProfiles.alternatives = alternatives.map(forMember);
	}

	return {
		ctx: nextCtx,
		profiles: nextProfiles,
		groups: groups.map((group) =>
			modifyGroup(group, attackingNow, defendingNow),
		),
		applied: [...attacking, ...defending].map(modifierLabel),
	};
}

const ownOnly = (m) => m.ownModelsOnly && m.unitName;

// A modifier on one member of an attached unit protects only that member's
// models when it says so ("attacks allocated to this model").
const covers = (m, group) => !ownOnly(m) || group.unitName === m.unitName;

const STRENGTH_VS_TOUGHNESS = {
	gt: (s, t) => s > t,
	gte: (s, t) => s >= t,
	lt: (s, t) => s < t,
	lte: (s, t) => s <= t,
};

/**
 * The modifiers whose Strength-vs-Toughness condition holds for one weapon
 * against one model group, folded into that pairing's inputs.
 */
export function applyConditional(profile, group, ctx) {
	const pending = ctx.conditional;
	if (!pending) return { profile, group, ctx };
	const holds = (m) =>
		weaponMatches(m, profile) &&
		(!m.strengthVsToughness ||
			STRENGTH_VS_TOUGHNESS[m.strengthVsToughness](
				profile.strength,
				group.toughness,
			));
	const attacking = pending.attacking.filter(
		(m) => holds(m) && (!ownOnly(m) || m.unitName === profile.sourceUnitName),
	);
	const defending = pending.defending.filter(
		(m) => holds(m) && covers(m, group),
	);
	if (!attacking.length && !defending.length) return { profile, group, ctx };
	return {
		profile: modifyProfiles([profile], [...attacking, ...defending])[0],
		// Its stat changes do not feed back into the condition that enabled it.
		group: modifyGroup(group, attacking, defending),
		ctx: attackerContext(ctx, attacking, defending),
	};
}

/** Save, Toughness, Wounds and the per-model defensive effects of one model group. */
function modifyGroup(group, attacking, defending) {
	let fnp = group.fnp || 7;
	let mortalFnp = group.mortalFnp || 7;
	let invuln = group.invuln ? parseSkill(group.invuln, 7) : 7;
	let apModifier = 0;
	let damageModifier = 0;
	let halveDamage = Boolean(group.halveDamage);
	let damageToOne = Boolean(group.damageToOne);
	// An attacker's stat effects change the target's models ("Afflicted: -1 T").
	let toughness = statTotal(attacking, "toughnessChange");
	let save = statTotal(attacking, "saveChange");
	let wounds = statTotal(attacking, "woundsChange");
	for (const m of defending) {
		if (!covers(m, group)) continue;
		if (m.fnp) fnp = Math.min(fnp, m.fnp);
		if (m.mortalFnp) mortalFnp = Math.min(mortalFnp, m.mortalFnp);
		if (m.invuln) invuln = Math.min(invuln, m.invuln);
		apModifier += m.apModifier || 0;
		damageModifier += m.damageModifier || 0;
		halveDamage ||= m.halveDamage;
		damageToOne ||= m.damageToOne;
		toughness += m.toughnessChange || 0;
		save += m.saveChange || 0;
		wounds += m.woundsChange || 0;
	}
	const baseSave = parseSkill(group.save, 7);
	return {
		...group,
		fnp: fnp < 7 ? fnp : group.fnp,
		mortalFnp: mortalFnp < 7 ? mortalFnp : (group.mortalFnp ?? null),
		invuln: invuln < 7 ? `${invuln}+` : group.invuln,
		apModifier: (group.apModifier || 0) + apModifier,
		damageModifier: (group.damageModifier || 0) + damageModifier,
		halveDamage,
		damageToOne,
		toughness: Math.max(1, (group.toughness || 4) + toughness),
		// "Improve the Save by 1" lowers the number; never better than 2+ (no save stays none).
		save:
			save && baseSave < 7
				? `${Math.min(7, Math.max(2, baseSave - save))}+`
				: group.save,
		wounds: Math.max(1, (group.wounds || 1) + wounds),
	};
}

/** Granted abilities, and Strength and Attacks from either side's modifiers. */
function modifyProfiles(profiles, attacking) {
	const strength = total(attacking, "attacking", "strengthModifier");
	const attacks = total(attacking, "attacking", "attacksModifier");
	let next = grantAbilities(
		profiles,
		attacking
			.filter((m) => m.role !== "defending")
			.map((m) => m.weaponAbilities),
	);
	if (strength || attacks) {
		const modify = (profile) => ({
			...profile,
			strength: Math.max(1, profile.strength + strength),
			attacksExpr: attacks
				? addFlat(profile.attacksExpr, attacks)
				: profile.attacksExpr,
		});
		const alternatives = next.alternatives || [];
		next = next.map(modify);
		next.alternatives = alternatives.map(modify);
	}
	return next;
}

/** The resolver context with the modifiers' roll, re-roll and critical effects. */
function attackerContext(ctx, attacking, defending) {
	const both = (key) =>
		total(attacking, "attacking", key) + total(defending, "defending", key);
	// The positive contributions alone, so "ignore modifiers" can drop just the negatives.
	const bonus = (key) =>
		[
			...attacking.filter(() => NUMERIC_EFFECTS.attacking.includes(key)),
			...defending.filter(() => NUMERIC_EFFECTS.defending.includes(key)),
		].reduce((sum, m) => sum + Math.max(m[key] || 0, 0), 0);

	return {
		...ctx,
		skillModifier: (ctx.skillModifier || 0) + both("skillModifier"),
		hitModifier: (ctx.hitModifier || 0) + both("hitModifier"),
		skillModifierBonus:
			(ctx.skillModifierBonus ?? Math.max(ctx.skillModifier || 0, 0)) +
			bonus("skillModifier"),
		hitModifierBonus:
			(ctx.hitModifierBonus ?? Math.max(ctx.hitModifier || 0, 0)) +
			bonus("hitModifier"),
		woundModifier: (ctx.woundModifier || 0) + both("woundModifier"),
		// A defender's AP and Damage modifiers act after allocation, per model
		// group (see below); only the attacker's go into the shared context.
		apModifier:
			(ctx.apModifier || 0) + total(attacking, "attacking", "apModifier"),
		damageModifier:
			(ctx.damageModifier || 0) +
			total(attacking, "attacking", "damageModifier"),
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
		ignoreWoundModifiers:
			Boolean(ctx.ignoreWoundModifiers) ||
			attacking.some((m) => m.ignoreWoundModifiers),
		woundModifierBonus:
			(ctx.woundModifierBonus ?? Math.max(ctx.woundModifier || 0, 0)) +
			bonus("woundModifier"),
		// The best (lowest) threshold applies.
		critHitOn: Math.min(
			ctx.critHitOn ?? 6,
			...attacking.map((m) => m.critHitOn ?? 6),
		),
		critWoundOn: Math.min(
			ctx.critWoundOn ?? 6,
			...attacking.map((m) => m.critWoundOn ?? 6),
		),
		rerollDamage:
			Boolean(ctx.rerollDamage) || attacking.some((m) => m.rerollDamage),
		targetInCover: Boolean(ctx.targetInCover) || defending.some((m) => m.cover),
	};
}

const signed = (n) => (n > 0 ? `+${n}` : `${n}`);
const REROLL_LABEL = { ones: "1s", all: "all" };
export const STRENGTH_VS_TOUGHNESS_LABEL = {
	gt: ">",
	gte: "≥",
	lt: "<",
	lte: "≤",
};

/** One-line summary for the modifier list. */
export function describeModifier(raw) {
	const m = normalizeModifier(raw);
	const conditions = [
		m.role === "attacking" ? "when attacking" : "when defending",
		m.phase === "any" ? null : `${m.phase} only`,
		parseKeywords(m.vsKeywords).length
			? `vs ${parseKeywords(m.vsKeywords).join(" / ")}`
			: null,
		parseKeywords(m.excludeVsKeywords).length
			? `not vs ${parseKeywords(m.excludeVsKeywords).join(" / ")}`
			: null,
		m.strengthVsToughness
			? `if S ${STRENGTH_VS_TOUGHNESS_LABEL[m.strengthVsToughness]} T`
			: null,
		m.weaponFilter.trim() ? `${m.weaponFilter.trim()} weapons only` : null,
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
		if (m.ignoreWoundModifiers) effects.push("ignore wound modifiers");
		if (m.critHitOn) effects.push(`critical hits on ${m.critHitOn}+`);
		if (m.critWoundOn) effects.push(`critical wounds on ${m.critWoundOn}+`);
		if (m.rerollDamage) effects.push("re-roll damage");
	} else {
		if (m.fnp) effects.push(`Feel No Pain ${m.fnp}+`);
		if (m.mortalFnp)
			effects.push(`Feel No Pain ${m.mortalFnp}+ vs mortal wounds`);
		if (m.invuln) effects.push(`${m.invuln}+ invulnerable`);
		if (m.cover) effects.push("benefit of cover");
		if (m.halveDamage) effects.push("halve damage");
		if (m.damageToOne) effects.push("damage becomes 1");
	}
	// Characteristics of the models being attacked: the target's, or the unit's own.
	for (const [key, label] of Object.entries(STAT_EFFECTS)) {
		if (!m[key]) continue;
		const whose = m.role === "attacking" ? "target " : "";
		effects.push(`${signed(m[key])} ${whose}${label}`);
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
