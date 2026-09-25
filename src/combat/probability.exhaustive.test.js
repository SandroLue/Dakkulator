import { describe, expect, it } from "vitest";
import { hitOutcomes, saveFails, woundOutcomes } from "./__fixtures__/oracle";
import {
	fnpFailProbability,
	hitProbability,
	saveProbability,
	woundProbability,
} from "./probability";

/** Sums the enumerated outcomes into P(success) and P(critical). */
function totals(outcomes, success) {
	let p = 0;
	let crit = 0;
	for (const o of outcomes) {
		if (o.result === "crit") crit += o.p;
		if (o.result === "crit" || o.result === success) p += o.p;
	}
	return { p, crit };
}

/** Runs every combination and reports the first few mismatches at once. */
function expectAll(combinations, check) {
	const failures = [];
	for (const input of combinations) {
		const problem = check(input);
		if (problem) failures.push({ input, ...problem });
		if (failures.length >= 5) break;
	}
	expect(failures).toEqual([]);
}

function* product(axes) {
	const keys = Object.keys(axes);
	const walk = function* (index, acc) {
		if (index === keys.length) {
			yield { ...acc };
			return;
		}
		for (const value of axes[keys[index]]) {
			acc[keys[index]] = value;
			yield* walk(index + 1, acc);
		}
	};
	yield* walk(0, {});
}

const range = (min, max) =>
	Array.from({ length: max - min + 1 }, (_, i) => min + i);
const close = (a, b) => Math.abs(a - b) < 1e-12;

describe("hitProbability — every input vs literal die enumeration", () => {
	it("covers skill x modifiers x re-rolls x indirect x [PSYCHIC] x [TORRENT]", () => {
		const combinations = product({
			skill: range(1, 7),
			skillModifier: range(-3, 3),
			hitModifier: range(-2, 2),
			rerollHits: ["none", "ones", "all"],
			indirect: ["none", "blind", "spotted"],
			psychic: [false, true],
			torrent: [false, true],
		});
		expectAll(combinations, (sc) => {
			// Cover from indirect shooting is added by resolve.js, not here.
			const expected = totals(
				hitOutcomes({ ...sc, ignoresCover: true }),
				"hit",
			);
			const actual = hitProbability({
				skill: sc.skill,
				skillModifier: sc.skillModifier,
				rollModifier: sc.hitModifier,
				torrent: sc.torrent,
				reroll: sc.rerollHits,
				indirect: sc.indirect !== "none",
				indirectSpotted: sc.indirect === "spotted",
				ignoreNegative: sc.psychic,
			});
			if (close(actual.hit, expected.p) && close(actual.critHit, expected.crit))
				return null;
			return { actual, expected };
		});
	});
});

describe("woundProbability — every input vs literal die enumeration", () => {
	it("covers S 1-24 x T 1-14 x modifiers x [ANTI] x [TWIN-LINKED] x re-rolls", () => {
		const combinations = product({
			strength: range(1, 24),
			toughness: range(1, 14),
			woundModifier: range(-2, 2),
			anti: [null, 2, 3, 4, 5, 6],
			twinLinked: [false, true],
			rerollWounds: ["none", "ones", "all"],
		});
		expectAll(combinations, (sc) => {
			const expected = totals(woundOutcomes(sc), "wound");
			const actual = woundProbability({
				strength: sc.strength,
				toughness: sc.toughness,
				rollModifier: sc.woundModifier,
				anti: sc.anti ? [{ keyword: "INFANTRY", threshold: sc.anti }] : [],
				targetKeywords: new Set(["INFANTRY"]),
				twinLinked: sc.twinLinked,
				reroll: sc.rerollWounds,
			});
			if (
				close(actual.wound, expected.p) &&
				close(actual.critWound, expected.crit)
			)
				return null;
			return { actual, expected };
		});
	});

	it("ignores [ANTI-X] against a target without keyword X", () => {
		const combinations = product({
			strength: range(1, 12),
			toughness: range(1, 12),
			anti: [2, 4, 6],
		});
		expectAll(combinations, (sc) => {
			const expected = totals(woundOutcomes({ ...sc, anti: null }), "wound");
			const actual = woundProbability({
				...sc,
				anti: [{ keyword: "VEHICLE", threshold: sc.anti }],
				targetKeywords: new Set(["INFANTRY"]),
			});
			return close(actual.wound, expected.p) ? null : { actual, expected };
		});
	});
});

describe("saveProbability — every input vs literal die enumeration", () => {
	it("covers Sv x InSv x AP x AP modifiers", () => {
		const combinations = product({
			save: range(2, 7),
			invuln: [null, 2, 3, 4, 5, 6],
			ap: range(0, 6),
			apModifier: range(-2, 2),
		});
		expectAll(combinations, (sc) => {
			// AP can never be worsened past 0 (§02.02.01 hard bounds).
			const expected = saveFails({
				...sc,
				ap: Math.max(0, sc.ap + sc.apModifier),
			});
			const actual = saveProbability({
				save: `${sc.save}+`,
				invuln: sc.invuln ? `${sc.invuln}+` : "",
				ap: sc.ap ? `-${sc.ap}` : "0",
				apModifier: sc.apModifier,
			});
			return close(actual.fail, expected) && close(actual.save + actual.fail, 1)
				? null
				: { actual, expected };
		});
	});
});

describe("fnpFailProbability — every threshold", () => {
	it("matches a D6 roll per wound", () => {
		for (const fnp of range(2, 7)) {
			const ignored = range(1, 6).filter((face) => face >= fnp).length / 6;
			expect(fnpFailProbability(fnp)).toBeCloseTo(1 - ignored, 12);
			expect(fnpFailProbability(`${fnp}+`)).toBeCloseTo(1 - ignored, 12);
		}
	});
});
