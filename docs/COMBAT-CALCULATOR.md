# Dakkulator — Combat Calculator

> **Scope: Warhammer 40,000 11th Edition only.** Rosters that are not 11th
> edition are rejected on upload.

Dakkulator loads BattleScribe / New Recruit rosters (`.ros` / `.rosz`), lets the
user pick one or more attacking units from List A and one or more defending units
from List B, and computes for every pairing the outcome of one round of shooting
or fighting:

- expected attacks, hits, wounds, mortal wounds, failed saves and raw damage
- expected wounds lost (after Feel No Pain and the per-model damage cap)
- expected models slain and points killed
- probability the target unit is destroyed
- damage per 100 points and rounds to clear

---

## 1. Data model — [src/roster40k-11th.js](../src/roster40k-11th.js)

Rosters are loaded by [src/library/loadRoster.js](../src/library/loadRoster.js)
(`jszip` → XML → `Create40kRoster11th`).

```
Roster40k
 ├─ name: string
 ├─ cost: Costs { points, commandPoints, freeformValues }
 ├─ gameType: string           // "Warhammer 40,000 11th Edition"
 └─ forces: Force[]
      ├─ name / catalog / faction
      ├─ configurations: string[]   // detachment, battle size
      ├─ factionRules: Map<string,string>
      ├─ rules: Map<string,string>
      └─ units: Unit[]
```

### `Unit`

| Property        | Type                              | Notes                                                                                     |
| --------------- | --------------------------------- | ----------------------------------------------------------------------------------------- |
| `name`          | string                            |                                                                                           |
| `role`          | `UnitRole`                        | `NONE` / `Character` / `Battleline` / `DedicatedTransport`                                |
| `factions`      | `Set<string>`                     |                                                                                           |
| `keywords`      | `Set<string>`                     | drives `[ANTI-X]`, keyword-restricted abilities and `CHARACTER` allocation groups         |
| `abilities`     | `{ [group]: Map<string,string> }` | free text, mined for `Feel No Pain X+`, `Damaged`, `Stealth`, … (§5.2)                    |
| `rules`         | `Map<string,string>`              |                                                                                           |
| `models`        | `Model[]`                         | equipped models (with `count`)                                                            |
| `modelStats`    | `Model[]`                         | one stat profile per distinct model type                                                  |
| `modelList`     | `string[]`                        |                                                                                           |
| `rangedWeapons` | `Weapon[]`                        | deduped across models                                                                     |
| `meleeWeapons`  | `Weapon[]`                        | deduped across models                                                                     |
| `cost`          | `Costs`                           |                                                                                           |
| `woundTracker`  | `WoundTracker[]`                  | defender-side degrading statlines — distinct from the attacker-side `Damaged` hit penalty |

### `Model` (stat profile)

Parsed from characteristics `M, WS, BS, S, T, W, A, LD, SV|Sv, InSv|Invulnerable Save, OC`:

| Property           | Type   | Default | Characteristic                 |
| ------------------ | ------ | ------- | ------------------------------ |
| `count`            | number | 1       | —                              |
| `move`             | string | `"6""`  | M                              |
| `ws`               | string | `"4+"`  | WS                             |
| `bs`               | string | `"4+"`  | BS                             |
| `str`              | number | 4       | S                              |
| `toughness`        | number | 4       | T                              |
| `wounds`           | number | 1       | W                              |
| `attacks`          | string | `"1"`   | A                              |
| `leadership`       | string |         | LD                             |
| `save`             | string | `"5+"`  | Sv                             |
| `invulnerableSave` | string | `""`    | InSv (only set when not `"-"`) |
| `oc`               | string | `"1"`   | OC                             |

### `Weapon`

| Property        | Source characteristic                    | Example                                      |
| --------------- | ---------------------------------------- | -------------------------------------------- |
| `name`          | profile name                             | `"Boltgun"`                                  |
| `selectionName` | parent `<selection type="upgrade">` name | `"Bolt rifle"`                               |
| `count`         | `ExtractNumberFromParent`                | how many models carry it                     |
| `range`         | `Range`                                  | `"24""` / `"Melee"`                          |
| `attacks`       | `A`                                      | `"2"`, `"D6"`, `"D3+3"`, `"2D6"`             |
| `bs` / `ws`     | `BS` / `WS`                              | `"3+"` (may be multi-profile, `"3+\|4+"`)    |
| `str`           | `S`                                      | `"4"`                                        |
| `ap`            | `AP`                                     | `"-1"`                                       |
| `damage`        | `D`                                      | `"1"`, `"D3"`, `"D6+2"`                      |
| `type`          | `Keywords` **or** `Type`                 | the weapon abilities, e.g. `"[LETHAL HITS]"` |
| `abilities`     | `Abilities`                              | free text, `"-"` when empty                  |

> ⚠️ **`weapon.type` holds the weapon abilities.** Both the `Type` and the
> `Keywords` characteristic map onto it; `Keywords` wins because it is read last.

### Helpers — [src/helpers](../src/helpers)

| File                 | API                                                    | Use                                         |
| -------------------- | ------------------------------------------------------ | ------------------------------------------- |
| `json.js`            | `parseJSON(str)` / `stringifyJSON(val)`                | `Map` + `Set` safe, used to persist rosters |
| `useLocalStorage.js` | `useLocalStorage(key, initValue)` → `[state,setState]` | persisted UI state                          |

### Tooling

| Thing       | Value                                                                            |
| ----------- | -------------------------------------------------------------------------------- |
| React       | `^19` with the React Compiler babel plugin ([vite.config.js](../vite.config.js)) |
| Build       | Vite `^6`, base path `/Dakkulator/`                                              |
| Styling     | Tailwind `^3.4`                                                                  |
| Charts      | Recharts 3                                                                       |
| Lint/format | Biome — tabs, double quotes, organised imports                                   |
| Scripts     | `npm run dev`, `npm run build`, `npm run preview`, `npm run lint`, `npm test`    |
| Tests       | Vitest (`src/**/*.test.js`)                                                      |

---

## 2. 11th Edition rules reference

Source: Wahapedia — _Warhammer 40,000 11th Edition Core Rules_ (June 2026),
<https://wahapedia.ru/wh40k11ed/the-rules/core-rules/>. Section numbers are the
official rule references.

### 2.1 Attack resolution order (§04, §05)

```
Select Weapons (04.01)
  └─ shooting: any number of ranged weapons per model
  └─ fighting: exactly ONE melee weapon per model
     (+ all of that model's [EXTRA ATTACKS] weapons)
Select Targets (04.02)
Resolve Attacks (04.03)
  └─ Gather Attack Dice: N = weapon's A characteristic, per model, per weapon
     (+ [BLAST], [CLEAVE], [RAPID FIRE] bonus dice)
  └─ Attack Sequence (05):
       1. Hit rolls   (05.01)
       2. Wound rolls (05.02)
       3. Save rolls  (05.03)
       4. Inflict damage (05.04)
```

### 2.2 Hit roll — §05.01

First matching condition wins:

| Condition                        | Result                         |
| -------------------------------- | ------------------------------ |
| Unmodified **1**                 | FAILS                          |
| Unmodified **6**                 | **CRITICAL HIT** (still a hit) |
| Modified result ≥ attack's BS/WS | HIT                            |
| anything else                    | FAILS                          |

$$P(\text{hit}) = \frac{7 - \mathrm{clamp}\big(\mathrm{BS}_{\text{eff}} - m_{\text{roll}},\,2,\,6\big)}{6}, \qquad P(\text{crit hit}) = \tfrac{1}{6}$$

- $\mathrm{BS}_{\text{eff}} = \mathrm{clamp}(\mathrm{BS} + \sum \text{characteristic modifiers},\,1,\,7)$ — uncapped and cumulative (cover, Plunging Fire)
- $m_{\text{roll}} = \mathrm{clamp}(\sum \text{roll modifiers},\,-1,\,+1)$ — capped at ±1

`[TORRENT]`: $P(\text{hit}) = 1$, $P(\text{crit hit}) = 0$ (no roll, so no critical hit).

"Critical hits on N+" replaces the 6 with N; a critical hit always hits, so it
also lowers the number needed. Indirect fire's floor applies to criticals too: a
roll below it fails even where it would be critical. "Critical wounds on N+"
works the same on the wound roll and combines with `[ANTI-X]` (the lower wins).

Re-rolls act on the unmodified die: re-roll 1s gives $P' = P + \tfrac16 P$,
re-roll failures gives $P' = P + (1-P)P$; the critical branch is recomputed on the
re-rolled die.

### 2.3 Wound roll — §05.02

| Condition                         | Result             |
| --------------------------------- | ------------------ |
| Unmodified **1**                  | FAILS              |
| Unmodified **6**                  | **CRITICAL WOUND** |
| Modified result ≥ threshold below | WOUND              |

$$\text{threshold}(S,T)=\begin{cases}2 & S \ge 2T\\ 3 & T < S < 2T\\ 4 & S = T\\ 5 & T/2 < S < T\\ 6 & S \le T/2\end{cases}$$

$$P(\text{wound}) = \frac{7-\mathrm{clamp}\big(\text{threshold} - m_{\text{roll}},2,6\big)}{6},\qquad P(\text{crit wound}) = \tfrac16$$

with $m_{\text{roll}} = \mathrm{clamp}(\sum \text{wound roll modifiers},-1,+1)$.

- `[ANTI-X Y+]` (§24.03): vs keyword X an unmodified Y+ is a critical wound, so
  $P(\text{crit wound}) = \tfrac{7-Y}{6}$ and $P(\text{wound}) = \max\big(P(\text{wound}), P(\text{crit wound})\big)$.
- `[TWIN-LINKED]` (§24.38): re-roll the wound roll.
- `[LANCE]` (§24.21): +1 to the wound roll if the attacking unit charged.

### 2.4 Save roll — §05.03 / §05.04

The defender divides the unit into **allocation groups**: one per `CHARACTER`
model, plus one per distinct `(W, Sv, InSv)` combination.

| Condition                     | Result              |
| ----------------------------- | ------------------- |
| Unmodified **1**              | **INFLICTS DAMAGE** |
| InSv exists and result ≥ InSv | FAILS (saved)       |
| (result + AP) ≥ Sv            | FAILS (saved)       |
| anything else                 | INFLICTS DAMAGE     |

One D6 is compared against both saves; the better outcome for the defender
applies automatically.

```
saveTarget = clamp(min(Sv + |AP|, InSv ?? 7), 2, 7)   // 7 => impossible
P(save)    = (7 - saveTarget) / 6
```

**Benefit of cover (§13.08) worsens the attack's BS by 1** — it does not touch the
save. `[IGNORES COVER]` (§24.18) negates it, including cover from `Stealth`.
Plunging Fire (§22.05) improves BS by 1.

### 2.5 Inflict damage — §05.04

- A failed save makes the selected model lose **D** wounds.
- Excess damage on a destroyed model is **lost**.
- `Feel No Pain X+` (§24.12) is rolled **per wound** that would be lost. A
  Feel No Pain "against mortal wounds" (`mortalFnp`) covers the mortal wounds
  of `[DEVASTATING WOUNDS]` only; those use the better of both thresholds.
  One "against psychic attacks" (`psychicFnp`) counts for `[PSYCHIC]` weapons only.
- Damage rules from abilities, in this order (`applyDamageRules`): "re-roll the
  Damage roll" re-rolls a random roll below the average once; "halve the Damage"
  rounds up, minimum 1; "change the Damage to 1" sets it to 1. The defender's two
  apply per allocation group, like its AP and Damage modifiers.

### 2.6 Mortal wounds — §06.02

- Allocated one at a time; each removes 1 wound. No saves; Feel No Pain applies.
- When attacks inflict both, all normal damage is resolved before the mortal wounds.

### 2.7 Weapon abilities — §24

| Ability                 | §     | Effect                                                                                                                                               |
| ----------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[ANTI-X Y+]`           | 24.03 | vs keyword X: unmodified wound roll Y+ is a critical wound                                                                                           |
| `[ASSAULT]`             | 24.04 | shoot after advancing. No maths change                                                                                                               |
| `[BLAST]` / `[BLAST X]` | 24.05 | `+1` (or `+X`) attack dice per full 5 models in the target at target selection                                                                       |
| `[CLEAVE X]`            | 24.06 | if all attacks target one unit: `+X` attack dice per full 5 models in the target                                                                     |
| `[CLOSE-QUARTERS]`      | 24.07 | close-quarters shooting while engaged. No maths change                                                                                               |
| `[DEVASTATING WOUNDS]`  | 24.10 | critical wound ⇒ sequence ends, mortal wounds equal to D; **max one model damaged per critical wound**                                               |
| `[EXTRA ATTACKS]`       | 24.11 | used in addition to one normal melee weapon                                                                                                          |
| `[HAZARDOUS]`           | 24.15 | after attacking, one hazard roll per weapon: 1-2 ⇒ 1 MW (3 MW if all `MONSTER`/`VEHICLE`)                                                            |
| `[HEAVY]`               | 24.16 | `+1` to hit if the unit remained stationary (moved ≤ 3", unengaged, not set up this turn)                                                            |
| `[IGNORES COVER]`       | 24.18 | target cannot have benefit of cover                                                                                                                  |
| `[INDIRECT FIRE]`       | 24.19 | indirect shooting (§10.07): target has cover, no hit re-rolls, unmodified 1-5 fails (1-3 if stationary and the target is visible to a friendly unit) |
| `[LANCE]`               | 24.21 | `+1` to wound after charging                                                                                                                         |
| `[LETHAL HITS]`         | 24.23 | critical hit may auto-wound (no wound roll, so no critical wound)                                                                                    |
| `[MELTA X]`             | 24.25 | `+X` to D within half range                                                                                                                          |
| `[ONE SHOT]`            | 24.26 | once per battle                                                                                                                                      |
| `[PISTOL]`              | 24.27 | identical to `[CLOSE-QUARTERS]`                                                                                                                      |
| `[PRECISION]`           | 24.28 | attacker may make a visible `CHARACTER` group current                                                                                                |
| `[PSYCHIC]`             | 24.29 | may ignore modifiers to BS/WS and to the hit roll                                                                                                    |
| `[RAPID FIRE X]`        | 24.30 | `+X` attack dice within half range                                                                                                                   |
| `[SUSTAINED HITS X]`    | 24.36 | each critical hit scores `X` additional hits                                                                                                         |
| `[TORRENT]`             | 24.37 | auto-hits                                                                                                                                            |
| `[TWIN-LINKED]`         | 24.38 | re-roll the wound roll                                                                                                                               |
| `Damaged X`             | 24.39 | while the model is damaged, its attacks have −1 to hit (a roll modifier, shares the ±1 cap)                                                          |
| `Feel No Pain X+`       | 24.12 | each wound that would be lost is ignored on X+                                                                                                       |
| `Stealth`               | 24.33 | benefit of cover vs ranged attacks                                                                                                                   |

**Duplicated abilities (§24.02)** are not cumulative, even when the number or
keyword differs; the engine keeps the best instance.

### 2.8 Modifiers — §02.02.01

Two independent buckets:

- **Characteristic modifiers** (BS/WS, S, AP, D, …): cumulative, no ±1 cap. Hard
  bounds: BS/WS 1+..7+, Sv/InSv never 1+, AP never worse than 0, S/T/D/A ≥ 1.
- **Dice-roll modifiers** (hit, wound): summed, then capped at ±1. Applied after
  re-rolls; critical and `[ANTI-X]` checks use the unmodified (re-rolled) die.

```
effectiveSkill = clamp(BS + Σ characteristicModifiers, 1, 7)   // cover, Plunging Fire
rollModifier   = clamp(Σ rollModifiers, -1, +1)                // Damaged, auras, Heavy
```

So a BS 3+ model shooting into cover (`-1 BS`) under a `-1 to hit` aura hits on
5+, and two `-1 BS` sources stack to `-2`.

- **Ignore modifiers (§02.02.02):** `[PSYCHIC]` and abilities that "ignore any
  or all modifiers" to BS/WS, the hit roll or the wound roll may drop any
  modifier, so the engine drops only the detrimental ones — each on its own, not
  the net: a +1 and a −1 leave +1 (`skillModifierBonus`, `hitModifierBonus` and
  `woundModifierBonus` carry the sum of the positive ones).
- **Random characteristics (§02.02.03):** A is rolled when dice are gathered; D is
  rolled per attack after allocation. The `+N` in `D6+1` is part of the
  characteristic, so `[MELTA 2]` on `D6+1` gives `D6+3`.

---

## 3. Engine

Pure functions, no React, in [src/combat](../src/combat):

| File                                      | Responsibility                                                        |
| ----------------------------------------- | --------------------------------------------------------------------- |
| `diceExpr.js`                             | `parseDiceExpr("D6+2")` → `{ dice, sides, flat }`, `pmf()`, `mean()`  |
| `weaponKeywords.js`                       | `parseWeaponAbilities(weapon.type)` → ability flags                   |
| `profiles.js`                             | attacker profiles, defender allocation groups, unit ability mining    |
| `probability.js`                          | hit / wound / save / Feel No Pain probabilities                       |
| `resolve.js`                              | per-weapon attack streams and exact allocation (`allocateAttacks`)    |
| `simulate.js`                             | seeded Monte-Carlo over several rounds                                |
| `index.js`                                | `resolveUnitVsUnit`, `calculateMatchup` (memoised), `simulatePairing` |
| `modifiers.js`                            | user-built modifiers (§4.3)                                           |
| `attach.js`                               | leader / bodyguard attachment (§4.2)                                  |
| `unitList.js`                             | a roster's units: every copy listed, grouped again after attachment   |
| `setupStore.js`                           | remembered setup: units/leaders per list, context and metric globally |
| `simulate.worker.js`, `simulateClient.js` | runs Monte-Carlo in a Web Worker, cached per pairing                  |

### 3.1 Dice expressions

Grammar: `[N]D<S>[+/-M]` | `<M>`. The engine always keeps the full PMF, not just
the mean, because damage is capped per model and Feel No Pain is per wound.
Attacks and damage are floored at 1 **per roll** (`D3-1` averages 4/3, not 1).

### 3.2 Attack streams — `computeAttackStreams(profile, group, ctx)`

Expected counts for one weapon profile against one allocation group:

```
attacks      = count × E[max(1, A + rapidFire + blast/cleave dice)]
hits         = attacks × P(hit) + critHits × E[X]      // [SUSTAINED HITS X], X rolled per crit
autoWounds   = critHits                                 // [LETHAL HITS], if used
wounds       = woundRolls × P(wound) + autoWounds
critWounds   = woundRolls × P(critWound)
mortalWounds = critWounds                               // with [DEVASTATING WOUNDS]
failedSaves  = (wounds − mortalWounds) × P(fail save)
rawDamage    = (failedSaves + mortalWounds) × E[D]
```

Each stream also carries `sampling` (the per-die probabilities) and the damage
PMF, which the allocator and the Monte-Carlo consume.

### 3.3 Exact allocation — `allocateAttacks(weaponStreams, groups)`

Wounds lost, models slain, points killed and P(destroyed) come from an exact
Markov chain over the whole target unit:

- **State:** current allocation group, models slain in it, wounds left on the
  model taking damage — plus one "unit destroyed" state.
- **Transition:** weapons are resolved in order, die by die. Each die hits,
  crits or misses using the current group's probabilities; each resulting hit
  (including every `[SUSTAINED HITS]` extra hit) becomes a damaging event with
  the current group's wound/save probability. A damaging event costs wounds per
  the damage PMF with Feel No Pain rolled per wound; excess is lost, and a
  destroyed group hands over to the next one (exact spill).
- `[DEVASTATING WOUNDS]` mortal wounds use the same loss distribution, which also
  enforces the one-model cap, so normal-before-mortal ordering changes nothing.
- The number of dice per weapon is the exact distribution of the summed attack
  rolls (capped at 600 dice).
- `diceShare[w][g]` — the expected share of weapon w's dice that met group g —
  scales the per-group rows shown in the breakdown. Dice rolled after the unit
  is destroyed are lost.

### 3.4 Monte-Carlo — [src/combat/simulate.js](../src/combat/simulate.js)

Seeded (`mulberry32`), 10 000 trials by default, up to 10 rounds. It replays each
attack die by die against the group current at that moment, keeps damage between
rounds, and recounts `[BLAST]` / `[CLEAVE]` models at the start of each round. It
returns the round-1 damage histogram, `clearedBy[n]` = P(destroyed by the end of
round n + 1) and `medianRounds`.

Overkill: once the unit is destroyed in round 1, the rest of that round's
attacks go on against fresh copies of its last model type (damage still capped
per model, Feel No Pain still rolled). `potentialHistogram` and
`meanPotentialWoundsLost` hold that "everything the attack could do"; folded at
the unit's total wounds it is exactly `histogram`. The chart shows it with a
"destroyed" line; the capped values stay what the matrix uses.

### 3.5 Metrics

| Metric             | Definition                                               |
| ------------------ | -------------------------------------------------------- |
| Attacks            | declared attack dice (`declaredAttacks`); `attacks` only counts dice rolled before the unit is destroyed |
| Hits               | including `[SUSTAINED HITS]` extra hits                  |
| Wounds             | successful wound rolls + `[LETHAL HITS]` auto-wounds     |
| Mortal wounds      | `[DEVASTATING WOUNDS]` critical wounds                   |
| Failed saves       |                                                          |
| Damage             | raw, before the per-model cap and Feel No Pain           |
| Wounds lost        | after Feel No Pain and the cap (exact allocation)        |
| Models slain       | exact allocation                                         |
| Points killed      | slain models × points per model, per allocation group    |
| P(destroyed)       | exact allocation (one round)                             |
| Damage per 100 pts | wounds lost ÷ attacker points × 100                      |
| Points removed     | defender points × wounds lost ÷ defender total wounds    |
| Efficiency         | points removed ÷ attacker points × 100 (% of own cost)   |
| Rounds to clear    | expected: total wounds ÷ wounds lost; Monte-Carlo median |

### 3.6 Context — `defaultContext()`

```js
{
  phase: "shooting" | "fight" | "combined", // combined = shooting, then fight, vs one unit
  withinHalfRange: false,     // [RAPID FIRE], [MELTA]
  remainedStationary: false,  // [HEAVY]
  charged: false,             // [LANCE]
  targetInCover: false,       // -1 BS unless [IGNORES COVER]
  plungingFire: false,        // +1 BS
  indirect: false,            // [INDIRECT FIRE] weapons shoot indirectly
  indirectSpotted: false,     // stationary + target visible to a friendly unit
  skillModifier: 0,           // BS/WS characteristic modifier, uncapped
  hitModifier: 0,             // hit roll modifier, capped to ±1
  woundModifier: 0,           // wound roll modifier, capped to ±1
  apModifier: 0,
  damageModifier: 0,
  ignoreHitModifiers: false,  // drop detrimental hit modifiers
  rerollHits: "none" | "ones" | "all",
  rerollWounds: "none" | "ones" | "all",
  useLethalHits: true,        // [LETHAL HITS] is optional; UI: "Opt out of [LETHAL HITS]"
  allLethalHits: false,       // "Apply to all": every attacking weapon gains [LETHAL HITS]
  allDevastatingWounds: false,//   … [DEVASTATING WOUNDS]
  allSustainedHits: 0,        //   … [SUSTAINED HITS 1–3]; 0 = off
  attackerDamaged: false,     // -1 to hit from Damaged
}
```

---

## 4. Parsing and unit handling

### 4.1 Weapon abilities and unit abilities

`parseWeaponAbilities(weapon.type)` accepts bracketed or plain, any-case forms
(`[SUSTAINED HITS 1]`, `Sustained Hits 1`, `Anti-Vehicle 4+`, `Melta 2`,
`Rapid Fire D3`) and keyword-restricted forms (`[LETHAL HITS: VEHICLE]`, §24.01).
It returns boolean flags, numeric values (`rapidFire`, `sustainedHits`, `blast`,
`cleave`, `melta`), `anti: [{ keyword, threshold }]`, `restrictions`, the `raw`
strings of random values, `duplicated`, and `unknown` tokens, which the UI
surfaces as warnings. `abilityLabels(flags)` turns the flags back into labels;
the breakdown table lists them under each weapon, marking abilities granted by
modifiers or "Apply to all" (`profile.baseAbilities` keeps the weapon's own).

`mineUnitAbilities(unit)` reads `Feel No Pain X+` (a qualified "… against …"
Feel No Pain is not applied), `Damaged: X-Y wounds remaining`, `Stealth`,
`Fights First`, `Lone Operative` and `Deadly Demise X` from the unit's abilities
and rules. Anything else is listed in the UI as not modelled.

Attacker profiles map each model to its stat line with `getNameMatchScore`,
prefer the weapon's own BS/WS, and keep one firing mode per weapon and one
normal melee weapon per model (plus every `[EXTRA ATTACKS]` weapon). Exclusive
profiles share a `choice` key; against each target `resolveUnitVsUnit` resolves
every candidate alone and keeps the one that removes the most wounds. The others
are reported as `alternatives` / `unusedWeaponProfiles`.

Defender allocation groups are ordered worst save first, leaders last (§05.03).

### 4.2 Attached units — [src/combat/attach.js](../src/combat/attach.js)

Rosters do not record which leader joined which unit, so the picker offers every
bodyguard named in a leader's `Leader` ability. The merged unit pools weapons,
keywords and points, keeps Feel No Pain and points tied to their source models,
and resolves the leader's allocation group last.

### 4.3 User-built modifiers — [src/combat/modifiers.js](../src/combat/modifiers.js)

Each effect is a plain-JSON modifier:

- **Scope:** list A / B / both, optionally one unit (a leader's name covers its
  attached unit, unless "only its own models" is set — then only that member's
  weapons, or its own allocation group when defending; abilities worded "the
  bearer" / "this model" get this flag), or the list's units "with" / "not with" keywords (a phrase
  such as `ADEPTUS CUSTODES INFANTRY` matches when every word is among the unit's
  keywords); role (attacking / defending); phase; "only vs keywords".
- **Effects:** BS/WS, hit, wound (±1 in the editor), AP, Strength, Attacks,
  Damage; re-rolls of hits, wounds and damage; critical hits / wounds on N+;
  granted weapon abilities in datasheet syntax; ignore negative hit or wound
  modifiers; defensively Feel No Pain, invulnerable save, benefit of cover,
  halve damage, damage becomes 1.
- **Characteristics of the attacked models:** Toughness, Save (+1 = better,
  never better than 2+) and Wounds, with their natural signs. On a defending
  modifier they change the unit's own models; on an attacking one, the target's
  ("subtract 1 from the Toughness of that unit").
- **Strength vs Toughness condition** (`S > T`, `≥`, `<`, `≤`): such modifiers
  are not folded into the shared context; `applyConditional` checks each weapon
  profile's Strength against each allocation group's Toughness (after the
  unconditional changes) inside `computeAttackStreams`, and applies the
  modifier to that pairing only.
- **Weapon filter** (`weaponFilter`): only weapons whose name or keyword line
  contains one of the given words ("Solitaire", "PSYCHIC", "TORRENT"). Checked
  per weapon like the condition above, for attacking and defending modifiers.
- **Not vs keywords** (`excludeVsKeywords`): never against opponents with them.
- A defending modifier can also lower the attacking weapons' Strength and
  Attacks, for debuffs on the enemy's attacks.

Roll modifiers from every source share the ±1 cap. A modifier for a unit the
list no longer contains stays stored but is hidden.

**Generated from ability text** ([abilityRules.js](../src/combat/abilityRules.js),
[abilityModifiers.js](../src/combat/abilityModifiers.js)): when a list is added,
its datasheet, faction and detachment abilities are read sentence by sentence
with regex rules (a recognised subject such as "each time this unit makes an
attack", "each time an attack targets an INFANTRY unit from your army", or an
aura, plus a recognised effect). Each match becomes a modifier the user can
edit or delete. Choices ("select one of …") become one modifier per option,
switched off; effects for a target picked during the game ("attacks that
target that enemy unit") are also off; everything else, conditional or once
per battle, is on. Effects on an enemy unit (one picked, in an enemy "aura",
Afflicted, Suppressed, …) become modifiers for your own list: weakened enemy
attacks a defending one, help against that unit (−1 T, no cover) an attacking one. Auras and army-wide rules apply to the
whole list, limited by the keywords they name. Reset brings back the generated
set. Characteristic changes BSData already applies to the profiles (an
enhancement like Memento Moritoi: +1 A, S and D on the bearer's melee weapons)
show in the roster's values, so the generated modifier leaves them out;
[rosterApplied.json](../src/combat/rosterApplied.json) lists those abilities and
fields and is rebuilt with `node scripts/rosterApplied.mjs <BSData clone>`
when BSData changes. `node scripts/abilityCoverage.mjs` measures the rules against a local copy
of the BSData corpus (`scripts/.corpus/`, not committed). Modifiers are built in
`ui/ModifierBuilder.jsx` and persisted in `localStorage` under `modifiersByArmy`,
per army (the roster's catalog, e.g. `Imperium - Adeptus Custodes`): a list-A
or list-B modifier belongs to that list's army and returns whenever a roster of
that army is loaded, in either slot; "both lists" modifiers are shared by all
armies. The old single `modifiers` list is filed under the armies loaded on first
visit. The breakdown lists the modifiers applied to a pairing.

### 4.4 Army lists

- Army lists live in [src/library/](../src/library/): one upload area (several
  files at once) and a table of saved lists; the attacker and defender pick
  from it.

---

## 5. Tests

| File                                                                                | Use                                                                     |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| [public/Custodes.rosz](../public/Custodes.rosz)                                     | example roster (loaded as List A on first visit)                        |
| [public/Tyranids.rosz](../public/Tyranids.rosz)                                     | example roster (loaded as List B on first visit)                        |
| [src/combat/\_\_fixtures\_\_/units.js](../src/combat/__fixtures__/units.js)         | hand-written `Unit` objects                                             |
| [src/combat/\_\_fixtures\_\_/oracle.js](../src/combat/__fixtures__/oracle.js)       | brute-force reference: enumerates every die face, shares no engine code |
| [src/combat/\_\_fixtures\_\_/scenarios.js](../src/combat/__fixtures__/scenarios.js) | oracle scenario → engine inputs, plus a seeded scenario generator       |

| Test file                        | Checks                                                                                 |
| -------------------------------- | -------------------------------------------------------------------------------------- |
| `oracle.test.js`                 | engine = oracle to 1e-9 on named rule interactions and 300 random scenarios            |
| `probability.exhaustive.test.js` | hit / wound / save / FNP over every input combination vs literal enumeration           |
| `simulate.test.js`               | exact engine vs Monte-Carlo within 4.5 standard errors, incl. spill and `[BLAST]`      |
| `invariants.test.js`             | bounds, conserved probability mass, monotonicity, linearity, weapon-order independence |
| `resolve.test.js`                | hand-computed golden values                                                            |
| `exampleRosters.test.js`         | snapshots: the modifiers generated for every example roster, and every matrix cell of three example matchups (update with `npx vitest -u` after an intended change) |
| `modifierEquivalence.test.js`    | every modifier field gives exactly what the matching oracle-scenario rule gives, over random scenarios |
| `ui/Calculator.test.jsx`         | UI smoke test (happy-dom): matrix, breakdown, every view and the modifier editor render without errors |
| `oracleGroups.test.js`           | exact allocation across 2–3 model groups (own Toughness, saves, wounds, Feel No Pain each) vs `oracleGroups`, the multi-group oracle |
| `library/handmadeRoster.test.js` | a hand-made roster (own wording) through parser, profiles, leader attachment, modifiers and matrix; roster loading and its error messages |
| `library/useRosterLibrary.test.jsx` | the saved list library: uploads and slots, swapping, deleting, full storage, Map/Set round trip |
| `abilityCorpus.test.js`          | how every corpus ability is read, against `__snapshots__/abilityCorpus.txt` (names and fields only); runs only where the local corpus exists |
| other `*.test.js`                | parsing, profiles, modifiers, attachment, saved setup, library                         |

A rule change in the engine must also be made in `oracle.js`.

`npm run test:coverage` (also in CI) fails when line, function or branch coverage of
`src/combat/*.js` or `src/library/*.js` drops below the minimums in `vite.config.js`.

---

## 6. Known limitations

- Each allocation group uses its own T; §19.02 (highest bodyguard T for the whole
  attached unit) is not applied.
- No choice of target statline: groups always use the defender-optimal order.
- `[PRECISION]` is parsed but not applied.
- `[HAZARDOUS]` self-inflicted mortal wounds are not shown.
- `Deadly Demise X` is mined but not surfaced.
- A random `[RAPID FIRE]` value (e.g. `D3`) adds its average as flat attack dice.
