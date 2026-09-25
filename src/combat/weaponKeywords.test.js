import { describe, expect, it } from "vitest";
import { abilityApplies, parseWeaponAbilities } from "./weaponKeywords";

const parse = (s) => parseWeaponAbilities(s);

describe("parseWeaponAbilities", () => {
	it("returns empty flags for empty input", () => {
		const flags = parse("-");
		expect(flags.unknown).toEqual([]);
		expect(flags.lethalHits).toBe(false);
		expect(flags.anti).toEqual([]);
	});

	it("parses a comma-separated unbracketed list", () => {
		const flags = parse("Rapid Fire 1, Lethal Hits, Anti-Vehicle 4+");
		expect(flags.rapidFire).toBe(1);
		expect(flags.lethalHits).toBe(true);
		expect(flags.anti).toEqual([{ keyword: "VEHICLE", threshold: 4 }]);
		expect(flags.unknown).toEqual([]);
	});

	it("parses bracketed tokens", () => {
		const flags = parse("[SUSTAINED HITS 1] [DEVASTATING WOUNDS]");
		expect(flags.sustainedHits).toBe(1);
		expect(flags.devastatingWounds).toBe(true);
	});

	it("parses several abilities inside one bracket", () => {
		const flags = parse("[TWIN-LINKED, MELTA 2]");
		expect(flags.twinLinked).toBe(true);
		expect(flags.melta).toBe(2);
	});

	it("is case and separator tolerant", () => {
		expect(parse("sustained hits 1").sustainedHits).toBe(1);
		expect(parse("ANTI-INFANTRY 2+").anti[0]).toEqual({
			keyword: "INFANTRY",
			threshold: 2,
		});
		expect(parse("Twin Linked").twinLinked).toBe(true);
		expect(parse("Close Quarters").closeQuarters).toBe(true);
	});

	it("handles dice-valued characteristics", () => {
		const flags = parse("Rapid Fire D3");
		expect(flags.rapidFire).toBe(2);
		expect(flags.raw.rapidFire).toBe("d3");
	});

	it("defaults bare numeric abilities to 1", () => {
		expect(parse("[BLAST]").blast).toBe(1);
		expect(parse("[CLEAVE 2]").cleave).toBe(2);
	});

	it("covers every 11th-edition weapon ability", () => {
		const flags = parse(
			"[ASSAULT], [BLAST], [CLEAVE 1], [CLOSE-QUARTERS], [DEVASTATING WOUNDS], [EXTRA ATTACKS], [HAZARDOUS], [HEAVY], [IGNORES COVER], [INDIRECT FIRE], [LANCE], [LETHAL HITS], [MELTA 2], [ONE SHOT], [PRECISION], [PSYCHIC], [RAPID FIRE 1], [SUSTAINED HITS 1], [TORRENT], [TWIN-LINKED], [ANTI-VEHICLE 4+]",
		);
		expect(flags.unknown).toEqual([]);
		expect(flags).toMatchObject({
			assault: true,
			blast: 1,
			cleave: 1,
			closeQuarters: true,
			devastatingWounds: true,
			extraAttacks: true,
			hazardous: true,
			heavy: true,
			ignoresCover: true,
			indirectFire: true,
			lance: true,
			lethalHits: true,
			melta: 2,
			oneShot: true,
			precision: true,
			psychic: true,
			rapidFire: 1,
			sustainedHits: 1,
			torrent: true,
			twinLinked: true,
		});
	});

	it("folds Pistol into Close-Quarters", () => {
		const flags = parse("[PISTOL]");
		expect(flags.pistol).toBe(true);
		expect(flags.closeQuarters).toBe(true);
	});

	it("keeps unrecognised tokens", () => {
		const flags = parse("[LETHAL HITS], Warp Surge 3");
		expect(flags.lethalHits).toBe(true);
		expect(flags.unknown).toEqual(["warp surge 3"]);
	});

	it("picks the best of a duplicated ability (§24.02)", () => {
		const flags = parse("[SUSTAINED HITS 1], [SUSTAINED HITS 2]");
		expect(flags.sustainedHits).toBe(2);
		expect(flags.duplicated).toContain("SUSTAINED HITS");
	});

	it("parses ability-with-keyword restrictions", () => {
		const flags = parse("[LETHAL HITS: VEHICLE, MONSTER]");
		expect(flags.lethalHits).toBe(true);
		expect(flags.restrictions.lethalHits).toEqual(["VEHICLE", "MONSTER"]);
		expect(flags.unknown).toEqual([]);
	});
});

describe("abilityApplies", () => {
	const flags = parse("[LETHAL HITS: VEHICLE]");

	it("applies when the target has the keyword", () => {
		expect(abilityApplies(flags, "lethalHits", new Set(["VEHICLE"]))).toBe(
			true,
		);
	});

	it("does not apply otherwise", () => {
		expect(abilityApplies(flags, "lethalHits", new Set(["INFANTRY"]))).toBe(
			false,
		);
	});

	it("applies unconditionally when unrestricted", () => {
		const plain = parse("[LETHAL HITS]");
		expect(abilityApplies(plain, "lethalHits", new Set())).toBe(true);
	});
});
