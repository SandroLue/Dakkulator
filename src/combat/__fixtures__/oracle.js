/**
 * Brute-force reference implementation of the 11th-edition attack sequence.
 *
 * Deliberately shares no code with the engine: every die face is enumerated and
 * every rule is applied literally, one attack at a time, over an exact
 * distribution of target states. Slow, but obviously correct — tests compare
 * the engine against it on small scenarios.
 *
 * Scenario fields (all optional except where noted):
 *   attacks "D6" · models (weapon count) · skill 3 · skillModifier · hitModifier
 *   rerollHits "none"|"ones"|"all" · torrent · indirect "none"|"blind"|"spotted"
 *   psychic · ignoresCover · cover · sustained "0"|"2"|"D3" · lethal · blast (X per 5)
 *   strength · toughness · woundModifier · anti (threshold vs the target) · twinLinked
 *   rerollWounds · devastating · save 3 (7 = none) · invuln (null = none) · ap (magnitude)
 *   damage "D3" · fnp (null = none) · wounds · count
 */

const FACES = [1, 2, 3, 4, 5, 6];

function clamp(value, min, max) {
	return Math.min(max, Math.max(min, value));
}

/** Every outcome of a dice expression like "2D6+1", with its probability. */
export function rollOutcomes(text, min = 0) {
	const match = String(text)
		.toUpperCase()
		.match(/^(\d*)D(\d+)([+-]\d+)?$/);
	if (!match) return [{ value: Math.max(min, Number(text)), p: 1 }];
	const dice = match[1] === "" ? 1 : Number(match[1]);
	const sides = Number(match[2]);
	const flat = Number(match[3] || 0);
	let sums = new Map([[0, 1]]);
	for (let d = 0; d < dice; d++) {
		const next = new Map();
		for (const [sum, p] of sums) {
			for (let face = 1; face <= sides; face++) {
				next.set(sum + face, (next.get(sum + face) || 0) + p / sides);
			}
		}
		sums = next;
	}
	const out = new Map();
	for (const [sum, p] of sums) {
		const value = Math.max(min, sum + flat);
		out.set(value, (out.get(value) || 0) + p);
	}
	return [...out].map(([value, p]) => ({ value, p }));
}

/** Rolls one D6 with an optional re-roll, returning `{ result, p }` per result. */
function withReroll(judge, mode) {
	const totals = new Map();
	const add = (result, p) => totals.set(result, (totals.get(result) || 0) + p);
	for (const face of FACES) {
		const first = judge(face);
		const reroll =
			(mode === "ones" && face === 1) || (mode === "all" && first === "fail");
		if (!reroll) {
			add(first, 1 / 6);
			continue;
		}
		for (const again of FACES) add(judge(again), 1 / 36);
	}
	return [...totals].map(([result, p]) => ({ result, p }));
}

/** §05.01 hit roll, §10.07 indirect shooting, §13.08 cover, §24.29 [PSYCHIC]. */
export function hitOutcomes(sc) {
	if (sc.torrent) return [{ result: "hit", p: 1 }];

	const indirect = sc.indirect && sc.indirect !== "none";
	let skillModifier = sc.skillModifier || 0;
	if ((sc.cover || indirect) && !sc.ignoresCover) skillModifier -= 1;
	let rollModifier = sc.hitModifier || 0;
	if (sc.psychic) {
		skillModifier = Math.max(0, skillModifier);
		rollModifier = Math.max(0, rollModifier);
	}
	// "Improve BS by 1" lowers the number; BS is bounded to 1+..7+.
	const bs = clamp((sc.skill ?? 4) - skillModifier, 1, 7);
	const modifier = clamp(rollModifier, -1, 1);
	const failsBelow = sc.indirect === "spotted" ? 4 : 6;

	const judge = (face) => {
		if (indirect && face < failsBelow) return "fail";
		if (face === 1) return "fail";
		if (face === 6) return "crit";
		return face + modifier >= bs ? "hit" : "fail";
	};
	return withReroll(judge, indirect ? "none" : sc.rerollHits || "none");
}

/** §05.02 wound roll with [ANTI], [TWIN-LINKED] and wound re-rolls. */
export function woundOutcomes(sc) {
	const s = sc.strength ?? 4;
	const t = sc.toughness ?? 4;
	let required = 5;
	if (s >= 2 * t) required = 2;
	else if (s > t) required = 3;
	else if (s === t) required = 4;
	else if (2 * s <= t) required = 6;
	const modifier = clamp(sc.woundModifier || 0, -1, 1);
	const critFrom = sc.anti ?? 6;

	const judge = (face) => {
		if (face === 1) return "fail";
		if (face >= critFrom) return "crit";
		return face + modifier >= required ? "wound" : "fail";
	};
	return withReroll(judge, sc.twinLinked ? "all" : sc.rerollWounds || "none");
}

/** §05.04 check save roll: probability the attack inflicts damage. */
export function saveFails(sc) {
	const save = sc.save ?? 7;
	const invuln = sc.invuln ?? null;
	const ap = sc.ap || 0;
	let fails = 0;
	for (const face of FACES) {
		if (face === 1) fails += 1 / 6;
		else if (invuln && face >= invuln) continue;
		else if (face - ap >= save) continue;
		else fails += 1 / 6;
	}
	return fails;
}

/** §05.04 + §24.12: wounds one damaging attack takes off, before the cap. */
function lossOutcomes(sc) {
	const out = new Map();
	for (const { value: damage, p } of rollOutcomes(sc.damage ?? "1", 1)) {
		let lost = new Map([[0, 1]]);
		for (let w = 0; w < damage; w++) {
			const next = new Map();
			for (const [n, q] of lost) {
				for (const face of FACES) {
					const ignored = sc.fnp && face >= sc.fnp;
					const key = ignored ? n : n + 1;
					next.set(key, (next.get(key) || 0) + q / 6);
				}
			}
			lost = next;
		}
		for (const [n, q] of lost) out.set(n, (out.get(n) || 0) + p * q);
	}
	return [...out];
}

const key = (dead, remaining) => `${dead},${remaining}`;

function mix(target, source, weight) {
	for (const [k, p] of source) target.set(k, (target.get(k) || 0) + weight * p);
	return target;
}

/** Applies one damaging attack; excess damage on a model is lost. */
function inflict(states, sc, losses) {
	const next = new Map();
	for (const [k, p] of states) {
		const [dead, remaining] = k.split(",").map(Number);
		if (dead === sc.count) {
			next.set(k, (next.get(k) || 0) + p);
			continue;
		}
		for (const [lost, q] of losses) {
			const left = remaining - lost;
			const target =
				left > 0
					? key(dead, left)
					: key(dead + 1, dead + 1 === sc.count ? 0 : sc.wounds);
			next.set(target, (next.get(target) || 0) + p * q);
		}
	}
	return next;
}

/**
 * @returns expected attacks, hits, wounds, critical wounds, mortal wounds and
 * failed saves, plus woundsLost / modelsSlain / pDestroyed from the exact
 * distribution of the target's state after every attack.
 */
export function oracle(input) {
	const sc = { count: 1, wounds: 1, models: 1, attacks: "1", ...input };
	const hits = hitOutcomes(sc);
	const woundRolls = woundOutcomes(sc);
	const fail = saveFails(sc);
	const losses = lossOutcomes(sc);
	const sustained = rollOutcomes(sc.sustained ?? "0");

	const expected = {
		attacks: 0,
		hits: 0,
		wounds: 0,
		critWounds: 0,
		mortalWounds: 0,
		failedSaves: 0,
	};

	// One hit that makes a wound roll: returns the transformed state distribution.
	const rollToWound = (states, weight) => {
		let out = new Map();
		for (const { result, p } of woundRolls) {
			if (result === "fail") {
				out = mix(out, states, p);
				continue;
			}
			expected.wounds += weight * p;
			if (result === "crit") expected.critWounds += weight * p;
			if (result === "crit" && sc.devastating) {
				// §24.10: the sequence ends; mortal wounds can damage one model only.
				expected.mortalWounds += weight * p;
				out = mix(out, inflict(states, sc, losses), p);
				continue;
			}
			out = mix(out, savedOrNot(states, weight * p), p);
		}
		return out;
	};
	const savedOrNot = (states, weight) => {
		expected.failedSaves += weight * fail;
		const out = mix(new Map(), states, 1 - fail);
		return mix(out, inflict(states, sc, losses), fail);
	};

	const attackDie = (states, weight) => {
		let out = new Map();
		for (const { result, p } of hits) {
			if (result === "fail") {
				out = mix(out, states, p);
				continue;
			}
			expected.hits += weight * p;
			if (result === "hit") {
				out = mix(out, rollToWound(states, weight * p), p);
				continue;
			}
			// Critical hit: [LETHAL HITS] may skip the wound roll (§24.23).
			let after;
			if (sc.lethal) {
				expected.wounds += weight * p;
				after = savedOrNot(states, weight * p);
			} else {
				after = rollToWound(states, weight * p);
			}
			let crit = new Map();
			for (const { value: extra, p: q } of sustained) {
				let s = after;
				expected.hits += weight * p * q * extra;
				for (let i = 0; i < extra; i++) s = rollToWound(s, weight * p * q);
				crit = mix(crit, s, q);
			}
			out = mix(out, crit, p);
		}
		return out;
	};

	const blastDice = (sc.blast || 0) * Math.floor(sc.count / 5);
	let states = new Map([[key(0, sc.wounds), 1]]);
	for (let m = 0; m < sc.models; m++) {
		let next = new Map();
		for (const { value: dice, p } of rollOutcomes(sc.attacks, 1)) {
			const total = dice + blastDice;
			expected.attacks += p * total;
			let s = states;
			for (let d = 0; d < total; d++) s = attackDie(s, p);
			next = mix(next, s, p);
		}
		states = next;
	}

	let woundsLost = 0;
	let modelsSlain = 0;
	let pDestroyed = 0;
	for (const [k, p] of states) {
		const [dead, remaining] = k.split(",").map(Number);
		modelsSlain += p * dead;
		if (dead === sc.count) {
			pDestroyed += p;
			woundsLost += p * sc.count * sc.wounds;
		} else {
			woundsLost += p * (dead * sc.wounds + sc.wounds - remaining);
		}
	}
	return { ...expected, woundsLost, modelsSlain, pDestroyed };
}
