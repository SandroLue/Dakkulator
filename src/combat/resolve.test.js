import { describe, expect, it } from "vitest";
import { oracle } from "./__fixtures__/oracle";
import { boltgunSquad, marineTarget } from "./__fixtures__/units";
import { buildAttackerProfiles, buildDefenderProfiles } from "./profiles";
import { computeAttackStreams, resolveWeaponVsGroup } from "./resolve";
import { parseWeaponAbilities } from "./weaponKeywords";

const boltgun = (type = "") => ({
	weaponName: "Boltgun",
	selectionName: "Boltgun",
	carrierName: "Intercessor",
	isMelee: false,
	models: 10,
	perModel: 1,
	count: 10,
	attacks: "2",
	attacksExpr: { dice: 0, sides: 0, flat: 2 },
	skill: 3,
	strength: 4,
	ap: 0,
	damage: "1",
	abilities: parseWeaponAbilities(type),
});

const t4sv3w2 = {
	name: "Marine",
	toughness: 4,
	save: "3+",
	invuln: "",
	wounds: 2,
	count: 10,
	keywords: new Set(["INFANTRY"]),
	fnp: null,
	pointsPerModel: 10,
};

describe("§7 golden values", () => {
	it("1. 10x Boltgun A2 BS3+ S4 AP0 D1 vs T4 Sv3+ W2", () => {
		const r = resolveWeaponVsGroup(boltgun(), t4sv3w2);
		expect(r.attacks).toBeCloseTo(20, 10);
		expect(r.hits).toBeCloseTo(13.3333, 3);
		expect(r.wounds).toBeCloseTo(6.6667, 3);
		expect(r.failedSaves).toBeCloseTo(2.2222, 3);
		expect(r.woundsLost).toBeCloseTo(2.2222, 3);
	});

	it("2. + [SUSTAINED HITS 1]", () => {
		const r = resolveWeaponVsGroup(boltgun("[SUSTAINED HITS 1]"), t4sv3w2);
		expect(r.hits).toBeCloseTo(13.3333 + 3.3333, 3);
	});

	it("3. + [LETHAL HITS]", () => {
		const r = resolveWeaponVsGroup(
			boltgun("[SUSTAINED HITS 1], [LETHAL HITS]"),
			t4sv3w2,
		);
		const critHits = 20 / 6;
		expect(r.wounds).toBeCloseTo((16.6667 - critHits) * 0.5 + critHits, 3);
	});

	it("4. [TORRENT] with D6 attacks", () => {
		const profile = {
			...boltgun("[TORRENT]"),
			count: 1,
			attacks: "D6",
			attacksExpr: { dice: 1, sides: 6, flat: 0 },
		};
		const r = resolveWeaponVsGroup(profile, t4sv3w2);
		expect(r.attacks).toBeCloseTo(3.5, 10);
		expect(r.hits).toBeCloseTo(3.5, 10);
		expect(r.critHits).toBe(0);
	});

	it("5. [ANTI-VEHICLE 4+] S4 vs T10 VEHICLE", () => {
		const vehicle = {
			...t4sv3w2,
			toughness: 10,
			keywords: new Set(["VEHICLE"]),
			wounds: 12,
			count: 1,
		};
		const r = resolveWeaponVsGroup(boltgun("[ANTI-VEHICLE 4+]"), vehicle);
		expect(r.wounds / r.hits).toBeCloseTo(0.5, 10);
	});

	it("6. AP-2 vs Sv3+ / InSv4+", () => {
		const target = { ...t4sv3w2, invuln: "4+" };
		const r = resolveWeaponVsGroup({ ...boltgun(), ap: 2 }, target);
		expect(r.detail.saveTarget).toBe(4);
		expect(r.failedSaves / r.wounds).toBeCloseTo(0.5, 10);
	});

	it("7. D6 damage vs W3 models loses the excess", () => {
		// 10 auto-hitting, auto-wounding, unsaveable D6 attacks vs 10x W3.
		const profile = {
			...boltgun("[TORRENT]"),
			count: 10,
			attacks: "1",
			attacksExpr: { dice: 0, sides: 0, flat: 1 },
			strength: 8,
			damage: "D6",
		};
		const target = { ...t4sv3w2, toughness: 1, save: "-", wounds: 3 };
		const r = resolveWeaponVsGroup(profile, target);
		// Wounds on 2+ (S8 vs T1), so 10 x 5/6 = 8.33 unsaved attacks, raw damage 29.17.
		expect(r.failedSaves).toBeCloseTo(50 / 6, 10);
		expect(r.rawDamage).toBeCloseTo((50 / 6) * 3.5, 10);
		// Exact values from the brute-force oracle; the cap loses ~10.6 of 29.17 damage.
		const expected = oracle({
			attacks: "1",
			models: 10,
			torrent: true,
			strength: 8,
			toughness: 1,
			damage: "D6",
			wounds: 3,
			count: 10,
		});
		expect(r.woundsLost).toBeCloseTo(expected.woundsLost, 10);
		expect(r.modelsSlain).toBeCloseTo(expected.modelsSlain, 10);
		expect(r.woundsLost).toBeCloseTo(18.6093, 4);
	});
});

describe("resolveWeaponVsGroup", () => {
	it("ends the attack sequence on [DEVASTATING WOUNDS]", () => {
		const plain = resolveWeaponVsGroup(boltgun(), t4sv3w2);
		const dev = resolveWeaponVsGroup(boltgun("[DEVASTATING WOUNDS]"), t4sv3w2);
		expect(dev.mortalWounds).toBeCloseTo(plain.wounds / 3, 3);
		expect(dev.woundsLost).toBeGreaterThan(plain.woundsLost);
	});

	it("caps [DEVASTATING WOUNDS] at one model per critical wound (§24.10)", () => {
		const profile = {
			...boltgun("[DEVASTATING WOUNDS]"),
			damage: "D6",
			count: 1,
			attacks: "1",
			attacksExpr: { dice: 0, sides: 0, flat: 1 },
		};
		const oneWound = { ...t4sv3w2, wounds: 1, count: 20 };
		const r = resolveWeaponVsGroup(profile, oneWound);
		// Hit 4/6; a critical wound (1/6) kills exactly one model whatever D6 rolls,
		// a normal wound (2/6) kills one on a failed 3+ save (1/3).
		expect(r.modelsSlain).toBeCloseTo(
			(4 / 6) * (1 / 6 + (2 / 6) * (1 / 3)),
			12,
		);
		expect(r.woundsLost).toBeCloseTo(r.modelsSlain, 12);
	});

	it("[LETHAL HITS] auto-wounds cannot become [DEVASTATING WOUNDS]", () => {
		const profile = {
			...boltgun("[LETHAL HITS], [DEVASTATING WOUNDS]"),
			count: 1,
			attacks: "6",
			attacksExpr: { dice: 0, sides: 0, flat: 6 },
		};
		const r = resolveWeaponVsGroup(profile, t4sv3w2);
		// 6 dice: 1 critical hit (auto-wound), 3 normal hits roll to wound.
		expect(r.autoWounds).toBeCloseTo(1, 12);
		expect(r.critWounds).toBeCloseTo(3 / 6, 12);
		expect(r.mortalWounds).toBeCloseTo(3 / 6, 12);
		expect(r.failedSaves).toBeCloseTo((1 + 3 * (2 / 6)) * (2 / 6), 12);
	});

	it("floors each random attacks roll at 1, not the mean", () => {
		const profile = {
			...boltgun(),
			count: 3,
			attacks: "D3-1",
			attacksExpr: { dice: 1, sides: 3, flat: -1 },
		};
		// Rolls 0, 1, 2 become 1, 1, 2.
		expect(resolveWeaponVsGroup(profile, t4sv3w2).attacks).toBeCloseTo(4, 12);
	});

	it("rolls [SUSTAINED HITS D3] for each critical hit", () => {
		const r = resolveWeaponVsGroup(boltgun("[SUSTAINED HITS D3]"), t4sv3w2);
		expect(r.sustainedHits).toBeCloseTo((20 / 6) * 2, 12);
		expect(r.sampling.sustainedExpr).toEqual({ dice: 1, sides: 3, flat: 0 });
	});

	it("worsens BS by 1 for cover, not the save", () => {
		const open = resolveWeaponVsGroup(boltgun(), t4sv3w2);
		const cover = resolveWeaponVsGroup(boltgun(), t4sv3w2, {
			targetInCover: true,
		});
		expect(cover.hits).toBeCloseTo(open.attacks * (3 / 6), 10);
		expect(cover.detail.saveTarget).toBe(open.detail.saveTarget);
	});

	it("ignores cover with [IGNORES COVER]", () => {
		const r = resolveWeaponVsGroup(boltgun("[IGNORES COVER]"), t4sv3w2, {
			targetInCover: true,
		});
		expect(r.hits).toBeCloseTo(20 * (4 / 6), 10);
	});

	it("gives the target cover against indirect shooting (§10.07)", () => {
		const bs4 = { ...boltgun("[INDIRECT FIRE]"), skill: 4 };
		const spotted = { indirect: true, indirectSpotted: true };
		// 1-3 fail, and cover worsens BS 4+ to 5+.
		expect(resolveWeaponVsGroup(bs4, t4sv3w2, spotted).hits).toBeCloseTo(
			20 * (2 / 6),
			10,
		);
		const ignores = {
			...bs4,
			abilities: parseWeaponAbilities("[INDIRECT FIRE], [IGNORES COVER]"),
		};
		expect(resolveWeaponVsGroup(ignores, t4sv3w2, spotted).hits).toBeCloseTo(
			20 * (3 / 6),
			10,
		);
		expect(
			resolveWeaponVsGroup(bs4, t4sv3w2, { indirect: true }).hits,
		).toBeCloseTo(20 / 6, 10);
	});

	it("lets [PSYCHIC] ignore hit modifiers but not wound modifiers (§24.29)", () => {
		const r = resolveWeaponVsGroup(boltgun("[PSYCHIC]"), t4sv3w2, {
			hitModifier: -1,
			woundModifier: -1,
		});
		expect(r.detail.hitProbability).toBeCloseTo(4 / 6, 12);
		expect(r.detail.woundProbability).toBeCloseTo(2 / 6, 12);
	});

	it("caps [HEAVY], Damaged and manual hit modifiers together at ±1", () => {
		const heavy = boltgun("[HEAVY]");
		const down = resolveWeaponVsGroup(heavy, t4sv3w2, {
			remainedStationary: true,
			attackerDamaged: true,
			hitModifier: -2,
		});
		expect(down.detail.hitTarget).toBe(4);
		const up = resolveWeaponVsGroup(heavy, t4sv3w2, {
			remainedStationary: true,
			hitModifier: 1,
		});
		expect(up.detail.hitTarget).toBe(2);
	});

	it("adds rapid fire dice within half range", () => {
		const r = resolveWeaponVsGroup(boltgun("[RAPID FIRE 1]"), t4sv3w2, {
			withinHalfRange: true,
		});
		expect(r.attacks).toBeCloseTo(30, 10);
	});

	it("adds blast dice per full five models", () => {
		const r = resolveWeaponVsGroup(boltgun("[BLAST]"), t4sv3w2);
		expect(r.attacks).toBeCloseTo(10 * (2 + 2), 10);
	});

	it("adds cleave dice per full five models to melee weapons", () => {
		const blade = { ...boltgun("[CLEAVE 1]"), isMelee: true, count: 1 };
		const r = resolveWeaponVsGroup(blade, { ...t4sv3w2, count: 16 });
		// §24.06 example: A3 vs 16 models gathers three extra dice; here A2 + 3.
		expect(r.attacks).toBeCloseTo(5, 10);
	});

	it("applies melta to the damage characteristic within half range", () => {
		const profile = { ...boltgun("[MELTA 2]"), damage: "D6+1" };
		const r = resolveWeaponVsGroup(profile, t4sv3w2, { withinHalfRange: true });
		expect(r.detail.damage).toEqual({ dice: 1, sides: 6, flat: 3 });
	});

	it("reduces damage with Feel No Pain", () => {
		const bare = resolveWeaponVsGroup(boltgun(), t4sv3w2);
		const fnp = resolveWeaponVsGroup(boltgun(), { ...t4sv3w2, fnp: 5 });
		expect(fnp.woundsLost).toBeCloseTo(bare.woundsLost * (2 / 3), 3);
	});
});

describe("computeAttackStreams", () => {
	it("works on profiles built from a roster unit", () => {
		const [profile] = buildAttackerProfiles(boltgunSquad, "shooting");
		const [group] = buildDefenderProfiles(marineTarget);
		const streams = computeAttackStreams(profile, group);
		expect(streams.attacks).toBeCloseTo(20, 10);
		expect(streams.hits).toBeCloseTo(13.3333, 3);
	});
});
