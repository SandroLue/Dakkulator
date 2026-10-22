import { describe, expect, it } from "vitest";
import { parseWeaponAbilities } from "../weaponKeywords";
import { groupIdentical } from "./MatchupDetail";

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
