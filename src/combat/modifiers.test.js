import { describe, expect, it } from "vitest";
import {
	boltgunSquad,
	captain,
	marineTarget,
	vehicleTarget,
} from "./__fixtures__/units";
import { attachLeaders } from "./attach";
import { resolveUnitVsUnit } from "./index";
import {
	createModifier,
	describeModifier,
	modifiersForArmies,
	normalizeModifier,
	parseModifierList,
	parseModifierStore,
	selectModifiers,
	storeModifiersForArmies,
} from "./modifiers";

const resolve = (attacker, defender, modifiers, ctx = {}) =>
	resolveUnitVsUnit(attacker, defender, ctx, {
		modifiers,
		attackerList: "A",
		defenderList: "B",
	});

describe("normalizeModifier", () => {
	it("fills defaults and drops malformed values", () => {
		const m = normalizeModifier({
			list: "C",
			role: "sideways",
			hitModifier: "abc",
			woundModifier: "1",
			fnp: "5+",
			invuln: 9,
			rerollHits: "sometimes",
		});
		expect(m).toMatchObject({
			list: "A",
			role: "attacking",
			phase: "any",
			hitModifier: 0,
			woundModifier: 1,
			fnp: 5,
			invuln: null,
			rerollHits: "none",
			enabled: true,
		});
	});

	it("survives corrupt storage", () => {
		expect(parseModifierList("{not json")).toEqual([]);
		expect(parseModifierList('{"a":1}')).toEqual([]);
		expect(parseModifierList('[{"name":"x"}]')[0].name).toBe("x");
	});
});

describe("selectModifiers", () => {
	const args = {
		attacker: boltgunSquad,
		defender: vehicleTarget,
		attackerList: "A",
		defenderList: "B",
		phase: "shooting",
	};

	it("matches list, unit, role, phase and target keywords", () => {
		const modifiers = [
			createModifier({ name: "ok" }),
			createModifier({ name: "other list", list: "B" }),
			createModifier({ name: "both lists", list: "any" }),
			createModifier({ name: "unit", unitName: "Intercessor Squad" }),
			createModifier({ name: "other unit", unitName: "Captain" }),
			createModifier({ name: "melee", phase: "fight" }),
			createModifier({ name: "vs vehicle", vsKeywords: "Monster, vehicle" }),
			createModifier({ name: "vs infantry", vsKeywords: "INFANTRY" }),
			createModifier({ name: "off", enabled: false }),
			createModifier({ name: "defence", role: "defending", list: "B" }),
		];
		const { attacking, defending } = selectModifiers(modifiers, args);
		expect(attacking.map((m) => m.name)).toEqual([
			"ok",
			"both lists",
			"unit",
			"vs vehicle",
		]);
		expect(defending.map((m) => m.name)).toEqual(["defence"]);
	});

	it("matches a member of an attached unit", () => {
		const attached = attachLeaders(boltgunSquad, [captain]);
		const { attacking } = selectModifiers(
			[createModifier({ unitName: "Captain" })],
			{ ...args, attacker: attached },
		);
		expect(attacking).toHaveLength(1);
	});
});

describe("user modifiers in the resolver", () => {
	it("adds hit and wound roll modifiers", () => {
		const base = resolve(boltgunSquad, marineTarget, []);
		const buffed = resolve(boltgunSquad, marineTarget, [
			createModifier({ hitModifier: 1, woundModifier: 1 }),
		]);
		expect(buffed.weapons[0].detail.hitTarget).toBe(2);
		expect(buffed.weapons[0].detail.woundTarget).toBe(3);
		expect(buffed.totals.woundsLost).toBeGreaterThan(base.totals.woundsLost);
		expect(buffed.appliedModifiers).toHaveLength(1);
	});

	it("keeps roll modifiers capped at ±1 across all sources", () => {
		const result = resolve(
			boltgunSquad,
			marineTarget,
			[
				createModifier({ hitModifier: 1 }),
				createModifier({ hitModifier: 1, list: "any" }),
			],
			{ hitModifier: 1 },
		);
		expect(result.weapons[0].detail.hitTarget).toBe(2);
	});

	it("takes the best re-roll", () => {
		const result = resolve(
			boltgunSquad,
			marineTarget,
			[
				createModifier({ rerollWounds: "all" }),
				createModifier({ rerollWounds: "ones" }),
			],
			{ rerollWounds: "none" },
		);
		// 4+ to wound with full re-rolls: 1/2 + 1/2 * 1/2.
		expect(result.weapons[0].detail.woundProbability).toBeCloseTo(0.75, 5);
	});

	it("grants weapon abilities", () => {
		const result = resolve(boltgunSquad, marineTarget, [
			createModifier({ weaponAbilities: "[LETHAL HITS], [SUSTAINED HITS 1]" }),
		]);
		expect(result.weapons[0].autoWounds).toBeGreaterThan(0);
		expect(result.weapons[0].sustainedHits).toBeGreaterThan(0);
	});

	it("reports unrecognised granted weapon abilities", () => {
		const result = resolve(boltgunSquad, marineTarget, [
			createModifier({ weaponAbilities: "[MADE UP]" }),
		]);
		expect(result.warnings.unknownWeaponAbilities).toContain("made up");
	});

	it("raises Strength", () => {
		const result = resolve(boltgunSquad, marineTarget, [
			createModifier({ strengthModifier: 1 }),
		]);
		expect(result.weapons[0].detail.woundTarget).toBe(3);
	});

	it("applies defender Feel No Pain, invulnerable save and damage reduction", () => {
		const base = resolve(boltgunSquad, marineTarget, []);
		const tough = resolve(boltgunSquad, marineTarget, [
			createModifier({
				role: "defending",
				list: "B",
				fnp: 5,
				invuln: 4,
				damageModifier: -1,
			}),
		]);
		expect(tough.groups[0].fnp).toBe(5);
		expect(tough.groups[0].invuln).toBe("4+");
		// Damage 1 cannot drop below 1.
		expect(tough.weapons[0].damagePmf[1]).toBeCloseTo(1, 10);
		expect(tough.totals.woundsLost).toBeLessThan(base.totals.woundsLost);
	});

	it("limits a defensive modifier to its own models in an attached unit", () => {
		const attached = attachLeaders(boltgunSquad, [captain]);
		const result = resolve(marineTarget, attached, [
			createModifier({
				role: "defending",
				list: "B",
				unitName: "Captain",
				invuln: 2,
			}),
		]);
		const byName = Object.fromEntries(
			result.groups.map((g) => [g.unitName, g]),
		);
		expect(byName.Captain.invuln).toBe("2+");
		expect(byName["Intercessor Squad"].invuln).toBe("");
	});

	it("lets the attacker ignore negative hit modifiers", () => {
		const result = resolve(
			boltgunSquad,
			marineTarget,
			[
				createModifier({ role: "defending", list: "B", hitModifier: -1 }),
				createModifier({ ignoreHitModifiers: true }),
			],
			{ targetInCover: true },
		);
		expect(result.weapons[0].detail.hitTarget).toBe(3);
	});

	// "Ignore modifiers" drops each negative one on its own; bonuses stay.
	it("keeps hit bonuses when ignoring the penalties next to them", () => {
		const ignore = createModifier({ ignoreHitModifiers: true });
		// Damaged (-1) and a +1 battlefield bonus net to 0; ignoring the -1 leaves +1.
		const battlefield = resolve(boltgunSquad, marineTarget, [ignore], {
			attackerDamaged: true,
			hitModifier: 1,
		});
		expect(battlefield.weapons[0].detail.hitTarget).toBe(2);

		const abilities = resolve(boltgunSquad, marineTarget, [
			createModifier({ role: "defending", list: "B", hitModifier: -1 }),
			createModifier({ hitModifier: 1 }),
			ignore,
		]);
		expect(abilities.weapons[0].detail.hitTarget).toBe(2);

		// Cover's -1 BS goes, plunging fire's +1 BS stays.
		const skill = resolve(boltgunSquad, marineTarget, [ignore], {
			targetInCover: true,
			plungingFire: true,
		});
		expect(skill.weapons[0].detail.hitTarget).toBe(2);
	});

	it("applies attacker BS, AP, Damage and Attacks modifiers", () => {
		const plain = resolve(boltgunSquad, marineTarget, []).weapons[0];
		const boosted = resolve(boltgunSquad, marineTarget, [
			createModifier({
				skillModifier: 1,
				apModifier: 1,
				damageModifier: 1,
				attacksModifier: 1,
			}),
		]).weapons[0];
		expect(boosted.detail.hitTarget).toBe(plain.detail.hitTarget - 1);
		expect(boosted.detail.saveTarget).toBe(plain.detail.saveTarget + 1);
		expect(boosted.damageExpr.flat).toBe(plain.damageExpr.flat + 1);
		// Boltguns are A2 on 10 models: +1 A is 10 more attacks.
		expect(boosted.declaredAttacks).toBeCloseTo(plain.declaredAttacks + 10, 6);
	});

	it("gives the defender the benefit of cover", () => {
		const covered = resolve(boltgunSquad, marineTarget, [
			createModifier({ role: "defending", list: "B", cover: true }),
		]);
		expect(covered.weapons[0].detail.hitTarget).toBe(4);
	});

	it("limits a leader's own Damage and AP protection to the leader", () => {
		const attached = attachLeaders(structuredClone(boltgunSquad), [
			structuredClone(captain),
		]);
		const shooter = structuredClone(boltgunSquad);
		for (const w of [
			...shooter.rangedWeapons,
			...shooter.models[0].rangedWeapons,
		]) {
			w.damage = "2";
		}
		const lost = (modifiers) =>
			resolve(shooter, attached, modifiers).totals.woundsLost;
		const shield = { role: "defending", list: "B", damageModifier: -1 };
		const plain = lost([]);
		// On the Captain only: the Intercessors in front still take full damage.
		expect(
			lost([createModifier({ ...shield, unitName: "Captain" })]),
		).toBeCloseTo(plain, 1);
		// On the whole unit: every model takes 1 instead of 2.
		expect(lost([createModifier(shield)])).toBeCloseTo(plain / 2, 1);
	});

	it("ignores a switched-off modifier", () => {
		const off = resolve(boltgunSquad, marineTarget, [
			createModifier({ hitModifier: 1, enabled: false }),
		]);
		expect(off.weapons[0].detail.hitTarget).toBe(3);
		expect(off.appliedModifiers).toEqual([]);
	});
});

describe("describeModifier", () => {
	it("summarises effects and conditions", () => {
		expect(
			describeModifier({
				hitModifier: 1,
				rerollWounds: "ones",
				phase: "fight",
				vsKeywords: "monster, vehicle",
			}),
		).toBe(
			"+1 Hit roll, re-roll wounds (1s) — when attacking, fight only, vs MONSTER / VEHICLE",
		);
	});
});

describe("modifiers stored per army", () => {
	const CUSTODES = "Imperium - Adeptus Custodes";
	const NECRONS = "Xenos - Necrons";
	const TYRANIDS = "Xenos - Tyranids";
	const empty = { armies: {}, shared: [] };
	const names = (list) => list.map((m) => `${m.list}:${m.name}`);

	it("hides an army's modifiers while another army is loaded", () => {
		const store = storeModifiersForArmies(empty, CUSTODES, TYRANIDS, [
			createModifier({ name: "Martial Ka'tah", list: "A" }),
			createModifier({ name: "Synapse", list: "B" }),
			createModifier({ name: "Night fight", list: "any" }),
		]);
		expect(names(modifiersForArmies(store, NECRONS, TYRANIDS))).toEqual([
			"B:Synapse",
			"any:Night fight",
		]);
		expect(names(modifiersForArmies(store, CUSTODES, TYRANIDS))).toEqual([
			"A:Martial Ka'tah",
			"B:Synapse",
			"any:Night fight",
		]);
	});

	it("keeps other armies' modifiers when saving", () => {
		const first = storeModifiersForArmies(empty, CUSTODES, TYRANIDS, [
			createModifier({ name: "Martial Ka'tah", list: "A" }),
		]);
		const second = storeModifiersForArmies(first, NECRONS, TYRANIDS, [
			createModifier({ name: "Reanimation", list: "A" }),
		]);
		expect(Object.keys(second.armies).sort()).toEqual([CUSTODES, NECRONS]);
	});

	it("follows the army into the other list", () => {
		const store = storeModifiersForArmies(empty, CUSTODES, TYRANIDS, [
			createModifier({ name: "Martial Ka'tah", list: "A" }),
		]);
		expect(names(modifiersForArmies(store, TYRANIDS, CUSTODES))).toEqual([
			"B:Martial Ka'tah",
		]);
	});

	it("keeps both lists apart in a mirror match", () => {
		const modifiers = [
			createModifier({ name: "Ka'tah A", list: "A" }),
			createModifier({ name: "Ka'tah B", list: "B" }),
		];
		const store = storeModifiersForArmies(empty, CUSTODES, CUSTODES, modifiers);
		expect(names(modifiersForArmies(store, CUSTODES, CUSTODES))).toEqual([
			"A:Ka'tah A",
			"B:Ka'tah B",
		]);
	});

	it("round-trips through JSON and drops malformed entries", () => {
		const store = storeModifiersForArmies(empty, CUSTODES, TYRANIDS, [
			createModifier({ name: "Martial Ka'tah", list: "A" }),
		]);
		expect(parseModifierStore(JSON.stringify(store))).toEqual(store);
		expect(parseModifierStore("not json")).toEqual(empty);
		expect(parseModifierStore('{"armies":{"x":5}}')).toEqual(empty);
	});
});

describe("critical, damage and keyword modifiers", () => {
	const withDamage = (damage) => {
		const shooter = structuredClone(boltgunSquad);
		for (const w of [
			...shooter.rangedWeapons,
			...shooter.models[0].rangedWeapons,
		]) {
			w.damage = damage;
		}
		return shooter;
	};

	it("scores critical hits and wounds on a lower roll", () => {
		const plain = resolve(boltgunSquad, marineTarget, []).weapons[0];
		const crits = resolve(boltgunSquad, marineTarget, [
			createModifier({ critHitOn: 5, critWoundOn: 5 }),
		]).weapons[0];
		expect(crits.critHits).toBeCloseTo(plain.critHits * 2, 6);
		expect(crits.detail.critWoundTarget).toBe(5);
		// A critical wound always wounds: 5+ beats the S4 vs T4 4+ only on crits.
		expect(crits.critWounds).toBeGreaterThan(plain.critWounds);
	});

	it("lets the attacker ignore negative wound modifiers", () => {
		const penalty = createModifier({
			role: "defending",
			list: "B",
			woundModifier: -1,
		});
		const penalised = resolve(boltgunSquad, marineTarget, [penalty]);
		expect(penalised.weapons[0].detail.woundTarget).toBe(5);
		const ignored = resolve(boltgunSquad, marineTarget, [
			penalty,
			createModifier({ ignoreWoundModifiers: true }),
		]);
		expect(ignored.weapons[0].detail.woundTarget).toBe(4);
	});

	it("re-rolls low damage rolls", () => {
		const shooter = withDamage("D6");
		const plain = resolve(shooter, vehicleTarget, []).weapons[0];
		const rerolled = resolve(shooter, vehicleTarget, [
			createModifier({ rerollDamage: true }),
		]).weapons[0];
		const mean = (pmf) => pmf.reduce((sum, p, v) => sum + p * v, 0);
		expect(mean(plain.damagePmf)).toBeCloseTo(3.5, 6);
		// Re-roll 1-3: half the time 3.5 more on average instead of 2.
		expect(mean(rerolled.damagePmf)).toBeCloseTo(0.5 * 5 + 0.5 * 3.5, 6);
	});

	it("halves damage or sets it to 1 for the defender", () => {
		const shooter = withDamage("4");
		const damage = (modifiers) =>
			resolve(shooter, vehicleTarget, modifiers).weapons[0].damagePmf.reduce(
				(sum, p, v) => sum + p * v,
				0,
			);
		const plain = damage([]);
		const defending = { role: "defending", list: "B" };
		expect(
			damage([createModifier({ ...defending, halveDamage: true })]),
		).toBeCloseTo(plain / 2, 6);
		expect(
			damage([createModifier({ ...defending, damageToOne: true })]),
		).toBeCloseTo(plain / 4, 6);
	});

	it("applies only to units with the named keywords", () => {
		const hitTarget = (modifier) =>
			resolve(boltgunSquad, marineTarget, [createModifier(modifier)]).weapons[0]
				.detail.hitTarget;
		expect(hitTarget({ hitModifier: 1, unitKeywords: "INFANTRY" })).toBe(2);
		expect(hitTarget({ hitModifier: 1, unitKeywords: "VEHICLE" })).toBe(3);
		// Faction keywords are matched word by word.
		expect(
			hitTarget({ hitModifier: 1, unitKeywords: "ADEPTUS ASTARTES INFANTRY" }),
		).toBe(2);
		expect(hitTarget({ hitModifier: 1, excludeUnitKeywords: "INFANTRY" })).toBe(
			3,
		);
	});

	it("describes the new effects", () => {
		expect(describeModifier({ critHitOn: 5, rerollDamage: true })).toContain(
			"critical hits on 5+, re-roll damage",
		);
		expect(
			describeModifier({ role: "defending", halveDamage: true }),
		).toContain("halve damage");
	});
});
