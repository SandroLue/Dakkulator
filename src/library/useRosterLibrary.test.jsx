// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseJSON, stringifyJSON } from "../helpers/json";
import { SUPPORTED_GAME } from "./loadRoster";
import { isFirstVisit, useRosterLibrary } from "./rosterLibrary";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const roster = (name) => ({
	name,
	gameType: SUPPORTED_GAME,
	cost: { points: 1000 },
	forces: [{ catalog: "Xenos - Tyranids", units: [] }],
});

let root;
let library;
function Probe() {
	library = useRosterLibrary();
	return null;
}

beforeEach(async () => {
	localStorage.clear();
	root = createRoot(document.createElement("div"));
	await act(async () => root.render(<Probe />));
});
afterEach(async () => {
	await act(async () => root.unmount());
	vi.restoreAllMocks();
});

// Every mutation writes storage and notifies the hook, like a user action.
const run = (fn) => act(async () => fn());

describe("useRosterLibrary", () => {
	it("adds lists, newest first, and remembers the first visit", async () => {
		expect(isFirstVisit()).toBe(true);
		await run(() => library.add(roster("Bugs")));
		await run(() => library.add(roster("Gold"), "example:custodes"));
		expect(library.entries.map((e) => e.roster.name)).toEqual(["Gold", "Bugs"]);
		expect(isFirstVisit()).toBe(false);
		await run(() => library.entries.map((e) => library.remove(e.id)));
		// Deleting every list is not a first visit again.
		expect(isFirstVisit()).toBe(false);
	});

	it("puts an upload where an example or nothing was, attacker first", async () => {
		let example;
		await run(() => {
			example = library.add(roster("Example"), "example:x");
			library.assign("A", example.id);
		});
		let mine;
		let slot;
		await run(() => {
			mine = library.add(roster("Mine"));
			slot = library.assignUpload(mine.id);
		});
		// The example was only a placeholder for the attacker.
		expect(slot).toBe("A");
		expect(library.slots).toEqual({ A: mine.id, B: null });
		expect(library.rosters.A.name).toBe("Mine");

		let other;
		await run(() => {
			other = library.add(roster("Other"));
			slot = library.assignUpload(other.id);
		});
		expect(slot).toBe("B");
		expect(library.slots).toEqual({ A: mine.id, B: other.id });
	});

	it("swaps the lists and gives a role to a list holding the other one", async () => {
		let a;
		let b;
		await run(() => {
			a = library.add(roster("A"));
			b = library.add(roster("B"));
			library.assign("A", a.id);
			library.assign("B", b.id);
		});
		await run(() => library.swapSlots());
		expect(library.slots).toEqual({ A: b.id, B: a.id });
		await run(() => library.assignRole("A", a.id));
		expect(library.slots).toEqual({ A: a.id, B: b.id });
	});

	it("empties a slot whose list is deleted", async () => {
		let a;
		await run(() => {
			a = library.add(roster("A"));
			library.assign("A", a.id);
		});
		await run(() => library.remove(a.id));
		expect(library.entries).toEqual([]);
		expect(library.slots.A).toBeNull();
	});

	it("reports a full browser storage instead of losing the list silently", async () => {
		vi.spyOn(localStorage, "setItem").mockImplementation(() => {
			throw new Error("QuotaExceededError");
		});
		let entry;
		await run(() => {
			entry = library.add(roster("Too big"));
		});
		expect(entry).toBeNull();
		expect(library.entries).toEqual([]);
	});
});

describe("stored JSON", () => {
	it("keeps Maps and Sets, which rosters use for abilities and keywords", () => {
		const value = {
			keywords: new Set(["INFANTRY", "LEADER"]),
			abilities: new Map([["Abilities", new Map([["Leader", "text"]])]]),
			plain: [1, "two", { three: 3 }],
		};
		const back = parseJSON(stringifyJSON(value));
		expect(back.keywords).toEqual(value.keywords);
		expect(back.abilities.get("Abilities").get("Leader")).toBe("text");
		expect(back.plain).toEqual(value.plain);
	});
});
