import { useState } from "react";
import {
	EFFECT_LABELS,
	NUMERIC_EFFECTS,
	STAT_EFFECTS,
	STRENGTH_VS_TOUGHNESS_LABEL,
	createModifier,
	describeModifier,
	modifierLabel,
	normalizeModifier,
	parseKeywords,
} from "../modifiers";
import { REROLL_OPTIONS, Segmented, Toggle } from "./controls";

const STEPS = [-3, -2, -1, 0, 1, 2, 3];
// Hit and wound rolls can never be modified by more than 1 either way.
const ROLL_STEPS = [-1, 0, 1];
const ROLL_EFFECTS = new Set(["hitModifier", "woundModifier"]);
const THRESHOLDS = [2, 3, 4, 5, 6];
const CRIT_THRESHOLDS = [2, 3, 4, 5];
/** "Attacker" / "Defender" for a stored list, which follows the swap button. */
const sideOf = (list, attackerList) =>
	list === "any"
		? "Both armies"
		: list === attackerList
			? "Attacker"
			: "Defender";
// Only abilities that change the calculation are worth granting.
const GRANTABLE_ABILITIES = [
	"LETHAL HITS",
	"DEVASTATING WOUNDS",
	"TWIN-LINKED",
	"LANCE",
	"HEAVY",
	"IGNORES COVER",
	"TORRENT",
	"PSYCHIC",
	...["SUSTAINED HITS", "RAPID FIRE", "MELTA", "BLAST", "CLEAVE"].flatMap(
		(name) => ["1", "2", "D3"].map((value) => `${name} ${value}`),
	),
];

function parseAbilityList(text) {
	const raw = String(text ?? "");
	const bracketed = [...raw.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]);
	const tokens = bracketed.length ? bracketed : raw.split(/[,;]/);
	return [
		...new Set(tokens.map((t) => t.trim().toUpperCase()).filter(Boolean)),
	];
}

function Field({ label, hint, group = false, children }) {
	// Segmented buttons must not sit in a <label>: clicking the text would press the first one.
	const Tag = group ? "div" : "label";
	return (
		<Tag className="flex min-w-0 flex-col gap-1">
			<span className="font-semibold">
				{label} {hint && <span className="hint">{hint}</span>}
			</span>
			{children}
		</Tag>
	);
}

function ChipSelect({ selected, options, onChange, label, placeholder }) {
	const remaining = options.filter((option) => !selected.includes(option));

	return (
		<div className="flex flex-wrap items-center gap-1.5">
			{selected.map((item) => (
				<Toggle
					key={item}
					pressed
					onChange={() => onChange(selected.filter((i) => i !== item))}
					aria-label={`Remove ${item}`}
					className="button-small"
				>
					{item} ×
				</Toggle>
			))}
			<select
				value=""
				aria-label={label}
				onChange={(e) =>
					e.target.value && onChange([...selected, e.target.value])
				}
				disabled={!remaining.length}
				className="min-w-0 flex-1"
			>
				<option value="">{placeholder}</option>
				{remaining.map((option) => (
					<option key={option} value={option}>
						{option}
					</option>
				))}
			</select>
		</div>
	);
}

function AbilitySelect({ value, onChange, opponentKeywords }) {
	const [threshold, setThreshold] = useState(4);
	const selected = parseAbilityList(value);
	const update = (next) => onChange(next.map((a) => `[${a}]`).join(", "));

	return (
		<div className="flex flex-col gap-1.5">
			<ChipSelect
				selected={selected}
				options={GRANTABLE_ABILITIES}
				onChange={update}
				label="Add weapon ability"
				placeholder={selected.length ? "+ another ability…" : "+ add ability…"}
			/>
			<div className="flex items-center gap-1.5">
				<select
					value=""
					aria-label="Add ANTI keyword"
					onChange={(e) =>
						e.target.value &&
						update([...selected, `ANTI-${e.target.value} ${threshold}+`])
					}
					disabled={!opponentKeywords.length}
					className="min-w-0 flex-1"
				>
					<option value="">+ ANTI-keyword…</option>
					{opponentKeywords.map((keyword) => (
						<option key={keyword} value={keyword}>
							ANTI-{keyword}
						</option>
					))}
				</select>
				<select
					value={threshold}
					aria-label="ANTI threshold"
					onChange={(e) => setThreshold(Number(e.target.value))}
				>
					{THRESHOLDS.map((t) => (
						<option key={t} value={t}>
							{t}+
						</option>
					))}
				</select>
			</div>
		</div>
	);
}

function ModifierEditor({
	modifier,
	onChange,
	onDone,
	onDuplicate,
	onDelete,
	unitNames,
	listNames,
	attackerList,
	keywords,
	abilityText,
}) {
	const set = (key, value) => onChange({ ...modifier, [key]: value });
	const units =
		modifier.list === "any"
			? [...new Set([...unitNames.A, ...unitNames.B])]
			: unitNames[modifier.list] || [];
	const unitOptions =
		modifier.unitName && !units.includes(modifier.unitName)
			? [modifier.unitName, ...units]
			: units;
	// The opponent of a list-A unit is always list B, whether attacking or defending.
	const opponentKeywords = {
		A: keywords.B,
		B: keywords.A,
		any: [...new Set([...keywords.A, ...keywords.B])].sort(),
	}[modifier.list];
	const attacking = modifier.role === "attacking";
	const ownKeywords =
		modifier.list === "any"
			? [...new Set([...keywords.A, ...keywords.B])].sort()
			: keywords[modifier.list] || [];
	const thresholdField = (key, label, options) => (
		<Field key={key} label={label}>
			<select
				value={modifier[key] ?? ""}
				onChange={(e) => set(key, e.target.value || null)}
			>
				<option value="">—</option>
				{options.map((t) => (
					<option key={t} value={t}>
						{t}+
					</option>
				))}
			</select>
		</Field>
	);

	return (
		<div className="flex flex-col gap-4 rounded-lg border border-line-strong bg-surface-muted p-4">
			{abilityText && (
				<div className="whitespace-pre-line rounded-md border-l-4 border-accent bg-surface px-3 py-2 text-sm">
					<div className="section-label pb-1">{modifier.name}</div>
					{/* Roster texts mark keywords as **BOLD**; odd split parts are the bold ones. */}
					{abilityText.split(/\*\*(.+?)\*\*/g).map((part, index) =>
						index % 2 ? (
							// biome-ignore lint/suspicious/noArrayIndexKey: static split of one string
							<b key={index}>{part}</b>
						) : (
							part
						),
					)}
				</div>
			)}
			<div className="hint">{describeModifier(modifier)}</div>
			<div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
				<Field label="Ability">
					<input
						type="text"
						value={modifier.name}
						placeholder="e.g. Stand Vigil"
						onChange={(e) => set("name", e.target.value)}
					/>
				</Field>
				<Field label="Army">
					<select
						value={modifier.list}
						onChange={(e) =>
							onChange({ ...modifier, list: e.target.value, unitName: "" })
						}
					>
						{[attackerList, attackerList === "A" ? "B" : "A"].map((list) => (
							<option key={list} value={list}>
								{sideOf(list, attackerList)} — {listNames[list]}
							</option>
						))}
						<option value="any">Both armies</option>
					</select>
				</Field>
				<Field label="Unit">
					<select
						value={modifier.unitName}
						onChange={(e) => set("unitName", e.target.value)}
					>
						<option value="">Every unit</option>
						{unitOptions.map((name) => (
							<option key={name} value={name}>
								{name}
							</option>
						))}
					</select>
					{modifier.unitName && (
						<Toggle
							pressed={modifier.ownModelsOnly}
							onChange={(value) => set("ownModelsOnly", value)}
							title="On: only this unit's own models, not the unit it leads or joins"
							className="mt-1 self-start"
						>
							Only its own models
						</Toggle>
					)}
				</Field>
				<Field label="Applies when the unit is" group>
					<Segmented
						label="Applies when the unit is"
						value={modifier.role}
						options={[
							["attacking", "Attacking"],
							["defending", "Being attacked"],
						]}
						onChange={(value) => set("role", value)}
					/>
				</Field>
				<Field label="Phase" group>
					<Segmented
						label="Phase"
						value={modifier.phase}
						options={[
							["any", "Both"],
							["shooting", "Shooting"],
							["fight", "Fight"],
						]}
						onChange={(value) => set("phase", value)}
					/>
				</Field>
				<Field label="Only vs keywords" group>
					<ChipSelect
						selected={parseKeywords(modifier.vsKeywords)}
						options={opponentKeywords}
						onChange={(next) => set("vsKeywords", next.join(", "))}
						label="Add keyword"
						placeholder={
							modifier.vsKeywords.trim()
								? "+ another keyword…"
								: "Every unit — add keyword…"
						}
					/>
				</Field>
				<Field label="Not vs keywords" group>
					<ChipSelect
						selected={parseKeywords(modifier.excludeVsKeywords)}
						options={opponentKeywords}
						onChange={(next) => set("excludeVsKeywords", next.join(", "))}
						label="Not vs keywords"
						placeholder={
							modifier.excludeVsKeywords.trim()
								? "+ another keyword…"
								: "Add keyword…"
						}
					/>
				</Field>
				<Field label="Only weapons named or with">
					<input
						type="text"
						value={modifier.weaponFilter}
						placeholder="e.g. Solitaire, PSYCHIC, TORRENT"
						onChange={(e) => set("weaponFilter", e.target.value)}
					/>
				</Field>
				{[
					["unitKeywords", "Only units with"],
					["excludeUnitKeywords", "Not units with"],
				].map(([key, label]) => (
					<Field key={key} label={label} group>
						<ChipSelect
							selected={parseKeywords(modifier[key])}
							options={ownKeywords}
							onChange={(next) => set(key, next.join(", "))}
							label={label}
							placeholder={
								modifier[key].trim() ? "+ another keyword…" : "Add keyword…"
							}
						/>
					</Field>
				))}
				<Field label="Only if Strength vs Toughness" group>
					<Segmented
						label="Only if Strength vs Toughness"
						value={modifier.strengthVsToughness}
						options={[
							["", "Always"],
							...Object.entries(STRENGTH_VS_TOUGHNESS_LABEL).map(
								([mode, sign]) => [mode, `S ${sign} T`],
							),
						]}
						onChange={(value) => set("strengthVsToughness", value)}
					/>
				</Field>
			</div>

			<div className="flex flex-col gap-3 border-t border-line pt-4">
				<span className="section-label">Effects</span>
				<div className="hint">
					From the attacker's point of view: on a defensive modifier, −1 Hit
					roll makes the unit harder to hit and −1 AP worsens incoming AP.
					Toughness, Save and Wounds change the attacked models: +1 Save is a
					better save.
				</div>
				<div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4 lg:grid-cols-7">
					{NUMERIC_EFFECTS[modifier.role].map((key) => (
						<Field key={key} label={EFFECT_LABELS[key]}>
							<select
								value={modifier[key]}
								onChange={(e) => set(key, Number(e.target.value))}
							>
								{(ROLL_EFFECTS.has(key) ? ROLL_STEPS : STEPS).map((step) => (
									<option key={step} value={step}>
										{step > 0 ? `+${step}` : step}
									</option>
								))}
							</select>
						</Field>
					))}
					{/* The attacked models' own characteristics: the target's, or this unit's. */}
					{Object.entries(STAT_EFFECTS).map(([key, label]) => (
						<Field key={key} label={attacking ? `Target ${label}` : label}>
							<select
								value={modifier[key]}
								onChange={(e) => set(key, Number(e.target.value))}
							>
								{STEPS.map((step) => (
									<option key={step} value={step}>
										{step > 0 ? `+${step}` : step}
									</option>
								))}
							</select>
						</Field>
					))}
				</div>
				{attacking ? (
					<div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
						{[
							["rerollHits", "Re-roll hits"],
							["rerollWounds", "Re-roll wounds"],
						].map(([key, label]) => (
							<Field key={key} label={label} group>
								<Segmented
									label={label}
									value={modifier[key]}
									options={REROLL_OPTIONS}
									onChange={(value) => set(key, value)}
								/>
							</Field>
						))}
						<Field label="Weapon abilities" group>
							<AbilitySelect
								value={modifier.weaponAbilities}
								onChange={(value) => set("weaponAbilities", value)}
								opponentKeywords={opponentKeywords}
							/>
						</Field>
						{thresholdField("critHitOn", "Critical hits on", CRIT_THRESHOLDS)}
						{thresholdField(
							"critWoundOn",
							"Critical wounds on",
							CRIT_THRESHOLDS,
						)}
						<div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-3">
							{[
								[
									"ignoreHitModifiers",
									"Ignore negative BS/WS and hit modifiers",
								],
								["ignoreWoundModifiers", "Ignore negative wound modifiers"],
								["rerollDamage", "Re-roll damage"],
							].map(([key, label]) => (
								<Toggle
									key={key}
									pressed={modifier[key]}
									onChange={(value) => set(key, value)}
								>
									{label}
								</Toggle>
							))}
						</div>
					</div>
				) : (
					<div className="grid grid-cols-2 items-end gap-x-6 gap-y-4 sm:grid-cols-4 lg:grid-cols-7">
						{thresholdField("fnp", "FNP", THRESHOLDS)}
						{thresholdField("invuln", "Invulnerable", THRESHOLDS)}
						{thresholdField("mortalFnp", "FNP vs mortal wounds", THRESHOLDS)}
						{thresholdField("psychicFnp", "FNP vs psychic attacks", THRESHOLDS)}
						<div className="col-span-2 flex flex-wrap gap-2 sm:col-span-4 lg:col-span-5">
							{[
								["cover", "Benefit of cover"],
								["halveDamage", "Halve damage"],
								["damageToOne", "Damage becomes 1"],
							].map(([key, label]) => (
								<Toggle
									key={key}
									pressed={modifier[key]}
									onChange={(value) => set(key, value)}
								>
									{label}
								</Toggle>
							))}
						</div>
					</div>
				)}
			</div>
			<div className="flex flex-wrap gap-2 border-t border-line pt-4">
				<button type="button" className="button-primary" onClick={onDone}>
					Done
				</button>
				<button type="button" onClick={onDuplicate}>
					Duplicate
				</button>
				<button
					type="button"
					className="button-danger ml-auto"
					onClick={onDelete}
				>
					Delete
				</button>
			</div>
		</div>
	);
}

/**
 * Lets the user express datasheet, faction and stratagem effects themselves,
 * so the engine never has to interpret ability text.
 */
export function ModifierBuilder({
	modifiers,
	onChange,
	unitNames,
	listNames,
	keywords = { A: [], B: [] },
	abilityTexts = new Map(),
	abilities = { attacker: [], defender: [] },
	attackerList = "A",
	// The modifiers read from the lists' abilities, which Reset goes back to.
	defaults = () => [],
}) {
	const [editingId, setEditingId] = useState(null);
	// Resetting replaces the user's own work, so it asks first.
	const [confirmReset, setConfirmReset] = useState(false);

	const replace = (next) =>
		onChange(
			modifiers.map((m) => (m.id === next.id ? normalizeModifier(next) : m)),
		);
	const add = (template = {}) => {
		const modifier = createModifier(template);
		onChange([...modifiers, modifier]);
		setEditingId(modifier.id);
	};
	const remove = (id) => {
		onChange(modifiers.filter((other) => other.id !== id));
		setEditingId(null);
	};
	// "Captain", "INFANTRY, MOUNTED units", "Every unit except MONSTER"
	const unitScope = (m) => {
		if (m.unitName) return m.unitName;
		const only = m.unitKeywords.trim();
		const not = m.excludeUnitKeywords.trim();
		return `${only ? `${only} units` : "Every unit"}${not ? ` except ${not}` : ""}`;
	};
	const scopeLabel = (m) => {
		const list = sideOf(m.list, attackerList);
		return m.unitName ? `${list} · ${m.unitName}` : `${list} · every unit`;
	};
	// A modifier for a unit the list does not have (any more) stays stored but hidden.
	const present = (m) => {
		if (!m.unitName) return true;
		const names =
			m.list === "any"
				? [...(unitNames.A || []), ...(unitNames.B || [])]
				: unitNames[m.list] || [];
		return names.includes(m.unitName);
	};
	const visible = modifiers.filter(present);
	const active = visible.filter((m) => m.enabled).length;
	const editing = modifiers.find((m) => m.id === editingId);
	const defenderList = attackerList === "A" ? "B" : "A";
	// An ability counts as applied once a modifier of that name covers its list;
	// "Martial Ka'tah – Dacatarai Stance" covers "Martial Ka'tah".
	const missingFor = (names, list) => {
		const named = new Set(
			visible
				.filter((m) => m.list === list || m.list === "any")
				.map((m) => m.name.split(" – ")[0].trim().toLowerCase()),
		);
		return names.filter((name) => !named.has(name.toLowerCase()));
	};
	const sides = [
		{
			role: "attacking",
			label: "Attacker",
			list: attackerList,
			names: missingFor(abilities.attacker, attackerList),
		},
		{
			role: "defending",
			label: "Defender",
			list: defenderList,
			names: missingFor(abilities.defender, defenderList),
		},
	];
	// Attacker and defender stay apart; "Both armies" modifiers get their own group.
	const groups = [
		...sides.map((side) => ({
			...side,
			title: `${side.label}${listNames?.[side.list] ? ` · ${listNames[side.list]}` : ""}`,
			modifiers: visible.filter((m) => m.list === side.list),
		})),
		{
			role: "any",
			title: "Both armies",
			names: [],
			modifiers: visible.filter((m) => m.list === "any"),
		},
	].filter((group) => group.modifiers.length || group.names.length);

	return (
		<section className="panel text-sm">
			<div className="panel-header">
				<span className="panel-title">Modifiers</span>
				<span className="badge">
					{active}/{visible.length} active
				</span>
				<button
					type="button"
					className="button-primary button-small ml-auto"
					onClick={() => add()}
				>
					+ Add modifier
				</button>
				{confirmReset ? (
					<span className="inline-flex items-center gap-1">
						<span className="hint">
							Replace all {modifiers.length} with the ones read from the lists?
						</span>
						<button
							type="button"
							className="button-small button-danger"
							onClick={() => {
								onChange(defaults());
								setEditingId(null);
								setConfirmReset(false);
							}}
						>
							Reset
						</button>
						<button
							type="button"
							className="button-small"
							onClick={() => setConfirmReset(false)}
						>
							Cancel
						</button>
					</span>
				) : (
					<button
						type="button"
						className="button-small"
						title="Go back to the modifiers read from the lists' abilities"
						onClick={() => setConfirmReset(true)}
					>
						Reset
					</button>
				)}
			</div>
			<div className="flex flex-col gap-4 p-4">
				{groups.map((group) => (
					// Modifiers first, then the abilities not built yet (dashed, with +).
					<div key={group.role} className="flex flex-col gap-2">
						<span className="section-label">{group.title}</span>
						{/* Equal-width cards: the name, and below it the unit it applies to. */}
						{group.modifiers.length > 0 && (
							<div className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-2">
								{group.modifiers.map((m) => {
									const label = modifierLabel(m);
									const isEditing = editingId === m.id;
									return (
										<span key={m.id} className="flex min-w-0">
											<Toggle
												pressed={m.enabled}
												onChange={(enabled) => replace({ ...m, enabled })}
												title={`${scopeLabel(m)} — ${describeModifier(m)}`}
												className="min-w-0 flex-1 justify-start rounded-r-none text-left"
											>
												<span className="flex min-w-0 flex-col leading-tight">
													{/* "Martial Ka'tah – Dacatarai Stance": the option tells them apart. */}
													<span className="truncate">
														{label.includes(" – ")
															? label.split(" – ")[1]
															: label}
													</span>
													<span className="hint truncate">
														{label.includes(" – ") &&
															`${label.split(" – ")[0]} · `}
														{unitScope(m)}
													</span>
												</span>
											</Toggle>
											<button
												type="button"
												aria-label={`Edit ${label}`}
												aria-expanded={isEditing}
												title="Edit"
												onClick={() => setEditingId(isEditing ? null : m.id)}
												className={`rounded-l-none rounded-r-full border-l-0 px-2.5 ${
													isEditing
														? "border-accent bg-accent-soft text-accent"
														: ""
												}`}
											>
												<svg
													viewBox="0 0 24 24"
													aria-hidden="true"
													className="h-3.5 w-3.5"
													fill="none"
													stroke="currentColor"
													strokeWidth="2.2"
													strokeLinecap="round"
													strokeLinejoin="round"
												>
													<path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" />
												</svg>
											</button>
										</span>
									);
								})}
							</div>
						)}
						<div className="flex flex-wrap items-center gap-2">
							{group.names.map((name) => (
								<button
									type="button"
									key={name}
									className="button-small button-ghost rounded-full border-dashed border-line-strong"
									title={`Add a modifier for ${name} (${group.label.toLowerCase()})`}
									onClick={() =>
										add({ name, list: group.list, role: group.role })
									}
								>
									+ {name}
								</button>
							))}
						</div>
					</div>
				))}
				{editing && (
					<ModifierEditor
						modifier={editing}
						onChange={replace}
						onDone={() => setEditingId(null)}
						onDuplicate={() => add(editing)}
						onDelete={() => remove(editing.id)}
						unitNames={unitNames}
						listNames={listNames}
						attackerList={attackerList}
						keywords={keywords}
						abilityText={abilityTexts.get(editing.name.trim().toLowerCase())}
					/>
				)}
			</div>
		</section>
	);
}
