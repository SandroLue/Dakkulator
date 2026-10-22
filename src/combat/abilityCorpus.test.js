import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { matchAbility } from "./abilityRules";

/**
 * How the ability rules read every ability of the local BSData corpus
 * (scripts/abilityCorpus.mjs), one line per ability: its id and name, then
 * each modifier it becomes. Any rule change shows here as the abilities it
 * reads differently; accept an intended one with `npx vitest -u`.
 *
 * The baseline holds names and modifier fields only, no rules text. Without
 * the corpus (it is not committed, e.g. in CI) the test is skipped.
 */
const CORPUS = "scripts/.corpus/abilities.json";

const DEFAULTS = {
	role: undefined,
	phase: "any",
	vsKeywords: "",
	unitKeywords: "",
	excludeUnitKeywords: "",
};

/** "attacking fight list ? woundModifier=1 rerollHits=ones" */
function describeResult(result) {
	const { modifier } = result;
	const fields = Object.entries(modifier)
		.filter(
			([key, value]) =>
				key !== "role" && key !== "phase" && value !== DEFAULTS[key],
		)
		.map(([key, value]) => `${key}=${value}`)
		.sort();
	return [
		modifier.role,
		modifier.phase,
		result.scope === "list" ? "list" : "",
		result.conditional ? "?" : "",
		...fields,
	]
		.filter(Boolean)
		.join(" ");
}

describe.skipIf(!existsSync(CORPUS))("ability rules against the corpus", () => {
	it("read every ability as before", async () => {
		const corpus = JSON.parse(readFileSync(CORPUS, "utf8"));
		const lines = [...corpus]
			.sort((a, b) => a.id.localeCompare(b.id))
			.map((entry) => {
				const results = matchAbility(entry.text).map(describeResult);
				return `${entry.id} ${entry.name}: ${results.join(" | ") || "–"}`;
			});
		await expect(`${lines.join("\n")}\n`).toMatchFileSnapshot(
			"./__snapshots__/abilityCorpus.txt",
		);
	});
});
