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
- `Feel No Pain X+` (§24.12) is rolled **per wound** that would be lost.

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

- **Ignore modifiers (§02.02.02):** `[PSYCHIC]` may drop any modifier, so the
  engine drops only the detrimental ones.
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
| `shareState.js`                           | share-link encoding (§4.4)                                            |
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
rawDamage    = failedSaves × E[D]
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

### 3.5 Metrics

| Metric             | Definition                                               |
| ------------------ | -------------------------------------------------------- |
| Attacks            | attack dice gathered                                     |
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
| Rounds to clear    | expected: total wounds ÷ wounds lost; Monte-Carlo median |

### 3.6 Context — `defaultContext()`

```js
{
  phase: "shooting" | "fight",
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
  useLethalHits: true,        // [LETHAL HITS] is optional
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
surfaces as warnings.

`mineUnitAbilities(unit)` reads `Feel No Pain X+` (a qualified "… against …"
Feel No Pain is not applied), `Damaged: X-Y wounds remaining`, `Stealth`,
`Fights First`, `Lone Operative` and `Deadly Demise X` from the unit's abilities
and rules. Anything else is listed in the UI as not modelled.

Attacker profiles map each model to its stat line with `getNameMatchScore`,
prefer the weapon's own BS/WS, and collapse a weapon's firing modes to the
strongest profile; the others are reported as `unusedWeaponProfiles`.

Defender allocation groups are ordered worst save first, leaders last (§05.03).

### 4.2 Attached units — [src/combat/attach.js](../src/combat/attach.js)

Rosters do not record which leader joined which unit, so the picker offers every
bodyguard named in a leader's `Leader` ability. The merged unit pools weapons,
keywords and points, keeps Feel No Pain and points tied to their source models,
and resolves the leader's allocation group last.

### 4.3 User-built modifiers — [src/combat/modifiers.js](../src/combat/modifiers.js)

Unit-, faction-, detachment- and stratagem-specific ability text is **not**
interpreted. The user builds each effect as a plain-JSON modifier:

- **Scope:** list A / B / both, optionally one unit (a leader's name covers its
  attached unit); role (attacking / defending); phase; "only vs keywords".
- **Effects:** BS/WS, hit, wound, AP, Strength, Attacks, Damage; re-rolls;
  granted weapon abilities in datasheet syntax; ignore negative hit modifiers;
  defensively Feel No Pain, invulnerable save, benefit of cover.

Roll modifiers from every source share the ±1 cap. Modifiers are built in
`ui/ModifierBuilder.jsx` and persisted in `localStorage` under `modifiers`; the
breakdown lists those applied to a pairing.

### 4.4 Share links — [src/combat/shareState.js](../src/combat/shareState.js)

"Copy share link" encodes the selection, attachments, `ctx`, direction and
modifiers in `#share=`. Rosters are not included; the selection is restored once
rosters with the same names are loaded. Shared modifiers are merged in and the
recipient's own are switched off, never deleted.

### 4.5 Army lists and comparison

- Army lists live in [src/library/](../src/library/): one upload area (several
  files at once) and a table of saved lists; List A / List B select from it.
- "Pin to compare" adds a pairing to the comparison panel (key metrics plus
  overlaid "destroyed by round" curves). Swapping roles or changing a list
  clears the pins.

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
| other `*.test.js`                | parsing, profiles, modifiers, attachment, share links, library                         |

A rule change in the engine must also be made in `oracle.js`.

---

## 6. Known limitations

- Each allocation group uses its own T; §19.02 (highest bodyguard T for the whole
  attached unit) is not applied.
- No choice of target statline: groups always use the defender-optimal order.
- `[PRECISION]` is parsed but not applied.
- `[HAZARDOUS]` self-inflicted mortal wounds are not shown.
- `Deadly Demise X` is mined but not surfaced.
- A random `[RAPID FIRE]` value (e.g. `D3`) adds its average as flat attack dice.
- Pinned pairings are not part of the share link.
