import { describe, expect, it } from "vitest";
import { parseWeaponAbilities } from "../weaponKeywords";
import { groupIdentical, woundsChartData } from "./MatchupDetail";

const row = (overrides = {}) => ({
	weaponName: "Fleshmower",
	selectionName: "Fleshmower",
	sourceUnitName: "Warriors",
	isMelee: true,
	groupIndex: 0,
	abilities: parseWeaponAbilities("Lethal Hits"),
	detail: { hitTarget: 3, woundTarget: 4, saveTarget: 4, damage: { flat: 1 } },
	attacks: 3,
	declaredAttacks: 3,
	hits: 2,
	wounds: 1,
	mortalWounds: 0,
	failedSaves: 0.5,
	rawDamage: 0.5,
	woundsLost: 0.5,
	...overrides,
});

describe("groupIdentical", () => {
	it("adds up rows of the same profile against the same models", () => {
		const [merged, ...rest] = groupIdentical([
			row(),
			row({ attacks: 6, woundsLost: 1 }),
		]);
		expect(rest).toEqual([]);
		expect(merged.attacks).toBe(9);
		expect(merged.woundsLost).toBe(1.5);
		expect(merged.hits).toBe(4);
	});

	it("keeps a value no row has missing, so alternatives show their attacks", () => {
		// Alternatives are resolved alone and have no declaredAttacks.
		const alternative = () => row({ declaredAttacks: undefined, attacks: 2 });
		const [merged] = groupIdentical([alternative(), alternative()]);
		expect(merged.declaredAttacks).toBeUndefined();
		expect(merged.attacks).toBe(4);
	});

	it("keeps other targets, units, phases and stats apart", () => {
		expect(
			groupIdentical([
				row(),
				row({ groupIndex: 1 }),
				row({ sourceUnitName: "Leader" }),
				row({ isMelee: false }),
				row({
					detail: {
						hitTarget: 2,
						woundTarget: 4,
						saveTarget: 4,
						damage: { flat: 1 },
					},
				}),
				row({ abilities: parseWeaponAbilities("Lethal Hits, Lance") }),
			]),
		).toHaveLength(6);
	});
});

describe("woundsChartData", () => {
	it("has a bar for every total and marks what is past the unit's wounds", () => {
		const data = woundsChartData(
			{
				potentialHistogram: [
					{ value: 2, probability: 0.25 },
					{ value: 6, probability: 0.5 },
					{ value: 9, probability: 0.25 },
				],
			},
			6,
		);
		expect(data.map((d) => d.value)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
		expect(data[2].probability).toBe(0.25);
		expect(data[3].probability).toBe(0);
		expect(data[6].overkill).toBe(0);
		expect(data[9].overkill).toBe(3);
	});
});
