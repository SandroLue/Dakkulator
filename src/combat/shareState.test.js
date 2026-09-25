import { describe, expect, it } from "vitest";
import { createModifier } from "./modifiers";
import { defaultContext } from "./resolve";
import {
	decodeShareState,
	encodeShareState,
	hasShareHash,
	mergeSharedModifiers,
} from "./shareState";

const state = {
	rosterNames: { A: "Custodes – Shield Host", B: "Tyranids" },
	selected: { A: new Set(["0:1", "0:3"]), B: new Set(["0:0"]) },
	attachments: { A: { "0:2": "0:1" }, B: {} },
	ctx: defaultContext({ phase: "fight", charged: true, hitModifier: 1 }),
	reversed: true,
	modifiers: [
		createModifier({ name: "Stand Vigil", rerollWounds: "ones" }),
		createModifier({ name: "Off", enabled: false, list: "B", fnp: 5 }),
	],
};

describe("share state", () => {
	it("round-trips through the URL hash", () => {
		const hash = encodeShareState(state);
		expect(hasShareHash(hash)).toBe(true);
		expect(hash).toMatch(/^#share=[A-Za-z0-9_-]+$/);

		const decoded = decodeShareState(hash);
		expect(decoded.rosterNames).toEqual(state.rosterNames);
		expect(decoded.selected).toEqual({ A: ["0:1", "0:3"], B: ["0:0"] });
		expect(decoded.attachments.A).toEqual({ "0:2": "0:1" });
		expect(decoded.ctx).toEqual(state.ctx);
		expect(decoded.reversed).toBe(true);
		expect(decoded.modifiers.map((m) => m.name)).toEqual([
			"Stand Vigil",
			"Off",
		]);
		expect(decoded.modifiers[1]).toMatchObject({
			enabled: false,
			list: "B",
			fnp: 5,
		});
		// Shared modifiers get fresh ids.
		expect(decoded.modifiers[0].id).not.toBe(state.modifiers[0].id);
	});

	it("rejects garbage and drops invalid fields", () => {
		expect(decodeShareState("")).toBe(null);
		expect(decodeShareState("#other")).toBe(null);
		expect(decodeShareState("#share=%%%")).toBe(null);

		const hostile = `#share=${btoa(
			JSON.stringify({
				v: 1,
				selected: { A: ["0:1", "<script>", 5] },
				attachments: { A: { "0:2": "nope", "0:3": "0:1" } },
				ctx: {
					phase: "psychic",
					hitModifier: 99,
					unknown: true,
					charged: "yes",
				},
				modifiers: [null, { name: "ok", role: "sideways" }],
			}),
		)}`;
		const decoded = decodeShareState(hostile);
		expect(decoded.selected.A).toEqual(["0:1"]);
		expect(decoded.attachments.A).toEqual({ "0:3": "0:1" });
		expect(decoded.ctx.phase).toBe("shooting");
		expect(decoded.ctx.hitModifier).toBe(6);
		expect(decoded.ctx.charged).toBe(false);
		expect(decoded.ctx).not.toHaveProperty("unknown");
		expect(decoded.modifiers).toHaveLength(1);
		expect(decoded.modifiers[0].role).toBe("attacking");
	});
});

describe("mergeSharedModifiers", () => {
	it("keeps the user's modifiers, adds new ones and switches the rest off", () => {
		const mine = [
			createModifier({ name: "Stand Vigil", rerollWounds: "ones" }),
			createModifier({ name: "Mine", hitModifier: 1 }),
		];
		const shared = [
			createModifier({ name: "Stand Vigil", rerollWounds: "ones" }),
			createModifier({ name: "Theirs", woundModifier: 1 }),
		];
		const result = mergeSharedModifiers(mine, shared);
		expect(result.modifiers.map((m) => [m.name, m.enabled])).toEqual([
			["Stand Vigil", true],
			["Mine", false],
			["Theirs", true],
		]);
		expect(result.modifiers[0].id).toBe(mine[0].id);
		expect(result.added).toBe(1);
		expect(result.disabled).toBe(1);
	});
});
