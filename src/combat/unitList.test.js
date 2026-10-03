import { describe, expect, it } from "vitest";
import { boltgunSquad, captain } from "./__fixtures__/units";
import { applyAttachments, listUnits, suggestAttachments } from "./unitList";

const roster = (...units) => ({
	forces: [{ catalog: "Test", units: units.map((u) => structuredClone(u)) }],
});

// Three identical Intercessor squads and two identical Captains.
const army = roster(boltgunSquad, boltgunSquad, boltgunSquad, captain, captain);

describe("listUnits", () => {
	it("lists every identical copy, so each can take a leader", () => {
		expect(listUnits(army).map((e) => e.label)).toEqual([
			"Intercessor Squad #1",
			"Intercessor Squad #2",
			"Intercessor Squad #3",
			"Captain #1",
			"Captain #2",
		]);
	});
});

describe("applyAttachments", () => {
	const entries = listUnits(army);
	const summary = (list) => list.map((e) => [e.label, e.copies]);

	it("shows identical units once", () => {
		expect(summary(applyAttachments(entries))).toEqual([
			["Intercessor Squad", 3],
			["Captain", 2],
		]);
	});

	it("splits off a squad once a leader joins it", () => {
		expect(summary(applyAttachments(entries, { "0:3": "0:1" }))).toEqual([
			["Intercessor Squad", 2],
			["Intercessor Squad + Captain", 1],
			["Captain", 1],
		]);
	});

	it("groups squads again when they are led alike", () => {
		const grouped = applyAttachments(entries, { "0:3": "0:0", "0:4": "0:2" });
		expect(summary(grouped)).toEqual([
			["Intercessor Squad + Captain", 2],
			["Intercessor Squad", 1],
		]);
		// The first copy stands for the group in the selection.
		expect(grouped[0].key).toBe("0:0");
	});
});

describe("suggestAttachments", () => {
	it("attaches each leader with a single choice to its own free copy", () => {
		// Both Captains can only lead Intercessor Squads.
		expect(suggestAttachments(listUnits(army))).toEqual({
			"0:3": "0:0",
			"0:4": "0:1",
		});
	});

	it("keeps existing attachments and skips taken squads", () => {
		expect(suggestAttachments(listUnits(army), { "0:3": "0:0" })).toEqual({
			"0:4": "0:1",
		});
	});

	it("suggests nothing without a unit the leader can join", () => {
		expect(suggestAttachments(listUnits(roster(captain)))).toEqual({});
	});
});
