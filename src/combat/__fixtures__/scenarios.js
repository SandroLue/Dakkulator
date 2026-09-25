import { parseDiceExpr } from "../diceExpr";
import { mulberry32 } from "../simulate";
import { parseWeaponAbilities } from "../weaponKeywords";

/** Turns an oracle scenario (see `oracle.js`) into engine inputs. */
export function engineInputs(sc) {
	const tags = [];
	if (sc.torrent) tags.push("[TORRENT]");
	if (sc.lethal) tags.push("[LETHAL HITS]");
	if (sc.devastating) tags.push("[DEVASTATING WOUNDS]");
	if (sc.twinLinked) tags.push("[TWIN-LINKED]");
	if (sc.psychic) tags.push("[PSYCHIC]");
	if (sc.ignoresCover) tags.push("[IGNORES COVER]");
	if (sc.indirect && sc.indirect !== "none") tags.push("[INDIRECT FIRE]");
	if (sc.sustained && sc.sustained !== "0")
		tags.push(`[SUSTAINED HITS ${sc.sustained}]`);
	if (sc.blast) tags.push(`[BLAST ${sc.blast}]`);
	if (sc.anti) tags.push(`[ANTI-INFANTRY ${sc.anti}+]`);

	const attacks = sc.attacks ?? "1";
	const profile = {
		weaponName: "Weapon",
		selectionName: "Weapon",
		carrierName: "Model",
		isMelee: false,
		count: sc.models ?? 1,
		attacks,
		attacksExpr: parseDiceExpr(attacks),
		skill: sc.skill ?? 4,
		strength: sc.strength ?? 4,
		ap: sc.ap || 0,
		damage: sc.damage ?? "1",
		abilities: parseWeaponAbilities(tags.join(", ")),
	};
	const save = sc.save ?? 7;
	const group = {
		name: "Target",
		toughness: sc.toughness ?? 4,
		save: save >= 7 ? "-" : `${save}+`,
		invuln: sc.invuln ? `${sc.invuln}+` : "",
		wounds: sc.wounds ?? 1,
		count: sc.count ?? 1,
		keywords: new Set(["INFANTRY"]),
		fnp: sc.fnp ?? null,
		pointsPerModel: 10,
	};
	const ctx = {
		skillModifier: sc.skillModifier || 0,
		hitModifier: sc.hitModifier || 0,
		woundModifier: sc.woundModifier || 0,
		rerollHits: sc.rerollHits || "none",
		rerollWounds: sc.rerollWounds || "none",
		targetInCover: Boolean(sc.cover),
		indirect: Boolean(sc.indirect && sc.indirect !== "none"),
		indirectSpotted: sc.indirect === "spotted",
	};
	return { profile, group, ctx };
}

/** Seeded generator of small scenarios, so the oracle stays fast. */
export function scenarioGenerator(seed) {
	const rng = mulberry32(seed);
	const int = (min, max) => min + Math.floor(rng() * (max - min + 1));
	const pick = (list) => list[Math.floor(rng() * list.length)];
	const chance = (p) => rng() < p;

	return () => {
		const torrent = chance(0.1);
		const count = int(1, 6);
		return {
			attacks: pick(["1", "2", "3", "D3", "D6", "D3+1"]),
			models: int(1, 3),
			skill: int(2, 6),
			skillModifier: int(-2, 1),
			hitModifier: int(-2, 2),
			rerollHits: pick(["none", "none", "ones", "all"]),
			torrent,
			indirect: !torrent && chance(0.15) ? pick(["blind", "spotted"]) : "none",
			psychic: chance(0.1),
			cover: chance(0.2),
			ignoresCover: chance(0.1),
			sustained: pick(["0", "0", "0", "1", "2", "D3"]),
			lethal: chance(0.3),
			blast: count >= 5 && chance(0.3) ? 1 : 0,
			strength: int(2, 10),
			toughness: int(2, 10),
			woundModifier: int(-1, 1),
			anti: chance(0.15) ? int(2, 5) : null,
			twinLinked: chance(0.15),
			rerollWounds: pick(["none", "none", "ones", "all"]),
			devastating: chance(0.25),
			save: int(2, 7),
			invuln: chance(0.3) ? int(3, 6) : null,
			ap: int(0, 3),
			damage: pick(["1", "2", "3", "D3", "D6", "D6+1"]),
			fnp: chance(0.25) ? int(4, 6) : null,
			wounds: int(1, 4),
			count,
		};
	};
}
