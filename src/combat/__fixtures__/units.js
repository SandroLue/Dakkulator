/**
 * Hand-written units in the shape produced by `Create40kRoster11th`, so engine
 * tests do not depend on file I/O.
 */

export function makeWeapon(overrides = {}) {
	return {
		name: "Weapon",
		selectionName: "",
		count: 1,
		range: '24"',
		type: "",
		attacks: "1",
		bs: "",
		ws: "",
		str: "4",
		ap: "0",
		damage: "1",
		abilities: "-",
		...overrides,
	};
}

export function makeModelStats(overrides = {}) {
	return {
		name: "Model",
		count: 1,
		move: '6"',
		ws: "4+",
		bs: "4+",
		str: 4,
		toughness: 4,
		wounds: 1,
		attacks: "1",
		leadership: "6+",
		save: "3+",
		invulnerableSave: "",
		oc: "1",
		...overrides,
	};
}

export function makeUnit({
	name = "Test Unit",
	role = "NONE",
	keywords = [],
	abilities = {},
	models = [],
	modelStats = [],
	points = 100,
} = {}) {
	const abilityGroups = {};
	for (const [group, entries] of Object.entries(abilities)) {
		abilityGroups[group] = new Map(Object.entries(entries));
	}
	return {
		name,
		role,
		factions: new Set(),
		keywords: new Set(keywords),
		abilities: abilityGroups,
		rules: new Map(),
		models,
		modelStats,
		modelList: [],
		rangedWeapons: models.flatMap((m) => m.rangedWeapons || []),
		meleeWeapons: models.flatMap((m) => m.meleeWeapons || []),
		woundTracker: [],
		cost: { points, commandPoints: 0, freeformValues: {} },
	};
}

/** 10 Marines with boltguns: A2, BS3+, S4, AP0, D1. */
export const boltgunSquad = makeUnit({
	name: "Intercessor Squad",
	keywords: ["INFANTRY", "IMPERIUM", "ADEPTUS ASTARTES"],
	modelStats: [
		makeModelStats({
			name: "Intercessor",
			bs: "3+",
			ws: "3+",
			toughness: 4,
			wounds: 2,
			save: "3+",
		}),
	],
	models: [
		{
			name: "Intercessor",
			count: 10,
			rangedWeapons: [
				makeWeapon({ name: "Boltgun", attacks: "2", str: "4", damage: "1" }),
			],
			meleeWeapons: [
				makeWeapon({
					name: "Close combat weapon",
					range: "Melee",
					attacks: "3",
					str: "4",
					damage: "1",
				}),
			],
			upgrades: [],
		},
	],
});

/** T4, Sv3+, W2 target — the §7 golden-value defender. */
export const marineTarget = makeUnit({
	name: "Marine Target",
	keywords: ["INFANTRY"],
	modelStats: [
		makeModelStats({ name: "Marine", toughness: 4, wounds: 2, save: "3+" }),
	],
	models: [{ name: "Marine", count: 10, rangedWeapons: [], meleeWeapons: [] }],
});

/** T10, Sv2+/4++, W12 VEHICLE with a degrading hit modifier. */
export const vehicleTarget = makeUnit({
	name: "Battle Tank",
	keywords: ["VEHICLE", "IMPERIUM"],
	abilities: {
		Abilities: {
			"Damaged: 1-4 Wounds Remaining":
				"While this model has 1-4 wounds remaining, each time this model makes an attack, subtract 1 from the Hit roll.",
		},
	},
	modelStats: [
		makeModelStats({
			name: "Battle Tank",
			bs: "3+",
			ws: "5+",
			toughness: 10,
			wounds: 12,
			save: "2+",
			invulnerableSave: "4+",
		}),
	],
	models: [
		{ name: "Battle Tank", count: 1, rangedWeapons: [], meleeWeapons: [] },
	],
});

/** Feel No Pain 5+ horde, W1 T5 Sv5+. */
export const fnpHorde = makeUnit({
	name: "Plague Marines",
	keywords: ["INFANTRY", "CHAOS"],
	abilities: {
		Abilities: { "Disgustingly Resilient": "This model has Feel No Pain 5+." },
	},
	modelStats: [
		makeModelStats({
			name: "Plague Marine",
			toughness: 5,
			wounds: 1,
			save: "5+",
		}),
	],
	models: [
		{ name: "Plague Marine", count: 10, rangedWeapons: [], meleeWeapons: [] },
	],
});

/** Two statlines, so allocation has to spill from one group into the next. */
export const mixedSquad = makeUnit({
	name: "Mixed Squad",
	keywords: ["INFANTRY"],
	points: 100,
	modelStats: [
		makeModelStats({ name: "Grunt", toughness: 4, wounds: 1, save: "6+" }),
		makeModelStats({ name: "Trooper", toughness: 4, wounds: 1, save: "5+" }),
	],
	models: [
		{ name: "Grunt", count: 1, rangedWeapons: [], meleeWeapons: [] },
		{ name: "Trooper", count: 4, rangedWeapons: [], meleeWeapons: [] },
	],
});

/** A CHARACTER that may join `boltgunSquad`, with a leader-only Feel No Pain. */
export const captain = makeUnit({
	name: "Captain",
	role: "Characters",
	keywords: ["INFANTRY", "CHARACTER", "IMPERIUM"],
	points: 80,
	abilities: {
		Abilities: {
			Leader:
				"This model can be attached to the following units: INTERCESSOR SQUAD, ASSAULT INTERCESSOR SQUAD.",
			"Iron Halo": "This model has Feel No Pain 5+.",
		},
	},
	modelStats: [
		makeModelStats({
			name: "Captain",
			bs: "2+",
			ws: "2+",
			str: 4,
			toughness: 4,
			wounds: 5,
			save: "3+",
			invulnerableSave: "4+",
		}),
	],
	models: [
		{
			name: "Captain",
			count: 1,
			rangedWeapons: [
				makeWeapon({ name: "Plasma pistol", attacks: "1", str: "7" }),
			],
			meleeWeapons: [
				makeWeapon({
					name: "Power fist",
					range: "Melee",
					attacks: "5",
					str: "8",
					damage: "2",
				}),
			],
			upgrades: [],
		},
	],
});
