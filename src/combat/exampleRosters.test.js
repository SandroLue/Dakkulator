// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { parseRosterXml } from "../library/loadRoster";
import { abilityModifiers } from "./abilityModifiers";
import { describeModifier } from "./modifiers";

// The example lists shipped in public/: what a user gets when adding them.
async function generated(file) {
	const zip = await JSZip.loadAsync(readFileSync(`public/${file}.rosz`));
	const roster = parseRosterXml(await zip.file(/\.ros$/)[0].async("string"));
	return abilityModifiers(roster, "A").map((m) => {
		const scope = m.unitName || m.unitKeywords || "every unit";
		const state = m.enabled ? "" : " (off)";
		return `${m.name} @ ${scope}: ${describeModifier(m)}${state}`;
	});
}

describe("modifiers generated for the example rosters", () => {
	it("Custodes", async () => {
		expect(await generated("Custodes")).toEqual([
			"Martial Ka'tah – Dacatarai Stance @ every unit: [SUSTAINED HITS 1] — when attacking, fight only (off)",
			"Martial Ka'tah – Rendax Stance @ every unit: [LETHAL HITS] — when attacking, fight only (off)",
			"Auramite and Adamantite @ Shield-Captain in Allarus Terminator Armour: damage becomes 1 — when defending",
			"Captain-General @ Trajann Valoris: ignore hit modifiers — when attacking",
			"Stand Vigil @ Custodian Guard: re-roll wounds (1s) — when attacking",
			"Slayers of Tyrants @ Allarus Custodians: re-roll wounds (all) — when attacking, vs CHARACTER / MONSTER / VEHICLE",
			"Purity of Execution @ Prosecutors: [PRECISION], [DEVASTATING WOUNDS] — when attacking, shooting only, vs PSYKER",
			"Daughters of the Abyss @ Prosecutors: Feel No Pain 3+ vs mortal wounds, Feel No Pain 3+ vs psychic attacks — when defending",
		]);
	});

	it("Necrons", async () => {
		expect(await generated("Necron")).toEqual([
			"Necrodermis @ C'tan Shard of the Deceiver: -1 Damage — when defending",
			"Destroyer Cult @ Lokhust Lord: critical hits on 5+ — when attacking, shooting only",
			"Driven by Hatred @ Lokhust Lord: re-roll hits (all), re-roll wounds (all) — when attacking",
			"Infectious Murder‑madness (Aura) @ NECRONS: [SUSTAINED HITS 1] — when attacking",
			"Prophet of Destruction @ DESTROYER CULT: re-roll wounds (1s) — when attacking",
			"Nullstone Field Generator (Aura) @ NECRONS: Feel No Pain 5+ vs mortal wounds, Feel No Pain 5+ vs psychic attacks — when defending",
			"Phaeron of the Stars (Aura) @ NECRONS: re-roll hits (1s), re-roll wounds (1s) — when attacking",
			"Implacable Eradication @ Immortals: re-roll wounds (1s) — when attacking",
			"Hard-wired for Destruction @ Lokhust Destroyers: re-roll hits (1s) — when attacking, shooting only",
			"Whirling Onslaught @ Skorpekh Destroyers: re-roll hits (1s) — when attacking, fight only",
		]);
	});

	it("Space Marines", async () => {
		expect(await generated("Space Marine")).toEqual([
			"Finest Hour @ Captain: +3 Attacks, [DEVASTATING WOUNDS] — when attacking, fight only",
			"Ballistus Strike @ Ballistus Dreadnought: re-roll hits (all) — when attacking, shooting only",
			"Bladeguard @ Bladeguard Veteran Squad: +1 Hit roll — when attacking, fight only",
			"Bladeguard @ Bladeguard Veteran Squad: -1 Hit roll — when defending",
			"Mark the Target @ Eliminator Squad: [DEVASTATING WOUNDS] — when attacking, shooting only",
			"Total Obliteration @ Eradicator Squad: re-roll hits (all), re-roll wounds (all), re-roll damage — when attacking, shooting only, vs MONSTER / VEHICLE",
			"Executioner @ Repulsor Executioner: +1 Hit roll — when attacking",
		]);
	});

	it("Tyranids", async () => {
		expect(await generated("Tyranids")).toEqual([
			"Onslaught (Aura, Psychic) @ TYRANIDS: [ASSAULT], [LETHAL HITS] — when attacking, shooting only",
			"Node Lash (Psychic) @ Neurotyrant: +1 Hit roll — when attacking",
			"Brood Progenitor (Aura, Psychic) @ TERMAGANTS: [LETHAL HITS] — when attacking, shooting only",
			"Singular Purpose @ Norn Assimilator: re-roll hits (all), re-roll wounds (all) — when attacking (off)",
			"Singular Purpose @ Norn Emissary: re-roll hits (all), re-roll wounds (all) — when attacking (off)",
			"Unnatural Resistance @ Norn Emissary: Feel No Pain 4+ vs mortal wounds — when defending",
			"Burning Spray @ every unit: [IGNORES COVER] — when attacking (off)",
		]);
	});

	it("Dark Angels", async () => {
		expect(await generated("Dark Angels")).toEqual([
			"Combat Doctrines – Devastator Doctrine @ every unit: [ASSAULT] — when attacking, shooting only (off)",
			"Supreme Grand Master @ Azrael: [SUSTAINED HITS 1] — when attacking",
			"Litany of Hate @ Chaplain: [LANCE] — when attacking, fight only",
			"The Emperor's Shield @ Lion El'Jonson: -1 Wound roll — when defending, if S > T",
			"The Watchers @ Lion El'Jonson: Feel No Pain 4+ vs mortal wounds, Feel No Pain 4+ vs psychic attacks — when defending",
			"No Hiding From the Watchers @ DARK ANGELS: Feel No Pain 5+ vs mortal wounds, Feel No Pain 5+ vs psychic attacks — when defending",
			"Targeted Intercession @ Assault Intercessor Squad: +1 Strength — when attacking, fight only",
			"Close-quarters Firepower @ Aggressor Squad: +1 Strength — when attacking",
			"Inner Circle @ Deathwing Knights: -1 Damage — when defending",
			"Special-issue Optics and Ammunition @ Eliminator Squad: [IGNORES COVER] — when attacking, shooting only",
			"Total Obliteration @ Eradicator Squad with Melta Rifles: re-roll damage — when attacking, shooting only",
			"Executioner @ Repulsor Executioner: +1 Hit roll — when attacking, shooting only",
		]);
	});
});
