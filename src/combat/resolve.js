import { addFlat, emptyExpr, parseDiceExpr, pmf } from "./diceExpr";
import {
	fnpFailProbability,
	hitProbability,
	saveProbability,
	woundProbability,
} from "./probability";
import { abilityApplies } from "./weaponKeywords";

/** Maximum allocation steps before the DP bails out (keeps the UI interactive). */
const MAX_STEPS = 600;

export function defaultContext(overrides = {}) {
	return {
		phase: "shooting",
		withinHalfRange: false,
		remainedStationary: false,
		charged: false,
		targetInCover: false,
		plungingFire: false,
		indirect: false,
		indirectSpotted: false,
		skillModifier: 0,
		hitModifier: 0,
		woundModifier: 0,
		apModifier: 0,
		damageModifier: 0,
		ignoreHitModifiers: false,
		rerollHits: "none",
		rerollWounds: "none",
		useLethalHits: true,
		attackerDamaged: false,
		...overrides,
	};
}

function binomial(n, k) {
	let result = 1;
	for (let i = 0; i < k; i++) result = (result * (n - i)) / (i + 1);
	return result;
}

/**
 * Probability that one unsaved attack costs the target model `l` wounds:
 * damage is rolled per attack, then Feel No Pain is rolled per wound (§24.12).
 */
export function lossDistribution(damagePmf, fnp) {
	const q = fnpFailProbability(fnp);
	const out = new Array(damagePmf.length).fill(0);
	for (let d = 0; d < damagePmf.length; d++) {
		const p = damagePmf[d];
		if (!p) continue;
		if (d === 0 || q === 1) {
			out[d === 0 ? 0 : d] += p;
			continue;
		}
		for (let l = 0; l <= d; l++) {
			out[l] += p * binomial(d, l) * q ** l * (1 - q) ** (d - l);
		}
	}
	return out;
}

/**
 * Every state of the target unit: (current group, models slain in it, wounds
 * left on the model taking damage), plus one "unit destroyed" state. Groups
 * are resolved in order, so this covers spill exactly.
 */
function unitLayout(groups) {
	const layout = {
		groups: groups.map((g) => ({
			count: Math.max(1, g.count || 1),
			wounds: Math.max(1, g.wounds || 1),
			points: g.pointsPerModel || 0,
		})),
		offsets: [],
		groupOf: [],
		slain: [],
		woundsLeft: [],
	};
	let size = 0;
	for (const [index, g] of layout.groups.entries()) {
		layout.offsets.push(size);
		for (let k = 0; k < g.count; k++) {
			for (let w = 1; w <= g.wounds; w++) {
				layout.groupOf.push(index);
				layout.slain.push(k);
				layout.woundsLeft.push(w);
			}
		}
		size += g.count * g.wounds;
	}
	layout.destroyed = size;
	layout.size = size + 1;
	return layout;
}

function freshModel(layout, group) {
	return layout.offsets[group] + layout.groups[group].wounds - 1;
}

/**
 * The state after a model at state `s` loses `lost` wounds. Excess damage is
 * lost (§05.04), which also implements the §24.10 one-model cap for
 * [DEVASTATING WOUNDS].
 */
function afterLoss(layout, s, lost) {
	const w = layout.woundsLeft[s];
	if (lost < w) return s - lost;
	const g = layout.groupOf[s];
	const { count, wounds } = layout.groups[g];
	const k = layout.slain[s] + 1;
	if (k < count) return layout.offsets[g] + k * wounds + wounds - 1;
	if (g + 1 < layout.groups.length) return freshModel(layout, g + 1);
	return layout.destroyed;
}

/**
 * Resolves one hit against whichever group is current: it becomes a damaging
 * event with `chance[group]`, which then costs wounds per `losses[group]`.
 */
function applyHit(v, layout, chance, losses) {
	const out = new Float64Array(layout.size);
	out[layout.destroyed] = v[layout.destroyed];
	for (let s = 0; s < layout.destroyed; s++) {
		const p = v[s];
		if (!p) continue;
		const g = layout.groupOf[s];
		const q = chance[g];
		out[s] += p * (1 - q);
		if (!q) continue;
		const loss = losses[g];
		for (let l = 0; l < loss.length; l++) {
			if (loss[l]) out[afterLoss(layout, s, l)] += p * q * loss[l];
		}
	}
	return out;
}

/** Drops a negligible tail and folds anything past MAX_STEPS into the last bucket. */
function trimTail(dist) {
	let end = dist.length;
	while (end > 1 && dist[end - 1] < 1e-16) end--;
	if (end <= MAX_STEPS + 1)
		return end === dist.length ? dist : dist.slice(0, end);
	const kept = dist.slice(0, MAX_STEPS + 1);
	for (let i = MAX_STEPS + 1; i < end; i++) kept[MAX_STEPS] += dist[i];
	return kept;
}

function convolve(a, b) {
	const out = new Array(a.length + b.length - 1).fill(0);
	for (let i = 0; i < a.length; i++) {
		if (!a[i]) continue;
		for (let j = 0; j < b.length; j++) out[i + j] += a[i] * b[j];
	}
	return trimTail(out);
}

function addScaled(target, dist, weight) {
	for (let i = 0; i < dist.length; i++) {
		target[i] = (target[i] || 0) + weight * dist[i];
	}
	return target;
}

/** Distribution of a sum of N copies of `unit`, where N follows `counts`. */
function compound(counts, unit) {
	const out = [];
	let power = [1];
	for (let n = 0; n < counts.length; n++) {
		if (counts[n]) addScaled(out, power, counts[n]);
		if (n < counts.length - 1) power = convolve(power, unit);
	}
	for (let i = 0; i < out.length; i++) out[i] ||= 0;
	return out;
}

/**
 * One weapon's attack dice, resolved die by die against the group that is
 * current at that moment (§05.04 spill), exactly as the Monte-Carlo does.
 *
 * `perGroup[g]` holds the weapon's streams resolved against group g. Also
 * returns `diceShare[g]`, the expected share of dice that met group g.
 */
function applyWeapon(v, layout, perGroup, fnps) {
	const groupCount = layout.groups.length;
	const p = perGroup.map((streams) => streams.sampling);
	const woundRoll = p.map((s) =>
		s.devastatingWounds
			? s.critWound + (s.wound - s.critWound) * s.saveFail
			: s.wound * s.saveFail,
	);
	const first = p.map((s, g) => (s.lethalHits ? s.saveFail : woundRoll[g]));
	const losses = perGroup.map((streams, g) =>
		lossDistribution(streams.damagePmf, fnps[g]),
	);
	const extraHits = pmf(p[0].sustainedExpr ?? emptyExpr());

	const die = (state) => {
		const normal = new Float64Array(layout.size);
		const crit = new Float64Array(layout.size);
		const out = new Float64Array(layout.size);
		out[layout.destroyed] = state[layout.destroyed];
		for (let s = 0; s < layout.destroyed; s++) {
			if (!state[s]) continue;
			const { hit, critHit } = p[layout.groupOf[s]];
			out[s] = state[s] * (1 - hit);
			normal[s] = state[s] * (hit - critHit);
			crit[s] = state[s] * critHit;
		}
		const afterNormal = applyHit(normal, layout, woundRoll, losses);
		let afterCrit = applyHit(crit, layout, first, losses);
		for (let x = 0; x < extraHits.length; x++) {
			if (extraHits[x]) addScaled(out, afterCrit, extraHits[x]);
			if (x < extraHits.length - 1)
				afterCrit = applyHit(afterCrit, layout, woundRoll, losses);
		}
		return addScaled(out, afterNormal, 1);
	};

	const instances = new Array(Math.round(p[0].instances) + 1).fill(0);
	instances[instances.length - 1] = 1;
	const diceCount = compound(instances, pmf(p[0].attacksExpr, 1));

	const result = new Float64Array(layout.size);
	const diceShare = new Array(groupCount).fill(0);
	let current = v;
	let atLeast = 1;
	let expectedDice = 0;
	for (let n = 0; n < diceCount.length; n++) {
		if (diceCount[n]) addScaled(result, current, diceCount[n]);
		atLeast -= diceCount[n];
		if (n === diceCount.length - 1 || atLeast <= 0) break;
		// The (n + 1)-th die is rolled with probability P(N > n).
		expectedDice += atLeast;
		for (let s = 0; s < layout.destroyed; s++) {
			diceShare[layout.groupOf[s]] += atLeast * current[s];
		}
		current = die(current);
	}
	return {
		state: result,
		diceShare: diceShare.map((d) => (expectedDice > 0 ? d / expectedDice : 0)),
	};
}

/**
 * Exact allocation of several weapons, in order, against a unit's allocation
 * groups in order. Normal damage and mortal wounds share one loss
 * distribution, so resolving normal damage first (§06.02) changes nothing.
 *
 * @param {Array<Array>} weaponStreams `weaponStreams[w][g]` = weapon w's
 * `computeAttackStreams` result against group g
 * @param {Array} groups allocation groups in allocation order
 */
export function allocateAttacks(weaponStreams, groups) {
	const layout = unitLayout(groups);
	const fnps = groups.map((g) => g.fnp);
	let state = new Float64Array(layout.size);
	state[freshModel(layout, 0)] = 1;

	const diceShare = [];
	for (const perGroup of weaponStreams) {
		const result = applyWeapon(state, layout, perGroup, fnps);
		state = result.state;
		diceShare.push(result.diceShare);
	}

	let woundsLost = 0;
	let modelsSlain = 0;
	let pointsKilled = 0;
	const before = { wounds: [0], models: [0], points: [0] };
	for (const g of layout.groups) {
		before.wounds.push(before.wounds.at(-1) + g.count * g.wounds);
		before.models.push(before.models.at(-1) + g.count);
		before.points.push(before.points.at(-1) + g.count * g.points);
	}
	for (let s = 0; s < layout.destroyed; s++) {
		const p = state[s];
		if (!p) continue;
		const g = layout.groupOf[s];
		const { wounds, points } = layout.groups[g];
		const k = layout.slain[s];
		woundsLost +=
			p * (before.wounds[g] + k * wounds + wounds - layout.woundsLeft[s]);
		modelsSlain += p * (before.models[g] + k);
		pointsKilled += p * (before.points[g] + k * points);
	}
	const pDestroyed = state[layout.destroyed];
	woundsLost += pDestroyed * before.wounds.at(-1);
	modelsSlain += pDestroyed * before.models.at(-1);
	pointsKilled += pDestroyed * before.points.at(-1);

	return {
		woundsLost,
		modelsSlain,
		pointsKilled,
		pDestroyed,
		diceShare,
		state,
	};
}

function hitModifiers(profile, group, ctx, indirect) {
	const abilities = profile.abilities;
	let skillModifier = ctx.skillModifier || 0;
	let rollModifier = ctx.hitModifier || 0;

	if (!profile.isMelee) {
		// §13.08 — benefit of cover worsens the attack's BS; §10.07 indirect shooting grants it.
		const inCover = ctx.targetInCover || group.stealth || indirect;
		if (inCover && !abilities.ignoresCover) skillModifier -= 1;
		if (ctx.plungingFire) skillModifier += 1;
		if (abilities.heavy && ctx.remainedStationary) rollModifier += 1;
	}
	// §24.39 — Damaged is an attacker-side hit ROLL modifier.
	if (ctx.attackerDamaged) rollModifier -= 1;

	return { skillModifier, rollModifier };
}

/** Bonus attack dice fold into the A characteristic, so they are a flat bonus. */
function attackDice(profile, group, ctx) {
	const abilities = profile.abilities;
	const fullFives = Math.floor(
		(group.targetModelCount ?? group.count ?? 1) / 5,
	);

	let bonus = 0;
	// §24.06 [CLEAVE] is not limited to ranged weapons; all attacks go to one target here.
	let perFive = abilities.cleave || 0;
	if (!profile.isMelee) {
		if (ctx.withinHalfRange) bonus += abilities.rapidFire;
		perFive += abilities.blast || 0;
	}
	bonus += perFive * fullFives;

	const expr = addFlat(profile.attacksExpr, bonus);
	// A characteristic can never be reduced below 1 (§4.9), whatever is rolled.
	const perWeapon = pmf(expr, 1).reduce((sum, p, value) => sum + p * value, 0);
	return {
		expr,
		instances: profile.count,
		total: perWeapon * profile.count,
		perFive,
		fullFives,
	};
}

function damageExpression(profile, ctx) {
	const base = parseDiceExpr(profile.damage) ?? { dice: 0, sides: 0, flat: 1 };
	const melta =
		profile.abilities.melta && ctx.withinHalfRange
			? profile.abilities.melta
			: 0;
	const bonus = melta + (ctx.damageModifier || 0);
	// Damage never drops below 1: `pmf(expr, 1)` and the sampler both floor it.
	return bonus ? addFlat(base, bonus) : base;
}

/**
 * Everything in the §5.2 pipeline up to (but not including) damage allocation.
 * Split out so several weapons can be allocated against a single shared group
 * state — otherwise each weapon would start against a full-health model.
 */
export function computeAttackStreams(profile, group, context = {}) {
	const ctx = defaultContext(context);
	const abilities = profile.abilities;
	const keywords = group.keywords || new Set();

	const dice = attackDice(profile, group, ctx);
	const attacks = dice.total;

	const indirect = Boolean(
		!profile.isMelee && ctx.indirect && abilities.indirectFire,
	);
	const { skillModifier, rollModifier } = hitModifiers(
		profile,
		group,
		ctx,
		indirect,
	);
	const hit = hitProbability({
		skill: profile.skill,
		skillModifier,
		rollModifier,
		torrent: abilities.torrent,
		reroll: ctx.rerollHits,
		indirect,
		indirectSpotted: ctx.indirectSpotted,
		ignoreNegative: abilities.psychic || ctx.ignoreHitModifiers,
	});

	const hits = attacks * hit.hit;
	const critHits = attacks * hit.critHit;
	const sustainedApplies = abilityApplies(abilities, "sustainedHits", keywords);
	const rawSustained = abilities.raw?.sustainedHits;
	// [SUSTAINED HITS D3] is rolled for each critical hit.
	const sustainedExpr = !sustainedApplies
		? emptyExpr()
		: (rawSustained !== undefined && parseDiceExpr(rawSustained)) || {
				...emptyExpr(),
				flat: abilities.sustainedHits,
			};
	const sustained = critHits * (sustainedApplies ? abilities.sustainedHits : 0);
	const totalHits = hits + sustained;

	// §24.23 — Lethal Hits is optional in 11th edition.
	const lethal =
		ctx.useLethalHits && abilityApplies(abilities, "lethalHits", keywords);
	const autoWounds = lethal ? critHits : 0;
	const woundRolls = Math.max(0, totalHits - autoWounds);

	const woundRollModifier =
		(ctx.woundModifier || 0) + (abilities.lance && ctx.charged ? 1 : 0);
	const wound = woundProbability({
		strength: profile.strength,
		toughness: group.toughness,
		rollModifier: woundRollModifier,
		anti: abilities.anti,
		targetKeywords: keywords,
		twinLinked: abilities.twinLinked,
		reroll: ctx.rerollWounds,
	});

	const wounds = woundRolls * wound.wound + autoWounds;
	const critWounds = woundRolls * wound.critWound;

	const devastating = abilityApplies(abilities, "devastatingWounds", keywords);
	const mortalHits = devastating ? critWounds : 0;
	const normalWounds = Math.max(0, wounds - mortalHits);

	const save = saveProbability({
		save: group.save,
		invuln: group.invuln,
		ap: profile.ap,
		apModifier: ctx.apModifier || 0,
	});
	const failedSaves = normalWounds * save.fail;

	const damageExpr = damageExpression(profile, ctx);
	const damagePmf = pmf(damageExpr, 1);

	return {
		weaponName: profile.weaponName,
		selectionName: profile.selectionName,
		carrierName: profile.carrierName,
		groupName: group.name,
		attacks,
		hits: totalHits,
		critHits,
		sustainedHits: sustained,
		autoWounds,
		wounds,
		critWounds,
		mortalWounds: mortalHits,
		failedSaves,
		damageExpr,
		damagePmf,
		rawDamage:
			failedSaves * damagePmf.reduce((sum, p, value) => sum + p * value, 0),
		// Everything Monte-Carlo needs to replay this profile die by die.
		sampling: {
			attacksExpr: dice.expr,
			instances: dice.instances,
			// [BLAST] / [CLEAVE] dice already in `attacksExpr` for `fullFives`.
			perFive: dice.perFive,
			fullFives: dice.fullFives,
			hit: hit.hit,
			critHit: hit.critHit,
			wound: wound.wound,
			critWound: wound.critWound,
			saveFail: save.fail,
			sustainedExpr,
			lethalHits: lethal,
			devastatingWounds: devastating,
		},
		detail: {
			hitTarget: hit.target,
			autoHit: hit.autoHit,
			hitProbability: hit.hit,
			woundProbability: wound.wound,
			woundTarget: wound.target,
			critWoundTarget: wound.critTarget,
			saveTarget: save.target,
			saveProbability: save.save,
			skillModifier,
			rollModifier,
			damage: damageExpr,
			lethalHits: lethal,
			devastatingWounds: devastating,
		},
		unknownAbilities: abilities.unknown,
	};
}

/**
 * The §5.2 pipeline for one weapon profile against one allocation group,
 * allocated against a fresh, full-health group.
 * @returns the §5.4 metric bundle
 */
export function resolveWeaponVsGroup(profile, group, context = {}) {
	const streams = computeAttackStreams(profile, group, context);
	const allocation = allocateAttacks([[streams]], [group]);

	return {
		...streams,
		woundsLost: allocation.woundsLost,
		modelsSlain: allocation.modelsSlain,
		pDestroyed: allocation.pDestroyed,
		pointsKilled: allocation.pointsKilled,
	};
}

/** Scales a weapon's displayed output to the share of its dice that met a group. */
export function scaleStreams(streams, fraction) {
	if (fraction >= 1) return streams;
	return {
		...streams,
		attacks: streams.attacks * fraction,
		hits: streams.hits * fraction,
		critHits: streams.critHits * fraction,
		sustainedHits: streams.sustainedHits * fraction,
		autoWounds: streams.autoWounds * fraction,
		wounds: streams.wounds * fraction,
		critWounds: streams.critWounds * fraction,
		mortalWounds: streams.mortalWounds * fraction,
		failedSaves: streams.failedSaves * fraction,
		rawDamage: streams.rawDamage * fraction,
	};
}
