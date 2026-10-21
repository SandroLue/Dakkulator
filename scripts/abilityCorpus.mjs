// Builds a local corpus of combat-relevant ability texts from a BSData 11e clone,
// for writing and measuring the rules in src/combat/abilityRules.js.
//
//   node scripts/abilityCorpus.mjs <path to BSData/wh40k-11e clone> [output.json]
//
// The corpus is Games Workshop rules text: it stays on this machine (the default
// output folder is gitignored) and is never shipped.

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { isCombatAbility } from "../src/combat/abilityRules.js";

const [source, output = "scripts/.corpus/abilities.json"] =
	process.argv.slice(2);
if (!source) {
	console.error(
		"usage: node scripts/abilityCorpus.mjs <bsdata clone> [output.json]",
	);
	process.exit(1);
}

const byText = new Map();

function add(entry) {
	const key = `${entry.name}\n${entry.text}`;
	const existing = byText.get(key);
	if (existing) {
		if (!existing.catalogues.includes(entry.catalogue)) {
			existing.catalogues.push(entry.catalogue);
		}
		return;
	}
	byText.set(key, {
		id: entry.id,
		name: entry.name,
		kind: entry.kind,
		catalogues: [entry.catalogue],
		text: entry.text,
	});
}

function walk(node, catalogue, inRules) {
	if (!node || typeof node !== "object") return;
	if (Array.isArray(node)) {
		for (const item of node) walk(item, catalogue, inRules);
		return;
	}
	if (node.typeName === "Abilities" && Array.isArray(node.characteristics)) {
		const text = node.characteristics
			.map((c) => c.$text ?? "")
			.join("\n")
			.trim();
		if (text)
			add({ id: node.id, name: node.name, kind: "ability", catalogue, text });
	}
	if (inRules && typeof node.description === "string" && node.name) {
		add({
			id: node.id,
			name: node.name,
			kind: "rule",
			catalogue,
			text: node.description.trim(),
		});
	}
	for (const [key, value] of Object.entries(node)) {
		walk(value, catalogue, key === "rules" || key === "sharedRules");
	}
}

for (const file of readdirSync(source).filter((f) => f.endsWith(".json"))) {
	const data = JSON.parse(readFileSync(join(source, file), "utf8"));
	const root = data.catalogue ?? data.gameSystem ?? data;
	walk(root, root.name ?? file, false);
}

const all = [...byText.values()];
const combat = all.filter((entry) => isCombatAbility(entry.text));
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(combat, null, "\t")}\n`);
console.log(
	`${all.length} unique abilities and rules, ${combat.length} combat-relevant → ${output}`,
);
