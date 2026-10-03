import { describe, expect, it } from "vitest";
import { defaultContext } from "./resolve";
import { loadUnitSetup, loadView, saveUnitSetup, saveView } from "./setupStore";

const memoryStorage = () => {
	const data = new Map();
	return {
		getItem: (key) => (data.has(key) ? data.get(key) : null),
		setItem: (key, value) => data.set(key, String(value)),
	};
};

const keys = new Set(["0:0", "0:1", "0:2"]);

describe("unit setup per list", () => {
	it("selects every unit of a list it has not seen", () => {
		const setup = loadUnitSetup("list-1", keys, memoryStorage());
		expect([...setup.selected]).toEqual(["0:0", "0:1", "0:2"]);
		expect(setup.attachments).toEqual({});
	});

	it("restores the selection and attachments of a list", () => {
		const storage = memoryStorage();
		saveUnitSetup(
			"list-1",
			{ selected: new Set(["0:1"]), attachments: { "0:2": "0:0" } },
			storage,
		);
		const setup = loadUnitSetup("list-1", keys, storage);
		expect([...setup.selected]).toEqual(["0:1"]);
		expect(setup.attachments).toEqual({ "0:2": "0:0" });
		// Another list is unaffected.
		expect(loadUnitSetup("list-2", keys, storage).selected.size).toBe(3);
	});

	it("drops units the list no longer has", () => {
		const storage = memoryStorage();
		saveUnitSetup(
			"list-1",
			{ selected: new Set(["0:1", "0:9"]), attachments: { "0:9": "0:0" } },
			storage,
		);
		const setup = loadUnitSetup("list-1", keys, storage);
		expect([...setup.selected]).toEqual(["0:1"]);
		expect(setup.attachments).toEqual({});
	});

	it("falls back to the defaults on unreadable data", () => {
		const storage = memoryStorage();
		storage.setItem("unitSetupByList", "{not json");
		expect(loadUnitSetup("list-1", keys, storage).selected.size).toBe(3);
	});
});

describe("view", () => {
	const metrics = { pDestroyed: {}, woundsLost: {} };
	const fallback = defaultContext({ phase: "combined" });

	it("uses the fallback on a first visit", () => {
		expect(loadView(fallback, "pDestroyed", metrics, memoryStorage())).toEqual({
			ctx: fallback,
			metric: "pDestroyed",
		});
	});

	it("restores the context and metric", () => {
		const storage = memoryStorage();
		const ctx = defaultContext({ phase: "fight", charged: true });
		saveView({ ctx, metric: "woundsLost" }, storage);
		const view = loadView(fallback, "pDestroyed", metrics, storage);
		expect(view.ctx.phase).toBe("fight");
		expect(view.ctx.charged).toBe(true);
		expect(view.metric).toBe("woundsLost");
	});

	it("ignores an unknown metric and invalid context values", () => {
		const storage = memoryStorage();
		saveView({ ctx: { phase: "dance", charged: "yes" }, metric: "x" }, storage);
		const view = loadView(fallback, "pDestroyed", metrics, storage);
		expect(view.metric).toBe("pDestroyed");
		expect(view.ctx.phase).toBe("shooting");
		expect(view.ctx.charged).toBe(false);
	});
});
