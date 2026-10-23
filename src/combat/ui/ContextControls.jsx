import { Fragment } from "react";
import { defaultContext, sustainedHitsValue } from "../index";
import {
	ComboBox,
	PanelToggle,
	REROLL_OPTIONS,
	Segmented,
	Toggle,
	collapsibleHeader,
	usePanelOpen,
} from "./controls";

// `on`: starts switched on, so the user only turns off what does not apply.
const TOGGLE_GROUPS = [
	{
		label: "Helps the attacker",
		toggles: [
			{
				key: "withinHalfRange",
				label: "Within half range",
				on: true,
			},
			{
				key: "remainedStationary",
				label: "Remained stationary",
				on: true,
			},
			{
				key: "charged",
				label: "Charged this turn",
				on: true,
			},
			// Off by default: it needs tall terrain, and it would hide other bonuses
			// like [HEAVY] once a weapon already hits on 2+.
			{ key: "plungingFire", label: "Plunging fire" },
		],
	},
	{
		label: "Hinders the attacker",
		toggles: [
			{ key: "targetInCover", label: "Target in cover" },
			{
				key: "attackerDamaged",
				label: "Attacker is Damaged",
			},
			{
				key: "indirect",
				label: "Shooting indirectly",
			},
			{
				key: "indirectSpotted",
				label: "…and spotted",
				requires: "indirect",
			},
		],
	},
	{
		label: "Optional rules",
		toggles: [
			// §24.23 — [LETHAL HITS] is optional; pressed means the context key is off.
			{
				key: "useLethalHits",
				label: "Opt out of [LETHAL HITS]",
				invert: true,
			},
		],
	},
];

export function bestCaseContext() {
	return defaultContext({
		phase: "combined",
		...Object.fromEntries(
			TOGGLE_GROUPS.flatMap((group) => group.toggles)
				.filter((t) => t.on)
				.map((t) => [t.key, true]),
		),
	});
}

const OFF_ON = [
	[false, "Off"],
	[true, "On"],
];

/**
 * "Apply to all", in the order the dice are rolled: each step's modifier,
 * re-roll and abilities together.
 */
/** `[value, label]` for every whole step from `min` to `max`: "−1", "0", "+1"… */
const signedRange = (min, max) =>
	Array.from({ length: max - min + 1 }, (_, i) => {
		const value = min + i;
		return [value, value > 0 ? `+${value}` : value < 0 ? `−${-value}` : "0"];
	});

/** "N+" rolls, best first; 0 for none. */
const THRESHOLDS = [[0, "None"], ...[2, 3, 4, 5, 6].map((n) => [n, `${n}+`])];

const APPLY_STEPS = [
	{
		title: "Hits",
		fields: [
			{ key: "rerollHits", label: "Re-roll", kind: "reroll" },
			{ key: "allLethalHits", label: "Lethal Hits", kind: "switch" },
			{
				key: "skillModifier",
				label: "BS / WS",
				kind: "select",
				options: signedRange(-2, 2),
			},
			// Hit and wound roll modifiers are capped at ±1 by the rules.
			{
				key: "hitModifier",
				label: "Hit roll",
				kind: "select",
				options: signedRange(-1, 1),
			},
			// No rules maximum: datasheets print 1 to 3 or D3, but X can be anything.
			{
				key: "allSustainedHits",
				label: "Sustained Hits",
				kind: "combo",
				suggestions: ["0", "1", "2", "3", "D3", "2D3", "D6", "2D6"],
			},
		],
	},
	{
		title: "Wounds",
		fields: [
			{ key: "rerollWounds", label: "Re-roll", kind: "reroll" },
			{
				key: "allDevastatingWounds",
				label: "Devastating Wounds",
				kind: "switch",
			},
			{
				key: "woundModifier",
				label: "Wound roll",
				kind: "select",
				options: signedRange(-1, 1),
			},
		],
	},
	{
		title: "Saves & damage",
		fields: [
			{
				key: "apModifier",
				label: "AP",
				kind: "select",
				options: signedRange(-2, 3),
			},
			// The defender's own, if better, still counts.
			{
				key: "allInvuln",
				label: "Invulnerable",
				kind: "select",
				options: THRESHOLDS,
			},
			{
				key: "allFnp",
				label: "Feel No Pain",
				kind: "select",
				options: THRESHOLDS,
			},
			// −1 is the common "reduce Damage by 1"; a result never drops below 1.
			{
				key: "damageModifier",
				label: "Damage",
				kind: "select",
				options: signedRange(-2, 2),
			},
		],
	},
];

const SHOOTING_ICON = (
	<>
		<circle cx="12" cy="12" r="8" />
		<circle cx="12" cy="12" r="1.5" fill="currentColor" />
		<path d="M12 1v5M12 18v5M1 12h5M18 12h5" />
	</>
);
const FIGHT_ICON = (
	<path d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2M14.5 6.5 18 3h3v3l-3.5 3.5M5 14l4 4M7 17l-3 3M3 19l2 2" />
);

const PHASES = [
	{
		key: "combined",
		label: "Shooting + Fight",
		icons: [SHOOTING_ICON, FIGHT_ICON],
	},
	{ key: "shooting", label: "Shooting", icons: [SHOOTING_ICON] },
	{ key: "fight", label: "Fight", icons: [FIGHT_ICON] },
];

export const phaseLabel = (key) =>
	PHASES.find((p) => p.key === key)?.label ?? key;

export function PhaseTabs({ phase, onChange, controls }) {
	return (
		<div role="tablist" aria-label="Phase" className="phase-tabs">
			{PHASES.map((p) => (
				<button
					key={p.key}
					type="button"
					role="tab"
					aria-selected={phase === p.key}
					aria-controls={controls}
					onClick={() => onChange(p.key)}
				>
					{p.icons.map((icon, index) => (
						<svg
							// biome-ignore lint/suspicious/noArrayIndexKey: fixed, static list
							key={index}
							viewBox="0 0 24 24"
							aria-hidden="true"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							{icon}
						</svg>
					))}
					{p.label}
				</button>
			))}
		</div>
	);
}

// Three columns; the toggles sit two to a row in equal cells.
const COLUMNS = "grid gap-x-8 gap-y-6 md:grid-cols-3";
const PAIR = "grid grid-cols-2 gap-2.5";
const FILL_TOGGLE =
	"min-h-9 w-full items-center justify-center text-center leading-tight";

function ApplyField({ id, field, value, onChange }) {
	if (field.kind === "select") {
		return (
			<select
				id={id}
				value={value ?? 0}
				onChange={(e) => onChange(Number(e.target.value))}
				className="control-centered h-9 w-full"
			>
				{field.options.map(([option, label]) => (
					<option key={option} value={option}>
						{label}
					</option>
				))}
			</select>
		);
	}
	if (field.kind === "combo") {
		// Typed as is, so "D" can become "D3"; empty (shown as "0") means off.
		const text = value ? String(value) : "";
		const invalid = text !== "" && text !== "0" && !sustainedHitsValue(text);
		return (
			<ComboBox
				id={id}
				value={text}
				// Off shows the "0" placeholder; mark that option as the current one.
				selected={text || "0"}
				suggestions={field.suggestions}
				placeholder="0"
				// "0" and empty are both off, stored as the default 0 so Reset sees it.
				onChange={(next) => {
					const trimmed = next.trim();
					onChange(trimmed === "" || trimmed === "0" ? 0 : trimmed);
				}}
				aria-invalid={invalid}
				title={invalid ? "A number or dice, like 2 or D3" : undefined}
				className={`control-centered h-9 w-full ${invalid ? "border-danger" : ""}`}
			/>
		);
	}
	return (
		<Segmented
			label={field.label}
			value={field.kind === "switch" ? Boolean(value) : value}
			options={field.kind === "switch" ? OFF_ON : REROLL_OPTIONS}
			onChange={onChange}
			className="segmented-fill"
		/>
	);
}

export function ContextControls({ ctx, onChange }) {
	const [open, setOpen] = usePanelOpen("apply-to-all");
	const set = (key, value) => onChange({ ...ctx, [key]: value });
	// The phase has its own tabs, so a reset keeps it.
	const defaults = { ...bestCaseContext(), phase: ctx.phase };
	const isDefault = Object.keys(defaults).every(
		(key) => ctx[key] === defaults[key],
	);

	return (
		<div className="panel text-sm">
			<div {...collapsibleHeader(open, setOpen)}>
				<PanelToggle
					open={open}
					onToggle={setOpen}
					controls="apply-to-all-panel"
				>
					Apply to all
				</PanelToggle>
				<button
					type="button"
					className="button-small ml-auto"
					title="Back to the best-case defaults"
					onClick={() => onChange(defaults)}
					disabled={isDefault}
				>
					Reset
				</button>
			</div>

			{open && (
				<div id="apply-to-all-panel" className="flex flex-col gap-8 p-5">
					{/* One column per group: helps, hinders, optional rules. */}
					<div className={COLUMNS}>
						{TOGGLE_GROUPS.map((group) => (
							<div key={group.label} className={`${PAIR} content-start`}>
								{group.toggles
									.filter((toggle) => !toggle.requires || ctx[toggle.requires])
									.map((toggle) => (
										<Toggle
											key={toggle.key}
											pressed={
												toggle.invert ? !ctx[toggle.key] : ctx[toggle.key]
											}
											onChange={(value) =>
												set(toggle.key, toggle.invert ? !value : value)
											}
											className={FILL_TOGGLE}
										>
											{toggle.label}
										</Toggle>
									))}
							</div>
						))}
					</div>

					<div className={COLUMNS}>
						{APPLY_STEPS.map((step) => (
							<div
								key={step.title}
								// One label width everywhere, so every control starts on the same line.
								className="grid grid-cols-[9.5rem_minmax(0,1fr)] content-start items-center gap-x-3 gap-y-2.5 rounded-lg border border-line bg-surface-muted p-3"
							>
								<span className="col-span-2 border-b border-line pb-2 text-xs font-semibold uppercase tracking-wide text-muted">
									{step.title}
								</span>
								{step.fields.map((field) => (
									<Fragment key={field.key}>
										<label
											htmlFor={`apply-${field.key}`}
											className="truncate font-semibold"
										>
											{field.label}
										</label>
										<ApplyField
											id={`apply-${field.key}`}
											field={field}
											value={ctx[field.key]}
											onChange={(value) => set(field.key, value)}
										/>
									</Fragment>
								))}
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
