// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { afterEach, describe, expect, it, vi } from "vitest";
import { abilityModifiers } from "../combat/abilityModifiers";
import { calculateMatchup } from "../combat/index";
import {
	buildAttackerProfiles,
	buildDefenderProfiles,
	getUnitTotalModels,
	mineUnitAbilities,
} from "../combat/profiles";
import {
	applyAttachments,
	listUnits,
	suggestAttachments,
} from "../combat/unitList";
import { HANDMADE_ROSTER } from "./__fixtures__/handmadeRoster";
import {
	loadRosterFile,
	loadRosterUrl,
	parseRosterXml,
	readRosterXml,
} from "./loadRoster";

const byName = (entries, name) =>
	entries.find((entry) => entry.unit.name === name).unit;

describe("a hand-made roster through the whole pipeline", () => {
	const roster = parseRosterXml(HANDMADE_ROSTER);
	const entries = listUnits(roster);
	const lord = byName(entries, "Test Lord");
	const guard = byName(entries, "Test Guard");

	it("reads the units, their points, models and keywords", () => {
		expect(roster.cost.points).toBe(240);
		expect(roster.forces[0].catalog).toBe("Imperium - Test Legion");
		expect(entries.map((e) => e.unit.name)).toEqual([
			"Test Lord",
			"Test Guard",
		]);
		expect(lord.cost.points).toBe(90);
		expect(guard.cost.points).toBe(150);
		expect(getUnitTotalModels(guard)).toBe(5);
		expect([...guard.keywords]).toEqual(
			expect.arrayContaining(["Infantry", "Test Guard"]),
		);
	});

	it("offers the second profile of a weapon as an alternative", () => {
		const profiles = buildAttackerProfiles(lord, "fight");
		expect(profiles.map((p) => p.weaponName)).toEqual([
			"➤ Reaper glaive - strike",
		]);
		expect(profiles.alternatives.map((p) => p.weaponName)).toEqual([
			"➤ Reaper glaive - sweep",
		]);
		expect(profiles[0].choice).toBe(profiles.alternatives[0].choice);
	});

	it("mines the unit's own Feel No Pain, saves and wounds", () => {
		expect(mineUnitAbilities(lord).fnp).toBe(5);
		const [group] = buildDefenderProfiles(guard);
		expect(group).toMatchObject({
			toughness: 5,
			save: "2+",
			wounds: 3,
			count: 5,
		});
		expect(buildDefenderProfiles(lord)[0].invuln).toBe("4+");
	});

	it("attaches the obvious leader to its bodyguard", () => {
		const attachments = suggestAttachments(entries, {});
		const units = applyAttachments(entries, attachments);
		expect(units).toHaveLength(1);
		expect(units[0].unit.name).toBe("Test Guard + Test Lord");
		expect(units[0].unit.cost.points).toBe(240);
	});

	it("builds the abilities as modifiers, the unit's own Feel No Pain aside", () => {
		const modifiers = abilityModifiers(roster, "A");
		const summary = Object.fromEntries(
			modifiers.map((m) => [m.name, { unit: m.unitName, role: m.role }]),
		);
		expect(summary).toEqual({
			"Grim Resolve": { unit: "Test Lord", role: "attacking" },
			"Relic Blade": { unit: "Test Lord", role: "attacking" },
			"Shield Wall": { unit: "Test Guard", role: "defending" },
		});
		const relic = modifiers.find((m) => m.name === "Relic Blade");
		expect(relic).toMatchObject({ attacksModifier: 1, ownModelsOnly: true });
	});

	it("resolves a matchup of the attached unit without gaps", () => {
		const attached = applyAttachments(entries, suggestAttachments(entries, {}));
		const target = parseRosterXml(HANDMADE_ROSTER);
		const matchup = calculateMatchup(
			attached.map((e) => e.unit),
			listUnits(target).map((e) => e.unit),
			{ phase: "combined" },
			{
				modifiers: [
					...abilityModifiers(roster, "A"),
					...abilityModifiers(target, "B"),
				],
				attackerList: "A",
				defenderList: "B",
			},
		);
		for (const cell of matchup.rows[0].cells) {
			expect(Number.isFinite(cell.totals.woundsLost)).toBe(true);
			expect(cell.totals.woundsLost).toBeGreaterThan(0);
			// Both sources show: the lord's glaive and the guards' spears.
			const sources = new Set(cell.weapons.map((w) => w.sourceUnitName));
			expect(sources).toEqual(new Set(["Test Lord", "Test Guard"]));
		}
	});
});

describe("loading a roster file", () => {
	afterEach(() => vi.unstubAllGlobals());

	const file = (bytes) => ({ arrayBuffer: async () => bytes });

	it("reads a plain .ros and a zipped .rosz", async () => {
		const plain = new TextEncoder().encode(HANDMADE_ROSTER).buffer;
		expect(await readRosterXml(file(plain))).toBe(HANDMADE_ROSTER);
		const zip = new JSZip();
		zip.file("list.ros", HANDMADE_ROSTER);
		const zipped = await zip.generateAsync({ type: "arraybuffer" });
		expect((await loadRosterFile(file(zipped))).name).toBe("Handmade");
	});

	it("explains what is wrong with a file it cannot use", async () => {
		const zip = new JSZip();
		zip.file("readme.txt", "no roster here");
		const empty = await zip.generateAsync({ type: "arraybuffer" });
		await expect(readRosterXml(file(empty))).rejects.toThrow(/no \.ros/);
		expect(() => parseRosterXml("<html></html>")).toThrow(/not a BattleScribe/);
		expect(() =>
			parseRosterXml(
				HANDMADE_ROSTER.replace("40,000 11th Edition", "40,000 10th Edition"),
			),
		).toThrow(/Only Warhammer 40,000 11th Edition/);
		expect(() =>
			parseRosterXml(
				HANDMADE_ROSTER.replace(
					/<forces>[\s\S]*<\/forces>/,
					"<forces></forces>",
				),
			),
		).toThrow(/no units/);
	});

	it("loads an example over HTTP and reports a missing one", async () => {
		const bytes = readFileSync("public/Necron.rosz");
		vi.stubGlobal("fetch", async (url) =>
			url.endsWith("Necron.rosz")
				? {
						ok: true,
						blob: async () => file(bytes.buffer.slice(bytes.byteOffset)),
					}
				: { ok: false, status: 404 },
		);
		expect((await loadRosterUrl("/Necron.rosz")).forces.length).toBe(1);
		await expect(loadRosterUrl("/Missing.rosz")).rejects.toThrow(/404/);
	});
});
