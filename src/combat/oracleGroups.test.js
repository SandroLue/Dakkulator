import { describe, expect, it } from "vitest";
import { oracle, oracleGroups } from "./__fixtures__/oracle";
import { engineInputs, scenarioGenerator } from "./__fixtures__/scenarios";
import { allocateAttacks, computeAttackStreams } from "./resolve";
import { mulberry32 } from "./simulate";

// The exact allocation against units of several model groups (a leader with
// bodyguards, a mixed squad), checked against the brute-force oracle that
// resolves every state with its own group's Toughness, saves and wounds.

const FIELDS = ["woundsLost", "modelsSlain", "pDestroyed"];
const GROUP_FIELDS = [
	"count",
	"wounds",
	"toughness",
	"save",
	"invuln",
	"fnp",
	"mortalFnp",
	"halveDamage",
	"damageToOne",
];

const groupOf = (sc) =>
	Object.fromEntries(GROUP_FIELDS.map((field) => [field, sc[field]]));

/** Two or three small groups, each with its own profile. */
function groupGenerator(seed) {
	const rng = mulberry32(seed);
	const int = (min, max) => min + Math.floor(rng() * (max - min + 1));
	const chance = (p) => rng() < p;
	return () =>
		Array.from({ length: int(2, 3) }, () => ({
			count: int(1, 3),
			wounds: int(1, 3),
			toughness: int(3, 8),
			save: int(2, 7),
			invuln: chance(0.3) ? int(4, 6) : null,
			fnp: chance(0.25) ? int(4, 6) : null,
			mortalFnp: chance(0.15) ? int(4, 6) : null,
			halveDamage: chance(0.1),
			damageToOne: chance(0.05),
		}));
}

function engineAgainstGroups(sc) {
	const total = sc.groups.reduce((sum, g) => sum + g.count, 0);
	const { profile, ctx } = engineInputs(sc);
	const groups = sc.groups.map((g) => engineInputs({ ...sc, ...g }).group);
	const streams = groups.map((group) =>
		// [BLAST] counts every model of the unit, not just this group's.
		computeAttackStreams(profile, { ...group, targetModelCount: total }, ctx),
	);
	return allocateAttacks([streams], groups);
}

describe("oracleGroups", () => {
	it("is the plain oracle for one group", () => {
		const next = scenarioGenerator(41);
		for (let i = 0; i < 80; i++) {
			const sc = next();
			const one = oracleGroups({ ...sc, groups: [groupOf(sc)] });
			const plain = oracle(sc);
			for (const field of FIELDS) {
				expect(one[field], `${field} ${JSON.stringify(sc)}`).toBeCloseTo(
					plain[field],
					12,
				);
			}
		}
	});
});

describe("engine matches the oracle across several model groups", () => {
	const next = scenarioGenerator(43);
	const nextGroups = groupGenerator(44);
	for (let i = 0; i < 120; i++) {
		// Fewer dice than usual: the oracle follows every state of every group.
		const base = next();
		const sc = {
			...base,
			attacks: ["1", "2", "3", "D3"][i % 4],
			models: 1 + (i % 2),
			groups: nextGroups(),
		};
		it(`scenario ${i}`, () => {
			const engine = engineAgainstGroups(sc);
			const expected = oracleGroups(sc);
			for (const field of FIELDS) {
				expect(engine[field], `${field} ${JSON.stringify(sc)}`).toBeCloseTo(
					expected[field],
					9,
				);
			}
		});
	}
});
