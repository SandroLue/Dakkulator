import { describe, expect, it } from "vitest";
import { stringifyJSON } from "../helpers/json";
import { SUPPORTED_GAME } from "./loadRoster";
import {
	describeEntry,
	migrateLegacyStorage,
	parseLibrary,
} from "./rosterLibrary";

function memoryStorage(initial = {}) {
	const data = new Map(Object.entries(initial));
	return {
		getItem: (key) => (data.has(key) ? data.get(key) : null),
		setItem: (key, value) => data.set(key, String(value)),
		removeItem: (key) => data.delete(key),
		data,
	};
}

const roster = (name, points = 1000, catalog = "Xenos - Tyranids") => ({
	name,
	gameType: SUPPORTED_GAME,
	cost: { points },
	forces: [{ catalog, units: [{ name: "a" }, { name: "b" }] }],
});

describe("migrateLegacyStorage", () => {
	it("moves the old history and slots into the library", () => {
		const storage = memoryStorage({
			rosters: stringifyJSON([
				roster("Bugs"),
				{ ...roster("Old"), gameType: "Warhammer 40,000 10th Edition" },
			]),
			rosterA: stringifyJSON(roster("Bugs")),
			rosterB: stringifyJSON(
				roster("Gold", 2000, "Imperium - Adeptus Custodes"),
			),
		});
		migrateLegacyStorage(storage);

		const entries = parseLibrary(storage.getItem("library"));
		expect(entries.map((e) => e.roster.name)).toEqual(["Bugs", "Gold"]);
		expect(storage.getItem("slotA")).toBe(entries[0].id);
		expect(storage.getItem("slotB")).toBe(entries[1].id);
		for (const key of ["rosters", "rosterA", "rosterB"]) {
			expect(storage.getItem(key)).toBe(null);
		}
	});

	it("does nothing once a library exists", () => {
		const storage = memoryStorage({
			library: "[]",
			rosters: stringifyJSON([roster("Bugs")]),
		});
		migrateLegacyStorage(storage);
		expect(storage.getItem("library")).toBe("[]");
		expect(storage.getItem("rosters")).not.toBe(null);
	});

	it("keeps the old keys when the new library cannot be written", () => {
		const storage = memoryStorage({ rosters: stringifyJSON([roster("Bugs")]) });
		storage.setItem = () => {
			throw new Error("QuotaExceededError");
		};
		migrateLegacyStorage(storage);
		expect(storage.getItem("rosters")).not.toBe(null);
	});
});

describe("parseLibrary", () => {
	it("drops corrupt data and entries of other editions", () => {
		expect(parseLibrary("{not json")).toEqual([]);
		expect(parseLibrary('{"a":1}')).toEqual([]);
		const raw = stringifyJSON([
			{ id: "1", roster: roster("Bugs") },
			{ id: "2", roster: { ...roster("Old"), gameType: "other" } },
			{ roster: roster("No id") },
		]);
		expect(parseLibrary(raw).map((e) => e.id)).toEqual(["1"]);
	});
});

describe("describeEntry", () => {
	it("summarises a list for the table", () => {
		expect(
			describeEntry({ id: "1", roster: roster("Bugs", 1995) }),
		).toMatchObject({
			name: "Bugs",
			faction: "Xenos - Tyranids",
			points: 1995,
			unitCount: 2,
		});
	});
});
