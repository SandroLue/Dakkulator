/**
 * Regex rules that turn datasheet, faction and detachment ability text into
 * user modifiers (see modifiers.js), so a freshly added list comes with its
 * abilities already built.
 *
 * Each sentence of an ability is read on its own. A sentence with a recognised
 * effect and a recognised subject ("each time this unit makes an attack",
 * "each time an attack targets this unit", "weapons equipped by …") becomes one
 * modifier. Anything that limits when it applies ("while", "within", "select",
 * "once per battle", …) marks it `conditional`, so it can be added switched off
 * for the user to judge. Feel No Pain, invulnerable saves and Stealth are read
 * elsewhere (profiles.js) and are skipped here.
 *
 * Measured against the BSData corpus with scripts/abilityCoverage.mjs.
 */

/** Lowercase, markup-free text: BSData marks keywords as **^^Keyword^^**, rosters do not. */
export function normalizeAbilityText(text) {
	return String(text ?? "")
		.replace(/[*^]/g, "")
		.replace(/[‘’`]/g, "'")
		.replace(/[‐‑−]/g, "-")
		.replace(/\s+/g, " ")
		.trim()
		.toLowerCase();
}

/** Text that may change an attack; movement, CP, OC and the like do not. */
const COMBAT =
	/hit roll|wound roll|to hit|to wound|re-?roll the (?:hit|wound)|lethal hits|sustained hits|devastating wounds|precision|armou?r penetration|damage characteristic|feel no pain|invulnerable|strength characteristic|attacks characteristic|critical (?:hit|wound)|benefit of cover|\[anti-|\[lance\]|\[twin-linked\]|ignores cover|ballistic skill|weapon skill|[+-]\d+ ?\**(?:ap|d|s|a|bs|ws)\**\b/i;

/** Whether an ability's text can change a combat result at all. */
export function isCombatAbility(text) {
	return COMBAT.test(normalizeAbilityText(text));
}

/** "Succubus model only." — who may take an enhancement, not a condition. */
const ELIGIBILITY = /^[a-z' ,-]+ (?:models?|units?) only\.?$/;

function sentences(text) {
	const out = [];
	// "this unit has: - +1 T - feel no pain 5+": the lead-in is each item's subject.
	let leadIn = "";
	for (const piece of text.split(
		/(?<=\.)\s+|\s*(?=[\n■•▪])|(?:^|\s)(?=-\s?[a-z+])/,
	)) {
		const bullet = /^\s*[\n■•▪-]/.test(piece);
		const s = piece
			.trim()
			.replace(/^[■•▪-]\s*/, "")
			.trim();
		if (!s || ELIGIBILITY.test(s)) continue;
		if (!bullet) leadIn = "";
		// "… has: +1 T" continues the sentence; "while …: re-roll …" is a condition.
		const joint = /\b(?:has|have|can|gains?|is|are)$/.test(leadIn) ? " " : ", ";
		out.push(bullet && leadIn ? `${leadIn}${joint}${s}` : s);
		// "… can:", "… has:" opens a list of effects.
		if (/:$/.test(s)) leadIn = s.replace(/:$/, "");
	}
	return out.flatMap(clauses);
}

/**
 * "…, each time a model in that unit makes an attack, improve the AP by 1, and
 * each time an attack targets that unit, worsen the AP by 1": two subjects, so
 * two sentences, each with the opening they share (an aura, a condition).
 */
function clauses(sentence) {
	const first = sentence.indexOf("each time ");
	if (first < 0) return [sentence];
	const parts = sentence.slice(first).split(/,? and (?=each time )/);
	if (parts.length === 1) return [sentence];
	const opening = sentence.slice(0, first);
	return parts.map((part) => `${opening}${part.replace(/[.,]?$/, ".")}`);
}

// Who the ability talks about. `the bearer` is the model with an enhancement.
const SELF =
	// Longer forms first, so "the bearer's unit" is not read as "the bearer".
	"(?:this model's unit|the bearer's unit|models in (?:this|the bearer's) unit|this unit|this model|the bearer|that unit)";
const SELF_WEAPONS = `(?:${SELF}'s|the bearer's)`;

const ATTACKING = [
	new RegExp(
		`each time (?:a model in )?${SELF} makes an? (?:(melee|ranged) )?attack`,
	),
	new RegExp(
		`each time an? (?:(melee|ranged) )?attack made by (?:a model in )?${SELF}`,
	),
	new RegExp(`(?:(melee|ranged) )?weapons equipped by (?:models in )?${SELF}`),
	new RegExp(`${SELF_WEAPONS} (?:(melee|ranged) )?(?:attacks|weapons)`),
	new RegExp(
		`(?:characteristics? of|attacks characteristics? of) ${SELF_WEAPONS} (?:(melee|ranged) )?weapons`,
	),
];

const DEFENDING = [
	new RegExp(`each time an? (?:(melee|ranged) )?attack targets ${SELF}`),
	new RegExp(
		`each time an? (?:(melee|ranged) )?attack is allocated to (?:a model in )?${SELF}`,
	),
	new RegExp(
		`(?:(melee|ranged) )?attacks (?:that target|allocated to) ${SELF}`,
	),
];

// Army-wide rules name the units they are for by keyword: "each time an
// INFANTRY model from your army makes an attack", "each time an attack targets
// a VEHICLE unit from your army".
const KEYWORDS = "[a-z' ,/-]+?";
const EXCLUDING = "(?: \\((?<not>[^)]*)\\))?";
const ARMY_UNIT = `(?:a model in )?an? (?:(?<kw>${KEYWORDS}) )?(?:model|unit) from your army${EXCLUDING}`;
// What an aura is measured from: "this model", "this unit's Szarekh model".
const AURA_SOURCE =
	"(?:this model|the bearer|this unit(?:'s [a-z' -]+? model)?|this (?:transport|vehicle|fortification))(?:'s unit)?(?: \\([^)]*\\))?";
// "a friendly AELDARI model", "a friendly ADEPTUS ASTARTES unit within 6" of this model"
const FRIENDLY_UNIT = `an? friendly (?:(?<kw>${KEYWORDS}) )?(?:model|unit)${EXCLUDING}(?<aura> (?:wholly )?within \\d+"? of ${AURA_SOURCE})?`;
const ARMY_ATTACKING = [
	new RegExp(
		`each time ${ARMY_UNIT} makes an? (?:(?<phase>melee|ranged) )?attack`,
	),
	new RegExp(
		`each time an? (?:(?<phase>melee|ranged) )?attack (?:is )?made by ${ARMY_UNIT}`,
	),
	new RegExp(
		`each time ${FRIENDLY_UNIT} makes an? (?:(?<phase>melee|ranged) )?attack`,
	),
	new RegExp(
		`(?<phase>melee|ranged)? ?weapons equipped by (?:(?<kw>${KEYWORDS}) )?(?:models|units) (?:from|in) your army${EXCLUDING}`,
	),
	/friendly (?<kw>[a-z' /-]+?) units?'s? (?:(?<phase>melee|ranged) )?(?:attacks|weapons)/,
];
const ARMY_DEFENDING = [
	new RegExp(
		`each time an? (?:(?<phase>melee|ranged) )?attack (?:targets|is allocated to) ${ARMY_UNIT}`,
	),
	new RegExp(
		`each time an? (?:(?<phase>melee|ranged) )?attack (?:targets|is allocated to) ${FRIENDLY_UNIT}`,
	),
];

const PHASE = { melee: "fight", ranged: "shooting" };

/** A subject about the model itself rather than its unit. */
const ownModels = (text) =>
	/\b(?:this model|the bearer)\b/.test(text) &&
	!/\b(?:this model's|the bearer's) unit\b|\bmodels? in\b/.test(text);

/** "infantry or mounted", "monster and vehicle" → "INFANTRY, MOUNTED". */
function keywordList(phrase) {
	return String(phrase ?? "")
		.split(/,|\/|\bor\b|\band\b/)
		.map((w) =>
			w
				.trim()
				.replace(/^(?:excluding|enemy)\s+/, "")
				.replace(/\s+(?:units?|models?)$/, ""),
		)
		.filter((w) => w && !NOT_KEYWORDS.has(w))
		.map((w) => w.toUpperCase())
		.join(", ");
}

function subject(sentence) {
	const first = (patterns) =>
		patterns.map((re) => sentence.match(re)).find(Boolean);
	const army = first(ARMY_ATTACKING) ?? first(ARMY_DEFENDING);
	if (army) {
		return {
			role: first(ARMY_ATTACKING) ? "attacking" : "defending",
			phase: PHASE[army.groups.phase] ?? "any",
			text: army[0],
			scope: "list",
			unitKeywords: keywordList(army.groups.kw),
			excludeUnitKeywords: keywordList(army.groups.not),
			// "a friendly unit within 6" of this model": only those in range.
			aura: Boolean(army.groups.aura),
		};
	}
	const attacking = first(ATTACKING);
	const defending = first(DEFENDING);
	if (Boolean(attacking) === Boolean(defending)) return null;
	const match = attacking ?? defending;
	return {
		role: attacking ? "attacking" : "defending",
		phase: PHASE[match.slice(1).find(Boolean)] ?? "any",
		text: match[0],
	};
}

/** Unit keywords a target clause may name; anything else is a condition. */
const KEYWORD = /^[a-z][a-z-]*$/;
const NOT_KEYWORDS = new Set([
	"enemy",
	"unit",
	"units",
	"model",
	"models",
	"that",
]);

/** "that targets a MONSTER or VEHICLE unit" → ["MONSTER", "VEHICLE"]. */
function targetKeywords(sentence) {
	const match = sentence.match(
		/\b(?:targets?|is allocated to|targeting) an? ([a-z ,'/-]+?) (?:unit|model)s?\b/,
	);
	if (!match) return { keywords: [], text: "" };
	const words = match[1]
		.split(/,|\/|\bor\b/)
		.map((w) => w.trim().replace(/^enemy\s+/, ""))
		.filter((w) => w && !NOT_KEYWORDS.has(w));
	if (!words.length) return { keywords: [], text: match[0] };
	// "a unit that can fly", "an enemy unit that is below …" are conditions, not keywords.
	if (!words.every((w) => KEYWORD.test(w))) return null;
	return { keywords: words.map((w) => w.toUpperCase()), text: match[0] };
}

const signed = (sign, n) =>
	(sign === "-" || sign === "subtract" ? -1 : 1) * Number(n);

/** Every effect the sentence names, as modifier fields. */
/** Characteristic names an ability may list, and the modifier field for each. */
const CHARACTERISTIC_KEYS = {
	attacks: "attacksModifier",
	strength: "strengthModifier",
	damage: "damageModifier",
	"armour penetration": "apModifier",
	"ballistic skill": "skillModifier",
	"weapon skill": "skillModifier",
	toughness: "toughnessChange",
	wounds: "woundsChange",
	save: "saveChange",
};
// Move, Leadership and OC may sit in the same list; they change nothing here.
const CHARACTERISTIC =
	"(?:attacks|strength|damage|armou?r penetration|ballistic skill|weapon skill|toughness|wounds|save|move|leadership|objective control)";
const CHARACTERISTICS = `${CHARACTERISTIC}(?:(?:, | and |, and )${CHARACTERISTIC})*`;
// "add 1 to the attacks and strength characteristics" ("… damage roll" is no characteristic)
const ADD_CHARACTERISTICS = new RegExp(
	`(add|subtract) (\\d) (?:to|from) the (${CHARACTERISTICS})(?! roll)(?: characteristics?)?\\b`,
	"g",
);
// "improve the strength characteristic of melee weapons equipped by the bearer by 2"
const IMPROVE_CHARACTERISTICS = new RegExp(
	`(improve|worsen) the (${CHARACTERISTICS}) characteristics?\\b[^.]*?\\bby (\\d)\\b`,
	"g",
);
// "the armour penetration characteristic of its ranged weapons is improved by 1"
const CHARACTERISTICS_IMPROVED = new RegExp(
	`the (${CHARACTERISTICS}) characteristics? of [^.]*?\\b(?:is|are) (improved|worsened) by (\\d)\\b`,
	"g",
);
const SHORT_STAT_KEYS = {
	ap: "apModifier",
	d: "damageModifier",
	s: "strengthModifier",
	a: "attacksModifier",
	t: "toughnessChange",
	w: "woundsChange",
	sv: "saveChange",
	bs: "skillModifier",
	ws: "skillModifier",
};
const SHORT_STAT = "(?:ap|d|s|a|t|w|sv|bs|ws)";
const SHORT_STATS = new RegExp(
	`\\bha(?:s|ve) ([+-])(\\d) ?(${SHORT_STAT}(?:(?:, | and |, and )${SHORT_STAT})*)\\b`,
	"g",
);

function effects(s) {
	const e = {};
	const set = (key, value) => {
		if (value) e[key] = (e[key] ?? 0) + value;
	};

	// "re-roll a hit roll of 1", "re-roll hit rolls of 1", "re-roll the hit roll";
	// some datasheets drop the "of" or misspell it "or".
	if (/re-?roll (?:(?:a|the) )?hit rolls? (?:of |or )?1\b/.test(s))
		e.rerollHits = "ones";
	else if (/re-?roll (?:the )?hit rolls?\b/.test(s)) e.rerollHits = "all";
	if (/re-?roll (?:(?:a|the) )?wound rolls? (?:of |or )?1\b/.test(s))
		e.rerollWounds = "ones";
	else if (/re-?roll (?:the )?wound rolls?\b/.test(s)) e.rerollWounds = "all";

	for (const m of s.matchAll(/(add|subtract) (\d) (?:to|from) the hit roll/g))
		set("hitModifier", signed(m[1], m[2]));
	for (const m of s.matchAll(/(add|subtract) (\d) (?:to|from) the wound roll/g))
		set("woundModifier", signed(m[1], m[2]));
	for (const m of s.matchAll(
		/([+-])(\d) to hit rolls?\b( and wound rolls?\b)?/g,
	)) {
		set("hitModifier", signed(m[1], m[2]));
		// "+1 to hit rolls and wound rolls"
		if (m[3]) set("woundModifier", signed(m[1], m[2]));
	}
	for (const m of s.matchAll(/([+-])(\d) to wound rolls?\b/g))
		set("woundModifier", signed(m[1], m[2]));

	// Characteristics, alone or listed: "add 1 to the attacks, strength and
	// damage characteristics", "improve the strength and armour penetration
	// characteristics of … by 1", "the AP characteristic of … is improved by 1".
	const changeAll = (list, value) => {
		// "ballistic skill and weapon skill" is one change, to the attack's skill.
		const keys = new Set(
			list
				.split(/, and |, | and /)
				.map((name) => CHARACTERISTIC_KEYS[name.replace("armor", "armour")])
				.filter(Boolean),
		);
		for (const key of keys) set(key, value);
	};
	for (const m of s.matchAll(ADD_CHARACTERISTICS)) {
		changeAll(m[3], signed(m[1], m[2]));
	}
	for (const m of s.matchAll(IMPROVE_CHARACTERISTICS)) {
		changeAll(m[2], (m[1] === "worsen" ? -1 : 1) * Number(m[3]));
	}
	for (const m of s.matchAll(CHARACTERISTICS_IMPROVED)) {
		changeAll(m[1], (m[2] === "worsened" ? -1 : 1) * Number(m[3]));
	}

	// Short 11e notation: "have +1 AP", "have -1 D", "have +1 A, S and D".
	for (const m of s.matchAll(SHORT_STATS)) {
		const keys = new Set(
			m[3].split(/, and |, | and /).map((stat) => SHORT_STAT_KEYS[stat]),
		);
		// "+1 Sv" reads as a better save.
		for (const key of keys) set(key, signed(m[1], m[2]));
	}

	// "have the [LETHAL HITS] ability", "gain the [LANCE] ability",
	// "have +1 S and [SUSTAINED HITS 1]"
	const brackets = s.match(
		/(?:ha(?:s|ve)|gains?)(?: the)? (?:[+-]\d ?[a-z]+(?:, | and |, and ))*((?:\[[^\]]+\](?:,? (?:and )?)?)+)/,
	);
	if (brackets)
		e.weaponAbilities = brackets[1]
			.match(/\[[^\]]+\]/g)
			.join(", ")
			.toUpperCase();

	if (/ignore any or all modifiers to .*hit roll/.test(s))
		e.ignoreHitModifiers = true;
	if (/ignore any or all modifiers to .*wound roll/.test(s))
		e.ignoreWoundModifiers = true;
	// "that unit cannot have the benefit of cover" takes it away instead.
	if (/cannot have the benefit of cover/.test(s)) e.denyCover = true;
	else if (/ha(?:s|ve) the benefit of cover/.test(s)) e.cover = true;

	// "Feel No Pain 5+ ability against mortal wounds and psychic attacks";
	// an unqualified one is mined from the unit itself (profiles.js).
	const fnp = s.match(
		/feel no pain (\d)\+(?: ability)?(?: against ([^.;]+?))?(?=[.;]|$| and (?:the|an?) )/,
	);
	if (fnp) {
		const against = fnp[2] ?? "";
		if (/mortal wounds?/.test(against)) e.mortalFnp = Number(fnp[1]);
		if (/psychic attacks?/.test(against)) e.psychicFnp = Number(fnp[1]);
		// "… against that attack": the attack the sentence is about.
		if (!against || /^(?:that|those|this) attacks?\b/.test(against)) {
			e.fnp = Number(fnp[1]);
		}
	}

	// "a critical hit is scored on an unmodified hit roll of 5+",
	// "an unmodified successful wound roll of 5+ scores a critical wound"
	const critical = (kind) =>
		s.match(
			new RegExp(
				// "unmodifed" is a typo some datasheets carry.
				`critical ${kind} (?:is scored )?on (?:an? )?(?:successful )?(?:unmodifi?ed )?(?:${kind} roll of )?(\\d)\\+|(?:successful )?unmodifi?ed (?:successful )?${kind} rolls? of (\\d)\\+ scores? an? critical ${kind}`,
			),
		);
	// "any successful wound roll scores a critical wound": every success, so 2+.
	const anySuccess = (kind) =>
		new RegExp(
			`(?:any|a) successful (?:unmodifi?ed )?${kind} roll scores? an? critical ${kind}`,
		).test(s);
	const critHit = critical("hit");
	if (critHit) e.critHitOn = Number(critHit[1] ?? critHit[2]);
	else if (anySuccess("hit")) e.critHitOn = 2;
	const critWound = critical("wound");
	if (critWound) e.critWoundOn = Number(critWound[1] ?? critWound[2]);
	else if (anySuccess("wound")) e.critWoundOn = 2;

	if (/re-?roll (?:the )?damage roll/.test(s)) e.rerollDamage = true;
	if (/halve the damage characteristic/.test(s)) e.halveDamage = true;
	if (
		/change the damage characteristic of (?:that|the) attack to 1\b/.test(s)
	) {
		e.damageToOne = true;
	}
	return e;
}

/** Effects only a defender can have. */
const DEFENDING_ONLY = new Set([
	"cover",
	"halveDamage",
	"damageToOne",
	"fnp",
	"mortalFnp",
	"psychicFnp",
	// Only meaningful for an enemy unit (see ENEMY_EFFECTS).
	"denyCover",
]);

/** Effects a defending unit can have; the rest only make sense for attacks. */
const DEFENDING_EFFECTS = new Set([
	"hitModifier",
	"woundModifier",
	"apModifier",
	"damageModifier",
	"cover",
	"halveDamage",
	"damageToOne",
	"toughnessChange",
	"saveChange",
	"woundsChange",
	"fnp",
	"mortalFnp",
	"psychicFnp",
]);

/**
 * Effects on an enemy unit, from your list's side: its attacks are weakened
 * (a defensive modifier for your units) or attacks against it are helped (an
 * attacking one; stat changes then change the target).
 */
const ENEMY_EFFECTS = {
	defending: new Set([
		"hitModifier",
		"woundModifier",
		"apModifier",
		"damageModifier",
		"strengthModifier",
		"attacksModifier",
	]),
	attacking: new Set([
		"hitModifier",
		"woundModifier",
		"apModifier",
		"damageModifier",
		"rerollHits",
		"rerollWounds",
		"weaponAbilities",
		"critHitOn",
		"critWoundOn",
		"toughnessChange",
		"saveChange",
		"woundsChange",
		"denyCover",
	]),
};

// "with a S greater than this unit's T", "if the Strength characteristic of
// that attack is less than or equal to the Toughness characteristic of …".
const COMPARE =
	"(greater than or equal to|equal to or greater than|less than or equal to|equal to or less than|greater than|less than|higher than|lower than)";
const STRENGTH_VS_TOUGHNESS = [
	// "if the S of those attacks is lower than the T of the target"
	new RegExp(
		`if the (?:s|strength) of (?:those|that|the) attacks? is ${COMPARE} the (?:t|toughness) of the target`,
	),
	new RegExp(
		`with an? (?:s|strength)(?: characteristic)? ${COMPARE} (?:this|that|your|the target) (?:unit|model)'s (?:t|toughness)(?: characteristic)?`,
	),
	new RegExp(
		`if the strength characteristic of (?:that|the) attack is ${COMPARE} (?:the toughness characteristic of (?:this|that|the target|the) (?:unit|model)|(?:this|that) (?:unit|model)'s toughness characteristic)`,
	),
];
const COMPARE_MODE = {
	"greater than": "gt",
	"greater than or equal to": "gte",
	"equal to or greater than": "gte",
	"less than": "lt",
	"less than or equal to": "lte",
	"equal to or less than": "lte",
	"higher than": "gt",
	"lower than": "lt",
};

function strengthVsToughness(sentence) {
	const match = STRENGTH_VS_TOUGHNESS.map((re) => sentence.match(re)).find(
		Boolean,
	);
	return match ? { mode: COMPARE_MODE[match[1]], text: match[0] } : null;
}

/** States of the models themselves (characteristics, Feel No Pain, cover): no attack needed. */
const STAT_EFFECTS = new Set([
	"toughnessChange",
	"saveChange",
	"woundsChange",
	"fnp",
	"mortalFnp",
	"psychicFnp",
	"cover",
	"denyCover",
]);
// "… of models in this unit", "this model has +1 T", "the bearer's unit has …";
// not "models in that unit", which is someone else's.
const OWN_MODELS =
	/(?:^|\bof |, )(?:models in )?(?:this unit|this model|the bearer)(?:'s unit)?\b|\b(?:this unit|this model|the bearer) ha(?:s|ve)\b/;

// "select one (other) friendly DESTROYER CULT unit within 9" of it"
const SELECT_FRIENDLY =
	/\bselect one (?:other )?friendly (?:(?<kw>[a-z' /-]+?) )?unit\b/;

/** Words that limit when an effect applies. */
const CONDITIONS =
	/\b(?:if|while|within|select(?:ed|s)?|once per|until|instead|unless|battle-?shock(?:ed)?|below|starting strength|half-strength|charge(?:d)?|stationary|objective|start of|end of|command phase|stratagem|d6|opponent|visible|closest|fallen back|advanced|destroyed|mortal wounds?|aura|psychic|this turn|this phase|wounds remaining|one hit roll|one wound roll|excluding|without|cannot|can fly|greater than|less than|characteristic of \d|\d+"|with (?:its|their|the bearer's|an?)\b|\btargets?\b)/;

/** Effects the engine cannot express: a sentence that has one is left alone. */
const UNSUPPORTED =
	/characteristic of -?\d|set the|invulnerable save|\bstealth\b|\bweapon has\b/;

// Auras reach every friendly unit in range, so they apply list-wide:
// "friendly X units (excluding …) within 6" of this model can:" (effects may
// follow as a list) and "while a friendly X unit is within 6" of this model,
// … that unit …".
const AURA_UNITS = new RegExp(
	`^friendly (?:(?<kw>${KEYWORDS}) )?(?:units?|models?)${EXCLUDING} (?:wholly )?within \\d+"? of ${AURA_SOURCE},?\\s*`,
);
const AURA_WHILE = new RegExp(
	`^(?:while|when) an? friendly (?:(?<kw>${KEYWORDS}) )?(?:unit|model)${EXCLUDING} is (?:wholly )?within \\d+"? of ${AURA_SOURCE},?\\s*`,
);
// Not an aura, but the same shape: "while a friendly GRAVIS unit is within range
// of an objective, … that unit …", "while a unit from your army is empowered, …".
const FRIENDLY_WHILE = [
	new RegExp(
		`^(?:while|when) an? friendly (?:(?<kw>${KEYWORDS}) )?(?:unit|model)${EXCLUDING} (?<cond>(?:is|has|contains) [^,]+),\\s*`,
	),
	new RegExp(
		`^(?:while|when) an? (?:(?<kw>${KEYWORDS}) )?(?:unit|model) from your army${EXCLUDING} (?<cond>(?:is|has|contains) [^,]+),\\s*`,
	),
];

// "While this model / the bearer / your Ascendant Lord is leading a unit (and …),"
const LEADING =
	/while (?:this model|the bearer|this unit|your [a-z' -]+?) is leading (?:an? )?(?:[a-z' -]+? )?unit(?: and (?<extra>[^,]+))?,?\s*/;

// "that targets that enemy unit / your Vendetta target / this unit's quarry":
// a target picked during the game, so the user turns it on when it applies.
// "that unit" is the target only when the subject makes the attack; in "attacks
// that target that unit" it is the friendly unit being attacked.
const SELECTED_TARGET =
	/\b(?:that )?targets? (?:that enemy unit|your [a-z' -]+? target|(?:this unit's|the bearer's|your) quarry)\b|\b(makes an? (?:melee |ranged )?attack) that targets that unit\b/;

// An enemy unit the rest of the ability is about: "select one enemy unit",
// "while an enemy unit (excluding MONSTERS) is within 6" of this unit, … that
// unit", "while a unit is Suppressed, … that unit".
const SELECT_ENEMY =
	/\bselect (?:one|up to \w+|an?)(?: other)?(?: visible)? enemy (?:[a-z' -]+ )?units?\b/;
const ENEMY_WHILE =
	/\bwhile an? enemy unit(?: \((?<not>[^)]*)\))? is [^,]+,\s*/;
const STATUS_WHILE =
	/^(?:while|until) (?:a|that) unit is (?:[a-z-]+ed|afflicted)\b[^,]*,\s*/;
// "select one of the following": options to pick from, unlike a target.
const CHOICE =
	/\b(?:select|choose) one (?:of\b|[a-z' -]+? (?:listed |from )?below\b)|\bone of the following\b/;

// Weapons named by a keyword they have: "torrent weapons equipped by …".
const WEAPON_KEYWORD =
	/\b(torrent|blast|pistol|heavy|assault|melta|rapid fire|psychic|lance|precision|hazardous|indirect fire|one shot|grenades?) weapons\b/;
// "this model's Solitaire weapons", "the bearer's relic blade".
const NAMED_WEAPON =
	/\b(this model's|the bearer's) ((?!melee |ranged )[a-z' -]+?) weapons?\b/;
// "a critical hit on 5+, instead of only on a 6": the "instead" is no condition.
const INSTEAD_OF_SIX =
	/,? instead of (?:only )?(?:on )?(?:an? )?(?:unmodified )?(?:[a-z]+ rolls? of )?6\+?/g;

/**
 * @returns one entry per recognised sentence:
 * `{ modifier, conditional, reasons, sentence, option }`, where `modifier`
 * holds the fields for `createModifier` (role, phase, vsKeywords and the
 * effects) and `option` names one of several choices, e.g. "dacatarai stance"
 */
export function matchAbility(text) {
	const results = [];
	const normalized = normalizeAbilityText(text);
	const leading = LEADING;

	// A condition in a sentence without an effect of its own ("select one of the
	// abilities below", "while an enemy unit is within …") governs what follows.
	const carried = [];
	// "friendly units within 6" … can:" names the subject for the list that follows.
	let auraList = false;
	// The units an aura reaches, carried into the list that follows it.
	let auraUnits = {};
	// Set once the ability starts describing an effect on an enemy unit
	// ("it is Afflicted"): from then on "this unit" is that enemy unit.
	let aboutEnemy = false;
	// The unit a later "that unit" means: one picked earlier, friendly or enemy.
	let selected = null;
	let enemyPicked = false;
	for (const raw of sentences(normalized)) {
		const isLeading = leading.test(raw);
		// Conditions read while rewriting the sentence into a known shape.
		const rewriteReasons = [];
		const leadExtra = raw.match(leading)?.groups.extra;
		if (leadExtra) rewriteReasons.push(leadExtra);
		let weaponFilter = "";
		let sentence = raw
			.replace(leading, "")
			// "a unit that can fly" is the FLY keyword.
			.replace(/\ban? (?:enemy )?units? that can fly\b/g, "a fly unit")
			.replace(INSTEAD_OF_SIX, "")
			.replace(/\brange attack\b/g, "ranged attack")
			// "ranged and melee weapons" are all of them, in both phases.
			.replace(
				/\b(?:ranged and melee|melee and ranged) (weapons|attacks)\b/g,
				"$1",
			)
			// "each time a model in this unit targets an enemy unit with a melee attack"
			.replace(
				/\b(each time (?:a model in )?(?:this unit|this model|the bearer)) targets an enemy unit with an? (?:(melee|ranged) )?attack/,
				(_, who, kind) => `${who} makes a ${kind ? `${kind} ` : ""}attack`,
			)
			// "if it does, … each time it makes an attack": the model using it.
			.replace(/\beach time it makes\b/g, "each time this model makes")
			.replace(/\bits ((?:melee |ranged )?weapons)\b/, "this model's $1")
			.replace(
				/\bweapons equipped by the model\b/,
				"weapons equipped by this model",
			);
		// "a psychic attack" is one made with a [PSYCHIC] weapon.
		// Only as the attack itself: "against … psychic attacks" (Feel No Pain)
		// and "(excluding psychic attacks)" are read elsewhere.
		const psychicAttack =
			/\b(makes an? (?:(?:melee|ranged) )?|each time an? (?:(?:melee|ranged) )?)psychic (attack)\b/;
		if (psychicAttack.test(sentence)) {
			weaponFilter = "PSYCHIC";
			sentence = sentence.replace(psychicAttack, "$1$2");
		}
		const keywordWeapon = sentence.match(WEAPON_KEYWORD);
		if (keywordWeapon) {
			weaponFilter = keywordWeapon[1].toUpperCase();
			sentence = sentence.replace(keywordWeapon[0], "weapons");
		}
		const namedWeapon = sentence.match(NAMED_WEAPON);
		if (namedWeapon) {
			weaponFilter = namedWeapon[2].toUpperCase();
			sentence = sentence.replace(namedWeapon[0], `${namedWeapon[1]} weapons`);
		}
		// "weapons equipped by DEATH COMPANY models in this unit": some of its models.
		const someModels = sentence.match(
			/\bweapons equipped by (?:the )?([a-z' -]+?) models in (this|that|the bearer's) unit\b/,
		);
		if (someModels) {
			rewriteReasons.push(`only ${someModels[1]} models`);
			sentence = sentence.replace(
				someModels[0],
				`weapons equipped by models in ${someModels[2]} unit`,
			);
		}
		if (SELECTED_TARGET.test(sentence)) {
			rewriteReasons.push("selected target");
			sentence = sentence
				.replace(SELECTED_TARGET, (_, makes) => makes ?? "")
				.replace(/\s+/g, " ");
		}
		// "while an enemy unit is within 6" of this unit, … that unit …"
		let enemyHere = null;
		const enemyWhile =
			sentence.match(ENEMY_WHILE) ?? sentence.match(STATUS_WHILE);
		if (enemyWhile) {
			enemyHere = { excludeVsKeywords: keywordList(enemyWhile.groups?.not) };
			sentence = sentence.replace(enemyWhile[0], "");
		}
		let aura = false;
		for (const pattern of [AURA_WHILE, AURA_UNITS, ...FRIENDLY_WHILE]) {
			const match = sentence.match(pattern);
			if (!match) continue;
			// "while a friendly ENGINSEER is leading this unit" is about this unit.
			if (match.groups.cond?.startsWith("is leading")) continue;
			aura = true;
			auraUnits = {
				unitKeywords: keywordList(match.groups.kw),
				excludeUnitKeywords: keywordList(match.groups.not),
			};
			if (pattern === AURA_UNITS) auraList = true;
			// "within range of an objective" limits it like any other condition.
			if (match.groups.cond) {
				rewriteReasons.push(`while ${match.groups.cond}`);
			} else {
				rewriteReasons.push("aura");
			}
			sentence = sentence.replace(pattern, "");
			break;
		}
		// A Strength-vs-Toughness comparison is a condition the engine can check.
		const versus = strengthVsToughness(sentence);
		if (versus) {
			sentence = sentence.replace(versus.text, " ").replace(/\s+/g, " ");
		}
		const found = UNSUPPORTED.test(sentence) ? {} : effects(sentence);
		const keys = Object.keys(found);
		// "add 1 to the Toughness characteristic of models in this unit" names no attack.
		const statsOnly = keys.length > 0 && keys.every((k) => STAT_EFFECTS.has(k));
		let who = keys.length ? subject(sentence) : null;
		const army = sentence.match(
			/\bof (?:(?<kw>[a-z' /-]+?) )?models from your army\b/,
		);
		const enemyContext = Boolean(enemyHere) || enemyPicked || aboutEnemy;
		if (
			!who &&
			statsOnly &&
			enemyContext &&
			/\b(?:that (?:enemy )?unit|models in that unit|it)\b/.test(sentence)
		) {
			// "that unit cannot have the benefit of cover", "-1 T for models in that unit"
			who = { role: "defending", phase: "any", text: "", enemy: true };
		} else if (
			!who &&
			statsOnly &&
			selected &&
			/\bthat unit\b/.test(sentence)
		) {
			// "select one other friendly BEAST unit … +1 T for models in that unit"
			who = { role: "defending", phase: "any", text: "" };
		} else if (!who && statsOnly && army) {
			who = {
				role: "defending",
				phase: "any",
				text: "",
				scope: "list",
				unitKeywords: keywordList(army.groups.kw),
			};
		} else if (
			!who &&
			statsOnly &&
			isLeading &&
			/\b(?:bodyguard )?models in that unit\b/.test(sentence)
		) {
			// The unit it leads: the leader's modifier covers the attached unit.
			who = { role: "defending", phase: "any", text: "" };
		} else if (!who && statsOnly && OWN_MODELS.test(sentence) && !aura) {
			// The text tells "this model" (a leader alone) from "models in this unit".
			const own = sentence.match(OWN_MODELS)[0].replace(/^of /, "");
			who = { role: "defending", phase: "any", text: own };
		}
		// "… can: - re-roll hit rolls of 1": the aura's units make the attacks;
		// "… have +1 T": their models are the ones attacked.
		if (!who && keys.length && (aura || auraList)) {
			who = {
				role: statsOnly ? "defending" : "attacking",
				phase: "any",
				text: "",
			};
			aura = true;
		}
		// "… an enemy unit … it is Afflicted / that unit has the effect …":
		// from here on, "this unit" is that enemy unit, not the ability's owner.
		if (
			(!who || enemyHere) &&
			/\benemy units?\b/.test(raw) &&
			/\b(?:that unit|it) (?:has|is|gains|suffers)\b/.test(sentence)
		) {
			aboutEnemy = true;
		}
		if (!who) {
			if (SELECT_ENEMY.test(sentence)) {
				enemyPicked = true;
				selected = null;
			}
			const pick = sentence.match(SELECT_FRIENDLY);
			if (pick) {
				selected = { unitKeywords: keywordList(pick.groups.kw) };
				enemyPicked = false;
			}
			if (aura) continue;
			// Every condition word; "select one of …" marks the options that follow.
			if (CHOICE.test(sentence) && !carried.includes("earlier: choice")) {
				carried.push("earlier: choice");
			}
			for (const [condition] of sentence.matchAll(
				new RegExp(CONDITIONS.source, "g"),
			)) {
				const reason = `earlier: ${condition}`;
				if (!carried.includes(reason)) carried.push(reason);
			}
			continue;
		}

		const reasons = [...carried, ...rewriteReasons];
		const base = {
			...(weaponFilter ? { weaponFilter } : {}),
			...(versus ? { strengthVsToughness: versus.mode } : {}),
		};

		// The subject is the enemy unit: its attacks are weakened (a defensive
		// modifier for your units) or attacks against it are helped (an attacking one).
		const enemySubject =
			who.enemy ||
			(enemyContext &&
				(/\bthat (?:enemy )?(?:unit|model)\b/.test(who.text) ||
					(aboutEnemy && /\bthis (?:unit|model)\b/.test(who.text))));
		if (enemySubject) {
			const role = who.role === "attacking" ? "defending" : "attacking";
			const flipped = {};
			for (const [key, value] of Object.entries(found)) {
				if (!ENEMY_EFFECTS[role].has(key)) continue;
				if (key === "denyCover") flipped.weaponAbilities = "[IGNORES COVER]";
				else flipped[key] = value;
			}
			if (!Object.keys(flipped).length) continue;
			reasons.push("enemy unit");
			// Your attacks against a unit you picked: on when you pick it.
			if (role === "attacking" && enemyPicked && !enemyHere) {
				reasons.push("selected target");
			}
			const condition = sentence
				.replace(who.text || " ", " ")
				.match(CONDITIONS);
			if (condition) reasons.push(condition[0]);
			results.push({
				option: "",
				scope: "list",
				modifier: {
					role,
					phase: who.phase,
					vsKeywords: "",
					...(enemyHere?.excludeVsKeywords
						? { excludeVsKeywords: enemyHere.excludeVsKeywords }
						: {}),
					...base,
					...flipped,
				},
				conditional: true,
				reasons,
				sentence: raw,
			});
			continue;
		}
		// An effect for a unit described earlier as an enemy: not yours.
		if (aboutEnemy) continue;

		// Only units within range get it; best case, that is all of them.
		if (who.aura) reasons.push("aura");
		// The subject may name keywords of its own ("targets a VEHICLE unit from your army").
		const target = targetKeywords(
			who.text ? sentence.replace(who.text, " ") : sentence,
		);
		if (!target) reasons.push("target condition");
		// Only what the role allows; e.g. a defender cannot gain [LETHAL HITS].
		// A unit's own Feel No Pain is read from its profile; only one it hands
		// to others (an aura, a leader, an army rule) is a modifier.
		const handsOn = aura || isLeading || who.scope === "list";
		const allowed = Object.fromEntries(
			Object.entries(found).filter(
				([key]) =>
					(who.role === "attacking"
						? !DEFENDING_ONLY.has(key)
						: DEFENDING_EFFECTS.has(key)) &&
					// …or one limited to some attacks ("psychic attacks").
					(key !== "fnp" || handsOn || weaponFilter !== ""),
			),
		);
		if (!Object.keys(allowed).length) continue;

		// What is left once the subject and the target keywords are read.
		let rest = who.text ? sentence.replace(who.text, " ") : sentence;
		if (target?.text) rest = rest.replace(target.text, " ");
		const condition = rest.match(CONDITIONS);
		if (condition) reasons.push(condition[0]);
		// "that unit" outside a leader ability refers to something selected earlier.
		// In an aura, "that unit" is the friendly unit in range.
		// A friendly unit picked earlier is one of the list's units, by keyword.
		const refersBack = !isLeading && !aura && /\bthat unit\b/.test(sentence);
		const picked = refersBack && selected !== null;
		if (picked) reasons.push("selected unit");
		else if (refersBack) reasons.push("that unit");

		// A short title before the subject names an option: "dacatarai stance melee weapons …".
		const before = who.text
			? sentence.slice(0, sentence.indexOf(who.text)).trim()
			: "";
		const option =
			/^[a-z' -]{3,40}$/.test(before) && before.split(" ").length <= 4
				? before
				: "";

		results.push({
			option,
			// "list": an aura or army rule, for every unit of the list rather than its owner.
			scope: aura || picked || who.scope === "list" ? "list" : "unit",
			modifier: {
				role: who.role,
				phase: who.phase,
				vsKeywords: (target?.keywords ?? []).join(", "),
				...(aura ? auraUnits : {}),
				...(picked ? selected : {}),
				...(who.unitKeywords ? { unitKeywords: who.unitKeywords } : {}),
				...(who.excludeUnitKeywords
					? { excludeUnitKeywords: who.excludeUnitKeywords }
					: {}),
				...base,
				// "the bearer", "this model": not the unit a leader joins.
				...(!isLeading && ownModels(who.text) ? { ownModelsOnly: true } : {}),
				...allowed,
			},
			conditional: reasons.length > 0,
			reasons,
			sentence: raw,
		});
	}
	return results;
}
