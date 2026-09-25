import { describe, expect, it } from "vitest";
import { addFlat, formatDiceExpr, mean, parseDiceExpr, pmf } from "./diceExpr";

describe("parseDiceExpr", () => {
	it("parses flat values", () => {
		expect(parseDiceExpr("3")).toEqual({ dice: 0, sides: 0, flat: 3 });
	});

	it("parses bare dice", () => {
		expect(parseDiceExpr("D6")).toEqual({ dice: 1, sides: 6, flat: 0 });
		expect(parseDiceExpr("d3")).toEqual({ dice: 1, sides: 3, flat: 0 });
	});

	it("parses multiple dice and flat bonuses", () => {
		expect(parseDiceExpr("2D6")).toEqual({ dice: 2, sides: 6, flat: 0 });
		expect(parseDiceExpr("D6+2")).toEqual({ dice: 1, sides: 6, flat: 2 });
		expect(parseDiceExpr("D3+3")).toEqual({ dice: 1, sides: 3, flat: 3 });
		expect(parseDiceExpr("D6 - 1")).toEqual({ dice: 1, sides: 6, flat: -1 });
	});

	it("treats empty characteristics as zero", () => {
		expect(parseDiceExpr("-")).toEqual({ dice: 0, sides: 0, flat: 0 });
		expect(parseDiceExpr("")).toEqual({ dice: 0, sides: 0, flat: 0 });
		expect(parseDiceExpr(undefined)).toEqual({ dice: 0, sides: 0, flat: 0 });
	});

	it("returns null for unparseable input", () => {
		expect(parseDiceExpr("see datasheet")).toBeNull();
	});
});

describe("mean", () => {
	it("matches E[nDs + m]", () => {
		expect(mean("D6")).toBe(3.5);
		expect(mean("2D6+1")).toBe(8);
		expect(mean("D3")).toBe(2);
		expect(mean("4")).toBe(4);
	});
});

describe("pmf", () => {
	it("sums to 1", () => {
		for (const expr of ["1", "D3", "D6+2", "2D6", "D3+3"]) {
			const total = pmf(expr).reduce((a, b) => a + b, 0);
			expect(total).toBeCloseTo(1, 10);
		}
	});

	it("places flat values at their index", () => {
		expect(pmf("3")).toEqual([0, 0, 0, 1]);
	});

	it("is uniform for a single die", () => {
		const dist = pmf("D6");
		expect(dist).toHaveLength(7);
		for (let v = 1; v <= 6; v++) expect(dist[v]).toBeCloseTo(1 / 6, 10);
	});

	it("folds values below the minimum", () => {
		const dist = pmf("D6-2", 1);
		expect(dist[1]).toBeCloseTo(3 / 6, 10);
		expect(dist[4]).toBeCloseTo(1 / 6, 10);
	});

	it("agrees with mean", () => {
		const dist = pmf("2D6");
		const expected = dist.reduce((sum, p, v) => sum + p * v, 0);
		expect(expected).toBeCloseTo(7, 10);
	});
});

describe("addFlat", () => {
	it("adds melta to the characteristic, not as a modifier", () => {
		expect(formatDiceExpr(addFlat("D6+1", 2))).toBe("D6+3");
	});
});
