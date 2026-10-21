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
	return text
		.split(/(?<=\.)\s+|\s*[\n■•]\s*|(?:^|\s)-\s(?=[a-z])/)
		.map((s) => s.trim().replace(/^-\s*/, ""))
		.filter((s) => s && !ELIGIBILITY.test(s));
}

// Who the ability talks about. `the bearer` is the model with an enhancement.
const SELF =
	"(?:this unit|this model|this model's unit|the bearer|the bearer's unit|models in (?:this|the bearer's) unit|that unit)";
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
const ARMY_UNIT =
	"(?:a model in )?an? (?:(?<kw>[a-z' /-]+?) )?(?:model|unit) from your army";
const ARMY_ATTACKING = [
	new RegExp(
		`each time ${ARMY_UNIT} makes an? (?:(?<phase>melee|ranged) )?attack`,
	),
	new RegExp(
		`each time an? (?:(?<phase>melee|ranged) )?attack (?:is )?made by ${ARMY_UNIT}`,
	),
	/friendly (?<kw>[a-z' /-]+?) units' (?:(?<phase>melee|ranged) )?(?:attacks|weapons)/,
];
const ARMY_DEFENDING = [
	new RegExp(
		`each time an? (?:(?<phase>melee|ranged) )?attack targets ${ARMY_UNIT}`,
	),
];

const PHASE = { melee: "fight", ranged: "shooting" };

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
function effects(s) {
	const e = {};
	const set = (key, value) => {
		if (value) e[key] = (e[key] ?? 0) + value;
	};

	// "re-roll a hit roll of 1", "re-roll hit rolls of 1", "re-roll the hit roll"
	if (/re-?roll (?:(?:a|the) )?hit rolls? of 1\b/.test(s))
		e.rerollHits = "ones";
	else if (/re-?roll (?:the )?hit rolls?\b/.test(s)) e.rerollHits = "all";
	if (/re-?roll (?:(?:a|the) )?wound rolls? of 1\b/.test(s))
		e.rerollWounds = "ones";
	else if (/re-?roll (?:the )?wound rolls?\b/.test(s)) e.rerollWounds = "all";

	for (const m of s.matchAll(/(add|subtract) (\d) (?:to|from) the hit roll/g))
		set("hitModifier", signed(m[1], m[2]));
	for (const m of s.matchAll(/(add|subtract) (\d) (?:to|from) the wound roll/g))
		set("woundModifier", signed(m[1], m[2]));
	for (const m of s.matchAll(/([+-])(\d) to hit rolls?\b/g))
		set("hitModifier", signed(m[1], m[2]));
	for (const m of s.matchAll(/([+-])(\d) to wound rolls?\b/g))
		set("woundModifier", signed(m[1], m[2]));

	// "improve the armour penetration and damage characteristics … by 1"
	for (const m of s.matchAll(
		/(improve|worsen) the armou?r penetration(?: and damage)? characteristics? (?:of [a-z' ]+ )?by (\d)/g,
	)) {
		const value = (m[1] === "worsen" ? -1 : 1) * Number(m[2]);
		set("apModifier", value);
		if (m[0].includes("and damage")) set("damageModifier", value);
	}
	for (const m of s.matchAll(
		/(add|subtract) (\d) (?:to|from) the damage characteristics?/g,
	))
		set("damageModifier", signed(m[1], m[2]));
	// "add 3 to the strength and add 1 to the attacks characteristics",
	// "add 1 to the strength and attacks characteristics"
	for (const m of s.matchAll(
		/(add|subtract) (\d) (?:to|from) the strength( and attacks)?\b/g,
	)) {
		set("strengthModifier", signed(m[1], m[2]));
		if (m[3]) set("attacksModifier", signed(m[1], m[2]));
	}
	for (const m of s.matchAll(/(add|subtract) (\d) (?:to|from) the attacks\b/g))
		set("attacksModifier", signed(m[1], m[2]));
	for (const m of s.matchAll(
		/improve the (strength|attacks) characteristics? (?:of [a-z' ]+ )?by (\d)/g,
	))
		set(
			m[1] === "strength" ? "strengthModifier" : "attacksModifier",
			Number(m[2]),
		);

	// "improve the ballistic skill and weapon skill characteristics … by 1"
	for (const m of s.matchAll(
		/improve the (?:ballistic skill|weapon skill)(?: and (?:ballistic|weapon) skill)? characteristics? (?:of [a-z' ]+ )?by (\d)/g,
	))
		set("skillModifier", Number(m[1]));

	// Short 11e notation: "have +1 AP", "have -1 D", "+1 S".
	for (const m of s.matchAll(/\bhave ([+-])(\d) ?(ap|d|s|a)\b/g)) {
		const key = {
			ap: "apModifier",
			d: "damageModifier",
			s: "strengthModifier",
			a: "attacksModifier",
		}[m[3]];
		set(key, signed(m[1], m[2]));
	}

	const brackets = s.match(
		/ha(?:s|ve)(?: the)? ((?:\[[^\]]+\](?:,? (?:and )?)?)+)/,
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
	if (/ha(?:s|ve) the benefit of cover/.test(s)) e.cover = true;

	// "a critical hit is scored on an unmodified hit roll of 5+",
	// "an unmodified successful wound roll of 5+ scores a critical wound"
	const critical = (kind) =>
		s.match(
			new RegExp(
				`critical ${kind} (?:is scored )?on (?:an? )?(?:unmodified )?(?:${kind} roll of )?(\\d)\\+|unmodified (?:successful )?${kind} rolls? of (\\d)\\+ scores? an? critical ${kind}`,
			),
		);
	const critHit = critical("hit");
	if (critHit) e.critHitOn = Number(critHit[1] ?? critHit[2]);
	const critWound = critical("wound");
	if (critWound) e.critWoundOn = Number(critWound[1] ?? critWound[2]);

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
const DEFENDING_ONLY = new Set(["cover", "halveDamage", "damageToOne"]);

/** Effects a defending unit can have; the rest only make sense for attacks. */
const DEFENDING_EFFECTS = new Set([
	"hitModifier",
	"woundModifier",
	"apModifier",
	"damageModifier",
	"cover",
	"halveDamage",
	"damageToOne",
]);

/** Words that limit when an effect applies. */
const CONDITIONS =
	/\b(?:if|while|within|select(?:ed|s)?|once per|until|instead|unless|battle-?shock(?:ed)?|below|starting strength|half-strength|charge(?:d)?|stationary|objective|start of|end of|command phase|stratagem|d6|opponent|visible|closest|fallen back|advanced|destroyed|mortal wounds?|aura|psychic|this turn|this phase|wounds remaining|one hit roll|one wound roll|excluding|without|cannot|can fly|greater than|less than|characteristic of \d|\d+"|with (?:its|their|the bearer's|an?)\b|\btargets?\b)/;

/** Effects the engine cannot express: a sentence that has one is left alone. */
const UNSUPPORTED =
	/characteristic of -?\d|set the|mortal wound|feel no pain|invulnerable save|\bstealth\b|\bweapon has\b/;

// Auras reach every friendly unit in range, so they apply list-wide:
// "friendly X units (excluding …) within 6" of this model can:" (effects may
// follow as a list) and "while a friendly X unit is within 6" of this model,
// … that unit …".
const AURA_UNITS =
	/^friendly (?:(?<kw>[a-z' /-]+?) )?(?:units?|models?)(?: \((?<not>[^)]*)\))? within \d+"? of (?:this model|the bearer)(?:'s unit)?,?\s*/;
const AURA_WHILE =
	/^while an? friendly (?:(?<kw>[a-z' /-]+?) )?(?:unit|model) is within \d+"? of (?:this model|the bearer)(?:'s unit)?,?\s*/;

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
	const leading = /while this model is leading a unit,?\s*/;

	// A condition in a sentence without an effect of its own ("select one of the
	// abilities below", "while an enemy unit is within …") governs what follows.
	const carried = [];
	// "friendly units within 6" … can:" names the subject for the list that follows.
	let auraList = false;
	// The units an aura reaches, carried into the list that follows it.
	let auraUnits = {};
	for (const raw of sentences(normalized)) {
		const isLeading = leading.test(raw);
		// "a unit that can fly" is the FLY keyword.
		let sentence = raw
			.replace(leading, "")
			.replace(/\ban? (?:enemy )?units? that can fly\b/g, "a fly unit")
			.replace(INSTEAD_OF_SIX, "");
		let aura = false;
		for (const pattern of [AURA_WHILE, AURA_UNITS]) {
			const match = sentence.match(pattern);
			if (!match) continue;
			aura = true;
			auraUnits = {
				unitKeywords: keywordList(match.groups.kw),
				excludeUnitKeywords: keywordList(match.groups.not),
			};
			if (pattern === AURA_UNITS) auraList = true;
			sentence = sentence.replace(pattern, "");
		}
		const found = UNSUPPORTED.test(sentence) ? {} : effects(sentence);
		let who = Object.keys(found).length ? subject(sentence) : null;
		// "… can: - re-roll hit rolls of 1": the aura's units make the attacks.
		if (!who && Object.keys(found).length && (aura || auraList)) {
			who = { role: "attacking", phase: "any", text: "" };
			aura = true;
		}
		if (!who) {
			if (aura) continue;
			// Every condition word, so a later "select" still reads as a choice.
			for (const [condition] of sentence.matchAll(
				new RegExp(CONDITIONS.source, "g"),
			)) {
				const reason = `earlier: ${condition}`;
				if (!carried.includes(reason)) carried.push(reason);
			}
			continue;
		}

		const reasons = [...carried];
		// Only units within range get it; best case, that is all of them.
		if (aura) reasons.push("aura");
		// The subject may name keywords of its own ("targets a VEHICLE unit from your army").
		const target = targetKeywords(
			who.text ? sentence.replace(who.text, " ") : sentence,
		);
		if (!target) reasons.push("target condition");
		// Only what the role allows; e.g. a defender cannot gain [LETHAL HITS].
		const allowed = Object.fromEntries(
			Object.entries(found).filter(([key]) =>
				who.role === "attacking"
					? !DEFENDING_ONLY.has(key)
					: DEFENDING_EFFECTS.has(key),
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
		if (!isLeading && !aura && /\bthat unit\b/.test(sentence)) {
			reasons.push("that unit");
		}

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
			scope: aura || who.scope === "list" ? "list" : "unit",
			modifier: {
				role: who.role,
				phase: who.phase,
				vsKeywords: (target?.keywords ?? []).join(", "),
				...(aura ? auraUnits : {}),
				...(who.unitKeywords ? { unitKeywords: who.unitKeywords } : {}),
				...allowed,
			},
			conditional: reasons.length > 0,
			reasons,
			sentence: raw,
		});
	}
	return results;
}
