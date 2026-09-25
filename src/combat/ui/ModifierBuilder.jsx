import { useState } from "react";
import {
	EFFECT_LABELS,
	NUMERIC_EFFECTS,
	createModifier,
	describeModifier,
	modifierLabel,
	normalizeModifier,
	parseKeywords,
} from "../modifiers";
import { REROLL_OPTIONS, Segmented, Toggle } from "./controls";

const STEPS = [-3, -2, -1, 0, 1, 2, 3];
const THRESHOLDS = [2, 3, 4, 5, 6];
const LIST_TAG = { A: "A", B: "B", any: "A+B" };
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
				<Field label="List">
					<select
						value={modifier.list}
						onChange={(e) =>
							onChange({ ...modifier, list: e.target.value, unitName: "" })
						}
					>
						<option value="A">List A — {listNames.A}</option>
						<option value="B">List B — {listNames.B}</option>
						<option value="any">Both lists</option>
					</select>
				</Field>
				<Field label="Unit" hint="a leader covers its attached unit">
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
				<Field label="Only vs keywords" hint="any of the chosen" group>
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
			</div>

			<div className="flex flex-col gap-3 border-t border-line pt-4">
				<span className="section-label">Effects</span>
				<div className="hint">
					From the attacker's point of view: on a defensive modifier, −1 Hit
					roll makes the unit harder to hit and −1 AP worsens incoming AP.
				</div>
				<div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4 lg:grid-cols-7">
					{NUMERIC_EFFECTS[modifier.role].map((key) => (
						<Field key={key} label={EFFECT_LABELS[key]}>
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
						<div className="sm:col-span-2 lg:col-span-3">
							<Toggle
								pressed={modifier.ignoreHitModifiers}
								onChange={(value) => set("ignoreHitModifiers", value)}
							>
								Ignore negative BS/WS and hit modifiers
							</Toggle>
						</div>
					</div>
				) : (
					<div className="grid grid-cols-2 items-end gap-x-6 gap-y-4 sm:grid-cols-4 lg:grid-cols-7">
						{[
							["fnp", "Feel No Pain"],
							["invuln", "Invulnerable"],
						].map(([key, label]) => (
							<Field key={key} label={label}>
								<select
									value={modifier[key] ?? ""}
									onChange={(e) => set(key, e.target.value || null)}
								>
									<option value="">—</option>
									{THRESHOLDS.map((t) => (
										<option key={t} value={t}>
											{t}+
										</option>
									))}
								</select>
							</Field>
						))}
						<div className="col-span-2">
							<Toggle
								pressed={modifier.cover}
								onChange={(value) => set("cover", value)}
							>
								Benefit of cover
							</Toggle>
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
	abilities = [],
}) {
	const [editingId, setEditingId] = useState(null);

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
	const scopeLabel = (m) => {
		const list = m.list === "any" ? "Both lists" : `List ${m.list}`;
		return m.unitName ? `${list} · ${m.unitName}` : `${list} · every unit`;
	};
	const active = modifiers.filter((m) => m.enabled).length;
	const editing = modifiers.find((m) => m.id === editingId);
	const named = new Set(modifiers.map((m) => m.name.trim().toLowerCase()));
	const missing = abilities.filter((name) => !named.has(name.toLowerCase()));

	return (
		<section className="panel text-sm">
			<div className="panel-header">
				<span className="panel-title">Modifiers</span>
				<span className="badge">
					{active}/{modifiers.length} active
				</span>
				<button
					type="button"
					className="button-primary button-small ml-auto"
					onClick={() => add()}
				>
					+ Add modifier
				</button>
			</div>
			<div className="flex flex-col gap-4 p-4">
				<p className="hint">
					Datasheet, faction and stratagem abilities are not read from the
					roster. Build their effect here and switch it on when it applies.
				</p>
				{missing.length > 0 && (
					<div className="flex flex-wrap items-center gap-1.5">
						<span className="hint">
							Not yet applied from the selected units:
						</span>
						{missing.map((name) => (
							<button
								type="button"
								key={name}
								className="button-small button-ghost rounded-full border-dashed border-line-strong"
								title={`Add a modifier for ${name}`}
								onClick={() => add({ name })}
							>
								+ {name}
							</button>
						))}
					</div>
				)}
				{modifiers.length > 0 && (
					<div className="flex flex-wrap gap-2">
						{modifiers.map((m) => {
							const label = modifierLabel(m);
							const isEditing = editingId === m.id;
							return (
								<span key={m.id} className="inline-flex">
									<Toggle
										pressed={m.enabled}
										onChange={(enabled) => replace({ ...m, enabled })}
										title={`${scopeLabel(m)} — ${describeModifier(m)}`}
										className="rounded-r-none"
									>
										{label}
										<span className="hint">{LIST_TAG[m.list]}</span>
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
				{editing && (
					<ModifierEditor
						modifier={editing}
						onChange={replace}
						onDone={() => setEditingId(null)}
						onDuplicate={() => add(editing)}
						onDelete={() => remove(editing.id)}
						unitNames={unitNames}
						listNames={listNames}
						keywords={keywords}
						abilityText={abilityTexts.get(editing.name.trim().toLowerCase())}
					/>
				)}
			</div>
		</section>
	);
}
