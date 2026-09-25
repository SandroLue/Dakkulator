import { describe, expect, it } from "vitest";
import { boltgunSquad, captain, marineTarget } from "./__fixtures__/units";
import { attachLeaders, canLead, getLeaderTargets, isLeader } from "./attach";
import { buildAttackerProfiles, buildDefenderProfiles } from "./profiles";

describe("getLeaderTargets", () => {
	it("reads the eligible units out of the Leader ability", () => {
		expect(getLeaderTargets(captain)).toEqual([
			"intercessor squad",
			"assault intercessor squad",
		]);
	});

	it("returns nothing for a unit without the ability", () => {
		expect(getLeaderTargets(boltgunSquad)).toEqual([]);
		expect(isLeader(boltgunSquad)).toBe(false);
	});
});

describe("canLead", () => {
	it("accepts a listed bodyguard", () => {
		expect(canLead(captain, boltgunSquad)).toBe(true);
	});

	it("rejects an unlisted unit and itself", () => {
		expect(canLead(captain, marineTarget)).toBe(false);
		expect(canLead(captain, captain)).toBe(false);
	});
});

describe("attachLeaders", () => {
	const attached = attachLeaders(boltgunSquad, [captain]);

	it("pools the models, weapons, keywords and points", () => {
		expect(attached.name).toBe("Intercessor Squad + Captain");
		expect(attached.cost.points).toBe(
			boltgunSquad.cost.points + captain.cost.points,
		);
		expect(attached.keywords.has("CHARACTER")).toBe(true);
		const weapons = buildAttackerProfiles(attached).map((p) => p.weaponName);
		expect(weapons).toEqual(["Boltgun", "Plasma pistol"]);
	});

	it("resolves the leader's allocation group last", () => {
		const groups = buildDefenderProfiles(attached);
		expect(groups.map((g) => g.name)).toEqual(["Intercessor", "Captain"]);
		expect(groups[1].isLeaderModel).toBe(true);
		expect(groups[1].isCharacter).toBe(true);
	});

	it("keeps Feel No Pain on the models that actually have it", () => {
		const groups = buildDefenderProfiles(attached);
		expect(groups[0].fnp).toBe(null);
		expect(groups[1].fnp).toBe(5);
	});

	it("leaves the unit alone when nothing is attached", () => {
		expect(attachLeaders(boltgunSquad, [])).toBe(boltgunSquad);
	});
});
