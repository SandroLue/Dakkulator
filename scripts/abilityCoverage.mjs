// Measures src/combat/abilityRules.js against the local ability corpus.
//
//   node scripts/abilityCoverage.mjs [corpus.json] [report.md]
//
// Prints the share of abilities each rule outcome covers and writes a report
// with samples of every outcome, to check the rules for false matches.

import { readFileSync, writeFileSync } from "node:fs";
import {
	matchAbility,
	normalizeAbilityText,
} from "../src/combat/abilityRules.js";

const [
	corpusPath = "scripts/.corpus/abilities.json",
	reportPath = "scripts/.corpus/coverage.md",
] = process.argv.slice(2);
const corpus = JSON.parse(readFileSync(corpusPath, "utf8"));

// Read elsewhere (profiles.js mines these from the roster text).
const ELSEWHERE = /feel no pain|invulnerable save|\bstealth\b/;

const outcome = { applied: [], conditional: [], elsewhere: [], unmatched: [] };
const reasons = new Map();
for (const entry of corpus) {
	const results = matchAbility(entry.text);
	const item = { entry, results };
	if (results.some((r) => !r.conditional)) outcome.applied.push(item);
	else if (results.length) outcome.conditional.push(item);
	else if (ELSEWHERE.test(normalizeAbilityText(entry.text)))
		outcome.elsewhere.push(item);
	else outcome.unmatched.push(item);
	for (const r of results) {
		for (const reason of r.reasons)
			reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
	}
}

const pct = (n) => `${((n / corpus.length) * 100).toFixed(1)}%`;
console.log(`${corpus.length} combat-relevant abilities`);
for (const [name, items] of Object.entries(outcome)) {
	console.log(
		`  ${name.padEnd(12)} ${String(items.length).padStart(5)}  ${pct(items.length)}`,
	);
}
console.log(
	"most common conditions:",
	[...reasons.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, 12)
		.map(([r, n]) => `${r} ${n}`)
		.join(", "),
);

// Deterministic samples, spread over the corpus.
const sample = (items, n) =>
	items
		.filter((_, i) => i % Math.max(1, Math.floor(items.length / n)) === 0)
		.slice(0, n);
const describe = ({ entry, results }) =>
	[
		`- **${entry.name}** (${entry.catalogues[0]}): ${normalizeAbilityText(entry.text).slice(0, 300)}`,
		...results.map(
			(r) =>
				`  - ${r.conditional ? `conditional (${r.reasons.join(", ")})` : "applied"}: \`${JSON.stringify(r.modifier)}\``,
		),
	].join("\n");
const report = Object.entries(outcome)
	.map(
		([name, items]) =>
			`## ${name} (${items.length})\n\n${sample(items, 40).map(describe).join("\n")}`,
	)
	.join("\n\n");
writeFileSync(reportPath, `# Ability rule coverage\n\n${report}\n`);
console.log(`samples → ${reportPath}`);
