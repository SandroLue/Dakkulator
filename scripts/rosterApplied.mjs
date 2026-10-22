// Lists the abilities whose characteristic changes BSData already applies to
// the profiles, so a roster (New Recruit, BattleScribe) shows the changed
// values: "Memento Moritoi" gives the bearer's melee weapons +1 A, S and D in
// the data itself. The modifiers generated from that ability text must leave
// those parts out, or they count twice.
//
//   node scripts/rosterApplied.mjs <path to BSData/wh40k-11e clone> [output.json]
//
// Only ability names and the modifier fields they touch are written, no rules text.

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [clone, output = "src/combat/rosterApplied.json"] = process.argv.slice(2);
if (!clone) {
	console.error(
		"usage: node scripts/rosterApplied.mjs <bsdata clone> [output.json]",
	);
	process.exit(1);
}

// BSData characteristic type ids (as rosters print them) → modifier fields.
const FIELDS = {
	"2337-daa1-6682-b110": "attacksModifier", // Melee A
	"3bb-c35f-f54-fb08": "attacksModifier", // Ranged A
	"ab33-d393-96ce-ccba": "strengthModifier", // Melee S
	"2229-f494-25db-c5d3": "strengthModifier", // Ranged S
	"41a0-1301-112a-e2f2": "apModifier", // Melee AP
	"9ead-8a10-520-de15": "apModifier", // Ranged AP
	"3254-9fe6-d824-513e": "damageModifier", // Melee D
	"a354-c1c8-a745-f9e3": "damageModifier", // Ranged D
	"95d1-95f-45b4-11d6": "skillModifier", // WS
	"94d-8a98-cf90-183e": "skillModifier", // BS
	"d29d-cf75-fc2d-34a4": "toughnessChange", // T
	"450-a17e-9d5e-29da": "saveChange", // Sv
	"750a-a2ec-90d3-21fe": "woundsChange", // W
};

const applied = new Map();
function walk(node) {
	if (!node || typeof node !== "object") return;
	if (Array.isArray(node)) {
		for (const item of node) walk(item);
		return;
	}
	// An upgrade (enhancement, wargear, unit option) that carries its own
	// ability and changes the profiles it comes with.
	if (node.type === "upgrade") {
		const modifiers = [
			...(node.modifiers ?? []),
			...(node.modifierGroups ?? []).flatMap((group) => group.modifiers ?? []),
		];
		const fields = modifiers
			.filter((m) => /profiles/.test(m.affects ?? "") && FIELDS[m.field])
			.map((m) => FIELDS[m.field]);
		const abilities = (node.profiles ?? [])
			.filter((profile) => profile.typeName === "Abilities")
			.map((profile) => profile.name.trim().toLowerCase());
		for (const ability of fields.length ? abilities : []) {
			if (!applied.has(ability)) applied.set(ability, new Set());
			for (const field of fields) applied.get(ability).add(field);
		}
	}
	for (const value of Object.values(node)) walk(value);
}

for (const file of readdirSync(clone).filter((f) => /\.json$/.test(f))) {
	walk(JSON.parse(readFileSync(join(clone, file), "utf8")));
}

const sorted = Object.fromEntries(
	[...applied]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([ability, fields]) => [ability, [...fields].sort()]),
);
writeFileSync(output, `${JSON.stringify(sorted, null, "\t")}\n`);
console.log(`${applied.size} abilities → ${output}`);
