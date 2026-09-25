import { describe, expect, it } from "vitest";
import { oracle } from "./__fixtures__/oracle";
import { engineInputs, scenarioGenerator } from "./__fixtures__/scenarios";
import { resolveWeaponVsGroup } from "./resolve";

const FIELDS = [
	"attacks",
	"hits",
	"wounds",
	"critWounds",
	"mortalWounds",
	"failedSaves",
	"woundsLost",
	"modelsSlain",
	"pDestroyed",
];

function expectEngineMatchesOracle(sc) {
	const { profile, group, ctx } = engineInputs(sc);
	const engine = resolveWeaponVsGroup(profile, group, ctx);
	const expected = oracle(sc);
	for (const field of FIELDS) {
		expect(engine[field], `${field} for ${JSON.stringify(sc)}`).toBeCloseTo(
			expected[field],
			9,
		);
	}
}

describe("oracle self-checks (hand-computed)", () => {
	it("one BS3+ S4 attack vs T4 Sv3+", () => {
		const r = oracle({ attacks: "1", skill: 3, save: 3 });
		expect(r.hits).toBeCloseTo(4 / 6, 12);
		expect(r.wounds).toBeCloseTo(2 / 6, 12);
		expect(r.failedSaves).toBeCloseTo((2 / 6) * (2 / 6), 12);
		expect(r.pDestroyed).toBeCloseTo((2 / 6) * (2 / 6), 12);
	});

	it("loses excess damage: one D6 hit vs 2x W3", () => {
		const r = oracle({
			attacks: "1",
			torrent: true,
			strength: 8,
			damage: "D6",
			wounds: 3,
			count: 2,
		});
		// Auto-hit, wounds on 2+, no save: D6 >= 3 kills exactly one model.
		expect(r.modelsSlain).toBeCloseTo((5 / 6) * (4 / 6), 12);
		expect(r.woundsLost).toBeCloseTo((5 / 6) * ((1 + 2 + 3 * 4) / 6), 12);
	});

	it("rolls Feel No Pain per wound", () => {
		const r = oracle({
			attacks: "1",
			torrent: true,
			strength: 8,
			damage: "3",
			fnp: 5,
			wounds: 5,
		});
		expect(r.woundsLost).toBeCloseTo((5 / 6) * 3 * (2 / 3), 12);
	});

	it("counts sustained hits and lethal auto-wounds", () => {
		const r = oracle({ attacks: "6", skill: 3, sustained: "2", lethal: true });
		// 6 dice: 1 crit (3 hits, 1 auto-wound), 3 normal hits.
		expect(r.hits).toBeCloseTo(4 + 2, 12);
		expect(r.wounds).toBeCloseTo(1 + (3 + 2) * 0.5, 12);
	});

	it("matches a closed form for random attacks: 2x 2D6 vs 10x W1 Sv6+", () => {
		// N = 4D6 dice, each unsaved with p = 1/2 * 5/6; wiped when >= 10 succeed.
		const r = oracle({
			attacks: "2D6",
			models: 2,
			torrent: true,
			wounds: 1,
			count: 10,
			save: 6,
		});
		expect(r.pDestroyed).toBeCloseTo(0.0655, 3);
		// The old binomial approximation gave 0.024 here.
		const { profile, group, ctx } = engineInputs({
			attacks: "2D6",
			models: 2,
			torrent: true,
			wounds: 1,
			count: 10,
			save: 6,
		});
		expect(resolveWeaponVsGroup(profile, group, ctx).pDestroyed).toBeCloseTo(
			r.pDestroyed,
			9,
		);
	});
});

describe("engine matches the oracle — rule interactions", () => {
	const cases = {
		"[LETHAL HITS] auto-wounds never trigger [DEVASTATING WOUNDS]": {
			attacks: "6",
			skill: 3,
			lethal: true,
			devastating: true,
			damage: "2",
			wounds: 2,
			count: 3,
			save: 3,
		},
		"[SUSTAINED HITS 2] extra hits roll to wound, even with [LETHAL HITS]": {
			attacks: "4",
			models: 2,
			skill: 3,
			sustained: "2",
			lethal: true,
			damage: "2",
			wounds: 3,
			count: 3,
			save: 4,
		},
		"[TORRENT] makes no critical hits for [SUSTAINED HITS] / [LETHAL HITS]": {
			attacks: "D6",
			torrent: true,
			sustained: "2",
			lethal: true,
			wounds: 1,
			count: 6,
			save: 5,
		},
		"[ANTI-X] + [DEVASTATING WOUNDS] vs high toughness": {
			attacks: "3",
			models: 2,
			skill: 3,
			strength: 4,
			toughness: 10,
			anti: 4,
			devastating: true,
			damage: "D3",
			wounds: 5,
			count: 2,
			save: 2,
			invuln: 4,
		},
		"[ANTI-X 2+] still fails on an unmodified 1": {
			attacks: "6",
			torrent: true,
			strength: 1,
			toughness: 10,
			anti: 2,
			wounds: 1,
			count: 6,
		},
		"[TWIN-LINKED] beats re-roll 1s": {
			attacks: "6",
			skill: 3,
			twinLinked: true,
			rerollWounds: "ones",
			toughness: 5,
			wounds: 2,
			count: 3,
			save: 4,
		},
		"indirect: no hit re-rolls, cover, 1-5 fail": {
			attacks: "D6",
			models: 2,
			skill: 2,
			indirect: "blind",
			rerollHits: "all",
			strength: 6,
			wounds: 1,
			count: 6,
			save: 5,
		},
		"indirect, stationary + spotted: cover worsens BS4+ to 5+": {
			attacks: "3",
			models: 2,
			skill: 4,
			indirect: "spotted",
			wounds: 1,
			count: 5,
			save: 6,
		},
		"indirect with [IGNORES COVER]": {
			attacks: "3",
			models: 2,
			skill: 4,
			indirect: "spotted",
			ignoresCover: true,
			wounds: 1,
			count: 5,
		},
		"[PSYCHIC] drops cover and -1 to hit, keeps +1 BS": {
			attacks: "4",
			skill: 4,
			psychic: true,
			cover: true,
			hitModifier: -1,
			skillModifier: 1,
			wounds: 2,
			count: 2,
		},
		"hit roll modifiers cap at -1": {
			attacks: "6",
			skill: 3,
			hitModifier: -3,
			wounds: 1,
			count: 6,
		},
		"characteristic modifiers stack past -1 alongside a roll modifier": {
			attacks: "6",
			skill: 3,
			skillModifier: -2,
			hitModifier: -1,
			wounds: 1,
			count: 6,
		},
		"the better of Sv and InSv applies automatically": {
			attacks: "6",
			torrent: true,
			strength: 8,
			ap: 3,
			save: 2,
			invuln: 4,
			damage: "2",
			wounds: 3,
			count: 2,
		},
		"Feel No Pain applies to [DEVASTATING WOUNDS] mortal wounds": {
			attacks: "6",
			skill: 2,
			anti: 3,
			devastating: true,
			damage: "3",
			fnp: 5,
			wounds: 3,
			count: 2,
			save: 2,
		},
		"excess damage is lost per model": {
			attacks: "6",
			torrent: true,
			strength: 8,
			damage: "D6",
			wounds: 3,
			count: 4,
		},
		"[SUSTAINED HITS D3] is rolled per critical hit": {
			attacks: "6",
			skill: 4,
			sustained: "D3",
			wounds: 2,
			count: 4,
			save: 5,
		},
		"random attacks keep their variance (2x 2D6 torrent vs 10x W1)": {
			attacks: "2D6",
			models: 2,
			torrent: true,
			wounds: 1,
			count: 10,
			save: 6,
		},
		"[BLAST] adds dice per full five models": {
			attacks: "D3",
			models: 2,
			skill: 3,
			blast: 1,
			wounds: 1,
			count: 10,
			save: 5,
		},
		"re-rolling all failed hits also re-rolls into critical hits": {
			attacks: "4",
			skill: 4,
			rerollHits: "all",
			sustained: "1",
			wounds: 2,
			count: 3,
		},
		"a wound roll modifier cannot beat the 6+ floor of S <= T/2": {
			attacks: "6",
			torrent: true,
			strength: 2,
			toughness: 5,
			woundModifier: 1,
			wounds: 1,
			count: 6,
		},
		"a -1 wound roll modifier on S > T": {
			attacks: "6",
			torrent: true,
			strength: 5,
			toughness: 4,
			woundModifier: -1,
			rerollWounds: "ones",
			wounds: 1,
			count: 6,
		},
	};
	for (const [name, sc] of Object.entries(cases)) {
		it(name, () => expectEngineMatchesOracle(sc));
	}
});

describe("engine matches the oracle — random scenarios", () => {
	const next = scenarioGenerator(2026);
	for (let i = 0; i < 300; i++) {
		const sc = next();
		it(`scenario ${i}`, () => expectEngineMatchesOracle(sc));
	}
});
