import { mean, parseDiceExpr } from "./diceExpr";
import { parseAp, parseSkill } from "./probability";
import { parseWeaponAbilities } from "./weaponKeywords";

/**
 * Turns a parsed roster `Unit` into the flat attacker / defender shapes the
 * resolver consumes. Nothing here is React-aware.
 */

export const normalizeName = (value = "") =>
	String(value)
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();

/**
 * Fuzzy match between a `modelStats` entry and a `models` entry — `rangedWeapons`
 * are deduped across models, so this is how we find the carrier's BS/WS/S.
 * Originally from FancyScribe's datacard summary table.
 */
export function getNameMatchScore(statName = "", modelName = "") {
	const stat = normalizeName(statName);
	const model = normalizeName(modelName);
	if (!stat || !model) return 0;

	let score = 0;
	if (stat === model) score += 1000;
	if (stat.includes(model) || model.includes(stat)) score += 300;

	const statTokens = new Set(stat.split(" "));
	const modelTokens = new Set(model.split(" "));
	for (const token of statTokens) {
		if (token && modelTokens.has(token)) score += 30;
	}

	const statSergeant = statTokens.has("sergeant");
	const modelSergeant = modelTokens.has("sergeant");
	if (statSergeant && modelSergeant) score += 120;
	if (statSergeant !== modelSergeant) score -= 80;
	if (statTokens.has("squad") && modelSergeant) score -= 100;

	let prefix = 0;
	const maxPrefix = Math.min(stat.length, model.length);
	for (let i = 0; i < maxPrefix; i++) {
		if (stat[i] !== model[i]) break;
		prefix++;
	}
	return score + prefix;
}

/** The `modelStats` entry that best describes a given equipped `model`. */
export function findCarrierStats(unit, model) {
	const stats = unit?.modelStats || [];
	if (!stats.length) return null;
	if (stats.length === 1) return stats[0];

	let best = stats[0];
	let bestScore = getNameMatchScore(best.name, model?.name);
	for (const stat of stats.slice(1)) {
		const score = getNameMatchScore(stat.name, model?.name);
		if (score > bestScore) {
			best = stat;
			bestScore = score;
		}
	}
	return best;
}

export function getUnitTotalModels(unit) {
	return unit?.models?.reduce((sum, m) => sum + (m.count || 0), 0) || 0;
}

function modelCountForStat(unit, stat) {
	const models = unit?.models || [];
	const stats = unit?.modelStats || [];
	if (!models.length) return 1;
	if (stats.length <= 1) return getUnitTotalModels(unit) || 1;

	let best = models[0];
	let bestScore = getNameMatchScore(stat?.name, best?.name);
	for (const model of models.slice(1)) {
		const score = getNameMatchScore(stat?.name, model?.name);
		if (
			score > bestScore ||
			(score === bestScore && (model.count || 0) > (best.count || 0))
		) {
			best = model;
			bestScore = score;
		}
	}
	return best?.count || 1;
}

const ABILITY_PATTERNS = [
	{ key: "fightsFirst", re: /fights first/i },
	{ key: "stealth", re: /\bstealth\b/i },
	{ key: "loneOperative", re: /lone operative/i },
];

/**
 * Abilities that need no warning: either the engine already reads them off the
 * statline, or they only affect deployment/movement and cannot change a
 * damage calculation.
 */
const IGNORED_ABILITIES =
	/^(invulnerable save|deep strike|scouts?\b|infiltrators|leader)/i;

/** The glossary entry for the keyword, which spells the value as "X+". */
const FNP_GLOSSARY = /always takes the form/i;

/** Every `[name, description]` pair on a datasheet, abilities and rules alike. */
export function unitAbilityEntries(unit) {
	const entries = [];
	if (!unit) return entries;
	for (const group of Object.values(unit.abilities || {})) {
		if (!group?.forEach) continue;
		group.forEach((description, name) => entries.push([name, description]));
	}
	if (unit.rules?.forEach) {
		unit.rules.forEach((description, name) =>
			entries.push([name, description]),
		);
	}
	return entries;
}

/** §6.2 — regex-mine the free-text datasheet abilities. */
export function mineUnitAbilities(unit) {
	const result = {
		fnp: null,
		damaged: null,
		fightsFirst: false,
		stealth: false,
		loneOperative: false,
		deadlyDemise: null,
		/** ability names whose effect the engine does not model */
		unmodelled: [],
	};
	if (!unit) return result;

	for (const [name, description] of unitAbilityEntries(unit)) {
		const text = `${name} ${description ?? ""}`;
		let recognised = false;

		// The rules glossary ships a definition of the keyword itself; it grants
		// nothing, so neither apply nor warn about it.
		if (FNP_GLOSSARY.test(text)) continue;

		const fnp = text.match(/feel no pain\s*(\d)\s*\+(.{0,60})/i);
		if (fnp && !/\bagainst\b/i.test(fnp[2])) {
			const value = Number(fnp[1]);
			// Multiple FNP sources are not cumulative — keep the best.
			if (result.fnp === null || value < result.fnp) result.fnp = value;
			recognised = true;
		}

		const damaged = text.match(
			/damaged:?\s*(\d+)\s*-\s*(\d+)\s*wounds?\s*remaining/i,
		);
		if (damaged) {
			result.damaged = { min: Number(damaged[1]), max: Number(damaged[2]) };
			recognised = true;
		}

		const demise = text.match(/deadly demise\s*(d?\d+(?:\+\d+)?)/i);
		if (demise) {
			result.deadlyDemise = demise[1];
			recognised = true;
		}

		for (const pattern of ABILITY_PATTERNS) {
			if (pattern.re.test(text)) {
				result[pattern.key] = true;
				recognised = true;
			}
		}

		if (!recognised && name && !IGNORED_ABILITIES.test(name)) {
			result.unmodelled.push(name);
		}
	}

	return result;
}

function weaponStrength(weapon, stats) {
	const raw = String(weapon.str ?? "").trim();
	if (!raw || /user/i.test(raw)) return stats?.str ?? 4;
	const parsed = Number(raw.replace(/[^0-9-]/g, ""));
	return Number.isFinite(parsed) && parsed > 0 ? parsed : (stats?.str ?? 4);
}

function weaponSkill(weapon, stats, isMelee) {
	const own = isMelee ? weapon.ws : weapon.bs;
	if (own && String(own).trim() && String(own).trim() !== "-") {
		return parseSkill(own, 4);
	}
	return parseSkill(isMelee ? stats?.ws : stats?.bs, 4);
}

function buildProfile(unit, model, stats, weapon, isMelee, attackingModels) {
	const abilities = parseWeaponAbilities(weapon.type);
	const attacksRaw =
		String(weapon.attacks ?? "").trim() || stats?.attacks || "1";
	const perModel = Math.max(1, weapon.count || 1);
	return {
		id: `${unit.name}|${model?.name ?? ""}|${weapon.name}`,
		unitName: unit.name,
		weaponName: weapon.name,
		selectionName: weapon.selectionName || weapon.name,
		carrierName: model?.name ?? unit.name,
		isMelee,
		range: weapon.range,
		models: attackingModels,
		perModel,
		count: attackingModels * perModel,
		attacks: attacksRaw,
		attacksExpr: parseDiceExpr(attacksRaw) ?? { dice: 0, sides: 0, flat: 1 },
		skill: weaponSkill(weapon, stats, isMelee),
		strength: weaponStrength(weapon, stats),
		ap: parseAp(weapon.ap),
		damage: String(weapon.damage ?? "").trim() || "1",
		abilities,
	};
}

function meleeValue(profile) {
	return (
		mean(profile.attacksExpr) *
		profile.count *
		profile.strength *
		mean(profile.damage)
	);
}

/**
 * Datasheets list each firing mode of a weapon as its own profile (e.g. a
 * missile launcher's frag and krak, or a plasma gun's supercharge). Only one
 * may be chosen per shooting attack, so profiles that share a base name are
 * collapsed to the strongest one.
 */
function weaponBaseName(name) {
	return String(name ?? "")
		.replace(/^[➤▸▶>*\s]+/, "")
		.replace(/\s+[–—-]\s+.*$/, "")
		.trim()
		.toLowerCase();
}

/**
 * @param {object} unit a parsed 11th-edition roster unit
 * @param {"shooting"|"fight"} phase
 * @returns {Array} one entry per (carrier model type × weapon). Profiles that
 * exclude each other share a `choice` key; the strongest by a target-independent
 * estimate is used here, and `resolveUnitVsUnit` re-picks per target.
 */
export function buildAttackerProfiles(unit, phase = "shooting") {
	if (!unit) return [];
	const isMelee = phase === "fight";
	const profiles = [];
	const alternatives = [];

	for (const [modelIndex, model] of (unit.models || []).entries()) {
		const stats = findCarrierStats(unit, model);
		const weapons = (isMelee ? model.meleeWeapons : model.rangedWeapons) || [];
		const modelCount = model.count || 1;

		if (!isMelee) {
			// One firing mode per weapon: keep the strongest profile of each.
			const byWeapon = new Map();
			for (const weapon of weapons) {
				const profile = buildProfile(
					unit,
					model,
					stats,
					weapon,
					false,
					modelCount,
				);
				const key = weaponBaseName(weapon.name);
				profile.choice = `${modelIndex}|ranged|${key}`;
				const existing = byWeapon.get(key);
				if (!existing) {
					byWeapon.set(key, profile);
				} else if (meleeValue(profile) > meleeValue(existing)) {
					byWeapon.set(key, profile);
					alternatives.push(existing);
				} else {
					alternatives.push(profile);
				}
			}
			profiles.push(...byWeapon.values());
			continue;
		}

		// §04.01 / §24.11 — exactly one normal melee weapon per model, plus all
		// of that model's [EXTRA ATTACKS] weapons.
		const candidates = [];
		for (const weapon of weapons) {
			const profile = buildProfile(
				unit,
				model,
				stats,
				weapon,
				true,
				modelCount,
			);
			if (profile.abilities.extraAttacks) profiles.push(profile);
			else {
				profile.choice = `${modelIndex}|melee`;
				candidates.push(profile);
			}
		}
		if (!candidates.length) continue;

		candidates.sort((a, b) => meleeValue(b) - meleeValue(a));
		profiles.push(candidates[0]);
		for (const rejected of candidates.slice(1)) {
			alternatives.push(rejected);
		}
	}

	profiles.alternatives = alternatives;
	return profiles;
}

/**
 * §05.03 — the defender splits the unit into allocation groups: one per
 * CHARACTER model, plus one per distinct `(W, Sv, InSv)` combination.
 */
export function buildDefenderProfiles(unit) {
	if (!unit) return [];
	const mined = mineUnitAbilities(unit);
	const keywords = new Set(
		[...(unit.keywords || [])].map((k) => String(k).toUpperCase()),
	);
	const totalModels = getUnitTotalModels(unit) || 1;
	const pointsPerModel = (unit.cost?.points || 0) / totalModels;
	const stats = unit.modelStats?.length ? unit.modelStats : [];

	if (!stats.length) {
		return [
			{
				name: unit.name,
				toughness: 4,
				save: "5+",
				invuln: "",
				wounds: 1,
				count: totalModels,
				keywords,
				fnp: mined.fnp,
				isCharacter: keywords.has("CHARACTER"),
				pointsPerModel,
				unitName: unit.name,
			},
		];
	}

	const groups = [];
	for (const stat of stats) {
		const count = modelCountForStat(unit, stat);
		const isLeaderModel = stat.attachedLeader === true;
		const isCharacter =
			isLeaderModel ||
			(keywords.has("CHARACTER") && /character/i.test(unit.role || ""));
		const key = `${stat.wounds}|${stat.save}|${stat.invulnerableSave}`;
		const existing = isCharacter ? null : groups.find((g) => g.key === key);
		if (existing) {
			// Same (W, Sv, InSv) — one allocation group, keep the highest T (§19.02).
			existing.count += count;
			existing.toughness = Math.max(existing.toughness, stat.toughness || 1);
			continue;
		}
		groups.push({
			key,
			name: stat.name || unit.name,
			toughness: stat.toughness || 4,
			save: stat.save || "5+",
			invuln: stat.invulnerableSave || "",
			wounds: stat.wounds || 1,
			count,
			keywords,
			fnp: stat.attachedFnp === undefined ? mined.fnp : stat.attachedFnp,
			isCharacter,
			isLeaderModel,
			pointsPerModel: stat.attachedPoints ?? pointsPerModel,
			unitName: stat.attachedUnitName || unit.name,
		});
	}

	// Lowest save roll first — the order the defender is forced into (§05.03).
	// A leader is only allocated attacks once its bodyguard models are gone.
	groups.sort(
		(a, b) =>
			Number(a.isLeaderModel) - Number(b.isLeaderModel) ||
			parseSkill(b.save, 7) - parseSkill(a.save, 7),
	);
	return groups;
}

export function getGroupTotalWounds(groups) {
	return groups.reduce((sum, g) => sum + g.wounds * g.count, 0);
}
