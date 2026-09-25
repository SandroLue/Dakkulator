import { describe, expect, it } from "vitest";
import { boltgunSquad, marineTarget } from "./__fixtures__/units";
import {
	EMPTY_SIMULATION,
	pairingStreamGroups,
	resolveUnitVsUnit,
	simulatePairing,
} from "./index";
import { runSimulation } from "./simulateClient";

describe("runSimulation", () => {
	it("posts only what the sampler needs", () => {
		const pairing = resolveUnitVsUnit(boltgunSquad, marineTarget);
		const [first] = pairingStreamGroups(pairing);
		expect(Object.keys(first.group).sort()).toEqual(["count", "fnp", "wounds"]);
		expect(Object.keys(first.streams[0]).sort()).toEqual([
			"damageExpr",
			"sampling",
		]);
		expect(() => structuredClone(first)).not.toThrow();
	});

	it("falls back to running inline without Worker support", async () => {
		const pairing = resolveUnitVsUnit(boltgunSquad, marineTarget);
		const options = { trials: 2000, seed: 3 };
		await expect(runSimulation(pairing, options)).resolves.toEqual(
			simulatePairing(pairing, options),
		);
	});

	it("resolves an empty result for a pairing without weapons", async () => {
		const pairing = resolveUnitVsUnit(marineTarget, boltgunSquad);
		await expect(runSimulation(pairing)).resolves.toBe(EMPTY_SIMULATION);
	});
});
