import { describe, expect, it } from "vitest";
import {
	applyModifiers,
	fnpFailProbability,
	hitProbability,
	parseAp,
	parseSkill,
	saveProbability,
	woundProbability,
	woundThreshold,
} from "./probability";

describe("parseSkill / parseAp", () => {
	it("parses skill strings", () => {
		expect(parseSkill("3+")).toBe(3);
		expect(parseSkill("3+|4+")).toBe(3);
		expect(parseSkill("-", 7)).toBe(7);
	});

	it("parses AP as a magnitude", () => {
		expect(parseAp("-2")).toBe(2);
		expect(parseAp("0")).toBe(0);
		expect(parseAp("")).toBe(0);
	});
});

describe("applyModifiers", () => {
	it("keeps characteristic and roll modifiers in separate buckets (§4.9)", () => {
		const result = applyModifiers({
			skill: 3,
			skillModifier: -2,
			rollModifier: -3,
		});
		expect(result.effectiveSkill).toBe(5);
		expect(result.rollModifier).toBe(-1);
	});

	it("clamps the characteristic to 1..7", () => {
		expect(applyModifiers({ skill: 2, skillModifier: 4 }).effectiveSkill).toBe(
			1,
		);
		expect(applyModifiers({ skill: 6, skillModifier: -4 }).effectiveSkill).toBe(
			7,
		);
	});

	it("ignores only detrimental modifiers for [PSYCHIC] (§02.02.02)", () => {
		const result = applyModifiers({
			skill: 3,
			skillModifier: -1,
			rollModifier: -1,
			ignoreNegative: true,
		});
		expect(result.effectiveSkill).toBe(3);
		expect(result.rollModifier).toBe(0);
	});
});

describe("hitProbability", () => {
	it("computes the base case", () => {
		const { hit, critHit } = hitProbability({ skill: 3 });
		expect(hit).toBeCloseTo(4 / 6, 10);
		expect(critHit).toBeCloseTo(1 / 6, 10);
	});

	it("stacks cover (-1 BS) with a -1 to hit aura to an effective 5+", () => {
		const { hit, target } = hitProbability({
			skill: 3,
			skillModifier: -1,
			rollModifier: -1,
		});
		expect(target).toBe(5);
		expect(hit).toBeCloseTo(2 / 6, 10);
	});

	it("never goes outside 1/6..5/6 when a roll is made", () => {
		expect(hitProbability({ skill: 7 }).hit).toBeCloseTo(1 / 6, 10);
		expect(hitProbability({ skill: 1 }).hit).toBeCloseTo(5 / 6, 10);
	});

	it("auto-hits with [TORRENT] and produces no critical hits", () => {
		expect(hitProbability({ skill: 4, torrent: true })).toMatchObject({
			hit: 1,
			critHit: 0,
		});
	});

	it("applies re-rolls to the unmodified die", () => {
		const ones = hitProbability({ skill: 3, reroll: "ones" });
		expect(ones.hit).toBeCloseTo(4 / 6 + (1 / 6) * (4 / 6), 10);
		expect(ones.critHit).toBeCloseTo(1 / 6 + (1 / 6) * (1 / 6), 10);

		const all = hitProbability({ skill: 3, reroll: "all" });
		expect(all.hit).toBeCloseTo(4 / 6 + (2 / 6) * (4 / 6), 10);
	});

	it("applies indirect fire rules (§24.19)", () => {
		const blind = hitProbability({ skill: 2, indirect: true, reroll: "all" });
		expect(blind.hit).toBeCloseTo(1 / 6, 10);

		const spotted = hitProbability({
			skill: 2,
			indirect: true,
			indirectSpotted: true,
		});
		expect(spotted.hit).toBeCloseTo(3 / 6, 10);
	});
});

describe("woundThreshold", () => {
	it("matches the §05.02 table", () => {
		expect(woundThreshold(8, 4)).toBe(2);
		expect(woundThreshold(5, 4)).toBe(3);
		expect(woundThreshold(4, 4)).toBe(4);
		expect(woundThreshold(3, 4)).toBe(5);
		expect(woundThreshold(2, 4)).toBe(6);
		expect(woundThreshold(4, 10)).toBe(6);
	});
});

describe("woundProbability", () => {
	it("computes the base case", () => {
		const result = woundProbability({ strength: 4, toughness: 4 });
		expect(result.wound).toBeCloseTo(0.5, 10);
		expect(result.critWound).toBeCloseTo(1 / 6, 10);
	});

	it("uses [ANTI-X Y+] as the critical threshold", () => {
		const result = woundProbability({
			strength: 4,
			toughness: 10,
			anti: [{ keyword: "VEHICLE", threshold: 4 }],
			targetKeywords: new Set(["VEHICLE"]),
		});
		expect(result.wound).toBeCloseTo(0.5, 10);
		expect(result.critWound).toBeCloseTo(0.5, 10);
	});

	it("ignores [ANTI-X] against the wrong keyword", () => {
		const result = woundProbability({
			strength: 4,
			toughness: 10,
			anti: [{ keyword: "VEHICLE", threshold: 4 }],
			targetKeywords: new Set(["INFANTRY"]),
		});
		expect(result.wound).toBeCloseTo(1 / 6, 10);
	});

	it("re-rolls with [TWIN-LINKED]", () => {
		const result = woundProbability({
			strength: 4,
			toughness: 4,
			twinLinked: true,
		});
		expect(result.wound).toBeCloseTo(0.75, 10);
	});

	it("applies [LANCE] as a wound roll modifier", () => {
		const result = woundProbability({
			strength: 4,
			toughness: 4,
			rollModifier: 1,
		});
		expect(result.wound).toBeCloseTo(4 / 6, 10);
	});
});

describe("saveProbability", () => {
	it("takes the better of armour and invulnerable automatically", () => {
		const result = saveProbability({ save: "3+", invuln: "4+", ap: "-2" });
		expect(result.target).toBe(4);
		expect(result.save).toBeCloseTo(0.5, 10);
		expect(result.fail).toBeCloseTo(0.5, 10);
	});

	it("handles no invulnerable save", () => {
		const result = saveProbability({ save: "3+", ap: "0" });
		expect(result.fail).toBeCloseTo(2 / 6, 10);
	});

	it("never saves on an impossible target", () => {
		const result = saveProbability({ save: "6+", ap: "-4" });
		expect(result.save).toBe(0);
		expect(result.fail).toBe(1);
	});
});

describe("fnpFailProbability", () => {
	it("is 1 without Feel No Pain", () => {
		expect(fnpFailProbability(null)).toBe(1);
	});

	it("is 1 - (7-X)/6", () => {
		expect(fnpFailProbability(5)).toBeCloseTo(2 / 3, 10);
		expect(fnpFailProbability("4+")).toBeCloseTo(0.5, 10);
	});
});
