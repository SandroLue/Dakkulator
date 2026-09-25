import { mean, parseDiceExpr } from "./diceExpr";

/**
 * Tokenizer for the 11th-edition weapon-ability string (`weapon.type`).
 *
 * BattleScribe / New Recruit catalogues are inconsistent about brackets, case
 * and separators, so everything is normalised before matching and anything
 * unrecognised is kept in `unknown[]` for the UI to surface.
 */

export function emptyAbilities() {
	return {
		anti: [],
		assault: false,
		blast: 0,
		cleave: 0,
		closeQuarters: false,
		devastatingWounds: false,
		extraAttacks: false,
		hazardous: false,
		heavy: false,
		ignoresCover: false,
		indirectFire: false,
		lance: false,
		lethalHits: false,
		melta: 0,
		oneShot: false,
		pistol: false,
		precision: false,
		psychic: false,
		rapidFire: 0,
		sustainedHits: 0,
		torrent: false,
		twinLinked: false,
		/** ability name -> list of keywords it is restricted to (§24.01) */
		restrictions: {},
		/** raw characteristic strings, e.g. `{ sustainedHits: "D3" }` */
		raw: {},
		/** abilities that appeared more than once (§24.02 — pick the best) */
		duplicated: [],
		unknown: [],
	};
}

const NUMERIC_ABILITIES = [
	{
		key: "rapidFire",
		label: "RAPID FIRE",
		re: /^rapid fire\s*(\d+d\d+|d\d+|\d+)?$/,
	},
	{
		key: "sustainedHits",
		label: "SUSTAINED HITS",
		re: /^sustained hits\s*(\d+d\d+|d\d+|\d+)?$/,
	},
	{ key: "blast", label: "BLAST", re: /^blast\s*(\d+d\d+|d\d+|\d+)?$/ },
	{ key: "cleave", label: "CLEAVE", re: /^cleave\s*(\d+d\d+|d\d+|\d+)?$/ },
	{ key: "melta", label: "MELTA", re: /^melta\s*(\d+d\d+|d\d+|\d+)?$/ },
];

const FLAG_ABILITIES = [
	{ key: "assault", label: "ASSAULT", re: /^assault$/ },
	{
		key: "closeQuarters",
		label: "CLOSE-QUARTERS",
		re: /^close[\s-]?quarters$/,
	},
	{
		key: "devastatingWounds",
		label: "DEVASTATING WOUNDS",
		re: /^devastating wounds$/,
	},
	{ key: "extraAttacks", label: "EXTRA ATTACKS", re: /^extra attacks$/ },
	{ key: "hazardous", label: "HAZARDOUS", re: /^hazardous$/ },
	{ key: "heavy", label: "HEAVY", re: /^heavy$/ },
	{ key: "ignoresCover", label: "IGNORES COVER", re: /^ignores cover$/ },
	{ key: "indirectFire", label: "INDIRECT FIRE", re: /^indirect fire$/ },
	{ key: "lance", label: "LANCE", re: /^lance$/ },
	{ key: "lethalHits", label: "LETHAL HITS", re: /^lethal hits$/ },
	{ key: "oneShot", label: "ONE SHOT", re: /^one[\s-]?shot$/ },
	{ key: "pistol", label: "PISTOL", re: /^pistol$/ },
	{ key: "precision", label: "PRECISION", re: /^precision$/ },
	{ key: "psychic", label: "PSYCHIC", re: /^psychic$/ },
	{ key: "torrent", label: "TORRENT", re: /^torrent$/ },
	{ key: "twinLinked", label: "TWIN-LINKED", re: /^twin[\s-]?linked$/ },
];

const ANTI = /^anti[\s-]+([a-z0-9 '()/-]+?)\s*(\d)\+$/;

/** Tokens that carry no maths and no information worth warning about. */
const IGNORED = /^(melee|ranged|-|n\/a|none)$/;

function normalizeToken(token) {
	return token
		.toLowerCase()
		.replace(/[.\u2019]/g, (c) => (c === "\u2019" ? "'" : ""))
		.replace(/\s+/g, " ")
		.trim();
}

function tokenize(input) {
	if (!input) return [];
	const text = String(input);
	const tokens = [];

	let remainder = "";
	let cursor = 0;
	const bracket = /\[([^\]]*)\]/g;
	let match = bracket.exec(text);
	while (match) {
		remainder += `${text.slice(cursor, match.index)},`;
		const content = match[1];
		// `[LETHAL HITS: VEHICLE, MONSTER]` is one ability with a keyword list.
		if (content.includes(":")) tokens.push(content);
		else tokens.push(...content.split(/[,;]/));
		cursor = match.index + match[0].length;
		match = bracket.exec(text);
	}
	remainder += text.slice(cursor);
	tokens.push(...remainder.split(/[,;\n]/));

	return tokens.map(normalizeToken).filter((t) => t && !IGNORED.test(t));
}

function splitRestriction(token) {
	const colon = token.indexOf(":");
	if (colon === -1) return { body: token, keywords: null };
	const keywords = token
		.slice(colon + 1)
		.split(/,| or /)
		.map((k) => k.trim().toUpperCase())
		.filter(Boolean);
	return {
		body: token.slice(0, colon).trim(),
		keywords: keywords.length ? keywords : null,
	};
}

function numericValue(raw, fallback) {
	if (raw === undefined) return fallback;
	const expr = parseDiceExpr(raw);
	return expr ? mean(expr) : fallback;
}

function applyToken(flags, token) {
	const { body, keywords } = splitRestriction(token);

	const anti = body.match(ANTI);
	if (anti) {
		const keyword = anti[1].trim().toUpperCase();
		const threshold = Number(anti[2]);
		const existing = flags.anti.find((a) => a.keyword === keyword);
		if (existing) {
			flags.duplicated.push(`ANTI-${keyword}`);
			existing.threshold = Math.min(existing.threshold, threshold);
		} else {
			flags.anti.push({ keyword, threshold });
		}
		return true;
	}

	for (const ability of NUMERIC_ABILITIES) {
		const m = body.match(ability.re);
		if (!m) continue;
		const value = numericValue(m[1], 1);
		if (flags[ability.key] > 0) flags.duplicated.push(ability.label);
		// §24.02: duplicated abilities are not cumulative — keep the best one.
		if (value > flags[ability.key]) {
			flags[ability.key] = value;
			flags.raw[ability.key] = m[1] ?? "1";
		}
		if (keywords) flags.restrictions[ability.key] = keywords;
		return true;
	}

	for (const ability of FLAG_ABILITIES) {
		if (!ability.re.test(body)) continue;
		if (flags[ability.key]) flags.duplicated.push(ability.label);
		flags[ability.key] = true;
		if (keywords) flags.restrictions[ability.key] = keywords;
		return true;
	}

	return false;
}

/**
 * @param {string} input the weapon's `type` characteristic
 * @returns structured ability flags (see `emptyAbilities`)
 */
export function parseWeaponAbilities(input) {
	const flags = emptyAbilities();
	for (const token of tokenize(input)) {
		if (!applyToken(flags, token)) flags.unknown.push(token);
	}
	// §24.27: Pistol is Close-Quarters in 11th edition.
	if (flags.pistol) flags.closeQuarters = true;
	return flags;
}

/**
 * §24.01 — an ability printed with a keyword list only applies when the target
 * has one of those keywords.
 */
export function abilityApplies(flags, key, targetKeywords) {
	if (!flags[key]) return false;
	const required = flags.restrictions?.[key];
	if (!required) return true;
	if (!targetKeywords) return false;
	return required.some((keyword) => targetKeywords.has(keyword));
}
