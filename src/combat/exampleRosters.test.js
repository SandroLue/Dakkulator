// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { parseRosterXml } from "../library/loadRoster";
import { abilityModifiers } from "./abilityModifiers";
import { calculateMatchup } from "./index";
import { describeModifier } from "./modifiers";
import { bestCaseContext } from "./ui/ContextControls";
import { applyAttachments, listUnits, suggestAttachments } from "./unitList";

// The example lists shipped in public/: what a user gets when adding them.
// After an intended change, review the diff and update with `npx vitest -u`.
const EXAMPLES = [
	"Custodes",
	"Necron",
	"Space Marine",
	"Tyranids",
	"Dark Angels",
];

const rosters = new Map();
async function load(file) {
	if (!rosters.has(file)) {
		const zip = await JSZip.loadAsync(readFileSync(`public/${file}.rosz`));
		rosters.set(
			file,
			parseRosterXml(await zip.file(/\.ros$/)[0].async("string")),
		);
	}
	return rosters.get(file);
}

function describeAll(modifiers) {
	return modifiers.map((m) => {
		const scope = m.unitName || m.unitKeywords || "every unit";
		const state = m.enabled ? "" : " (off)";
		return `${m.name} @ ${scope}: ${describeModifier(m)}${state}`;
	});
}

/** The units as the calculator first shows them: obvious leaders attached. */
function units(roster) {
	const entries = listUnits(roster);
	return applyAttachments(entries, suggestAttachments(entries, {})).map(
		(entry) => entry.unit,
	);
}

describe("modifiers generated for the example rosters", () => {
	for (const file of EXAMPLES) {
		it(file, async () => {
			expect(
				describeAll(abilityModifiers(await load(file), "A")),
			).toMatchSnapshot();
		});
	}
});

// What a user sees first: every cell of the matrix, with the generated
// modifiers and the default battlefield. Catches changes anywhere from the
// roster parser and leader attachment to the modifiers and the engine.
describe("matrix for the example rosters", () => {
	const pairs = [
		["Custodes", "Tyranids"],
		["Space Marine", "Necron"],
		["Dark Angels", "Custodes"],
	];
	for (const [a, b] of pairs) {
		it(`${a} → ${b}`, async () => {
			const rosterA = await load(a);
			const rosterB = await load(b);
			const matchup = calculateMatchup(
				units(rosterA),
				units(rosterB),
				bestCaseContext(),
				{
					modifiers: [
						...abilityModifiers(rosterA, "A"),
						...abilityModifiers(rosterB, "B"),
					],
					attackerList: "A",
					defenderList: "B",
				},
			);
			// Efficiency % · clear in one round % · wounds dealt
			const cells = Object.fromEntries(
				matchup.rows.map((row) => [
					row.attacker.name,
					Object.fromEntries(
						row.cells.map((cell) => [
							cell.defenderName,
							[
								cell.totals.pointsReturnPer100.toFixed(1),
								(cell.totals.pDestroyed * 100).toFixed(1),
								cell.totals.woundsLost.toFixed(2),
							].join(" · "),
						]),
					),
				]),
			);
			expect(cells).toMatchSnapshot();
		});
	}
});
