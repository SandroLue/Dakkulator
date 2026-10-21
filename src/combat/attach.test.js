import { describe, expect, it } from "vitest";
import { boltgunSquad, captain, marineTarget } from "./__fixtures__/units";
import { attachLeaders, canLead, getLeaderTargets, isLeader } from "./attach";
import { buildAttackerProfiles, buildDefenderProfiles } from "./profiles";

const withLeaderText = (name, text) => ({
	name,
	abilities: { Abilities: new Map([["Leader", text]]) },
});

describe("getLeaderTargets", () => {
	it("reads the eligible units out of the Leader ability", () => {
		expect(getLeaderTargets(captain)).toEqual([
			"intercessor",
			"assault intercessor",
		]);
	});

	it("keeps names that contain 'and' whole", () => {
		const leader = withLeaderText(
			"Trajann",
			"This model can be attached to the following units: CUSTODIAN GUARD, CUSTODIAN GUARD WITH ADRASITE AND PYRITHITE SPEARS, CUSTODIAN WARDENS",
		);
		expect(getLeaderTargets(leader)).toEqual([
			"custodian guard",
			"custodian guard with adrasite and pyrithite spear",
			"custodian warden",
		]);
	});

	it("reads 11e Support lists with dashes", () => {
		const support = withLeaderText(
			"Knight-Centura",
			"This model can be attached to the following units: - Prosecutors - Vigilators - Witchseekers",
		);
		expect(getLeaderTargets(support)).toEqual([
			"prosecutor",
			"vigilator",
			"witchseeker",
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

	it("matches datasheets renamed in 11e", () => {
		const support = withLeaderText(
			"Knight-Centura",
			"This model can be attached to the following units: - Prosecutors - Vigilators",
		);
		expect(canLead(support, { name: "Prosecutor Squad" })).toBe(true);
		expect(canLead(support, { name: "Vigilator Squad" })).toBe(true);
		expect(canLead(support, { name: "Witchseeker Squad" })).toBe(false);
		const leader = withLeaderText(
			"Shield-Captain",
			"This model can be attached to the following units: CUSTODIAN GUARD, CUSTODIAN WARDENS",
		);
		expect(canLead(leader, { name: "Custodian Guard Sodality" })).toBe(true);
		expect(canLead(leader, { name: "Custodian Wardens" })).toBe(true);
		expect(canLead(leader, { name: "Allarus Custodians" })).toBe(false);
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

describe("weapon sources in an attached unit", () => {
	it("names the unit each weapon belongs to", () => {
		const unit = attachLeaders(boltgunSquad, [captain]);
		const sources = Object.fromEntries(
			buildAttackerProfiles(unit, "shooting").map((p) => [
				p.weaponName,
				p.sourceUnitName,
			]),
		);
		expect(sources).toMatchObject({
			Boltgun: "Intercessor Squad",
			"Plasma pistol": "Captain",
		});
	});
});
