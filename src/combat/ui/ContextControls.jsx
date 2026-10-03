import { defaultContext } from "../index";
import { REROLL_OPTIONS, Segmented, Toggle } from "./controls";

// `on`: starts switched on, so the user only turns off what does not apply.
const TOGGLE_GROUPS = [
	{
		label: "Helps the attacker",
		toggles: [
			{
				key: "withinHalfRange",
				label: "Within half range",
				hint: "[RAPID FIRE], [MELTA]",
				on: true,
			},
			{
				key: "remainedStationary",
				label: "Remained stationary",
				hint: "[HEAVY]",
				on: true,
			},
			{
				key: "charged",
				label: "Charged this turn",
				hint: "[LANCE]",
				on: true,
			},
			{ key: "plungingFire", label: "Plunging fire", hint: "+1 BS", on: true },
		],
	},
	{
		label: "Hinders the attacker",
		toggles: [
			{ key: "targetInCover", label: "Target in cover", hint: "−1 BS" },
			{
				key: "attackerDamaged",
				label: "Attacker is Damaged",
				hint: "−1 to hit",
			},
			{
				key: "indirect",
				label: "Shooting indirectly",
				hint: "[INDIRECT FIRE] hits on 6s, no re-rolls",
			},
			{
				key: "indirectSpotted",
				label: "…and spotted",
				hint: "hits on 4+ instead",
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
				hint: "critical hits roll to wound",
				invert: true,
			},
		],
	},
];

const APPLY_TO_ALL = [
	{ key: "allLethalHits", label: "[LETHAL HITS]" },
	{ key: "allDevastatingWounds", label: "[DEVASTATING WOUNDS]" },
];

const SUSTAINED_OPTIONS = [
	[0, "Off"],
	[1, "1"],
	[2, "2"],
	[3, "3"],
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

/** What the numbers currently assume, as short phrases. */
function assumptions(ctx) {
	const phrases = [];
	for (const toggle of TOGGLE_GROUPS.flatMap((group) => group.toggles)) {
		if (toggle.requires && !ctx[toggle.requires]) continue;
		const active = toggle.invert ? !ctx[toggle.key] : ctx[toggle.key];
		if (active) phrases.push(toggle.label);
	}
	for (const toggle of APPLY_TO_ALL) {
		if (ctx[toggle.key]) phrases.push(`${toggle.label} on every weapon`);
	}
	if (ctx.allSustainedHits > 0) {
		phrases.push(`[SUSTAINED HITS ${ctx.allSustainedHits}] on every weapon`);
	}
	for (const modifier of MODIFIERS) {
		const value = ctx[modifier.key];
		if (value)
			phrases.push(`${value > 0 ? "+" : ""}${value} ${modifier.label}`);
	}
	for (const reroll of REROLLS) {
		const mode = ctx[reroll.key];
		if (mode && mode !== "none") {
			phrases.push(`${reroll.label} ${mode === "ones" ? "of 1" : "(all)"}`);
		}
	}
	return phrases;
}

/** One line under the phase tabs, so the assumptions behind the numbers are never hidden. */
export function AssumptionsLine({ ctx, onEdit }) {
	const phrases = assumptions(ctx);
	return (
		<p className="hint -mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
			<span>
				<b className="font-semibold">Assuming:</b>{" "}
				{phrases.length ? phrases.join(", ") : "no battlefield bonuses"}. Unit
				and faction abilities count only when added as modifiers.
			</span>
			{onEdit && (
				<button
					type="button"
					className="button-small button-ghost print-display-none"
					onClick={onEdit}
				>
					Edit
				</button>
			)}
		</p>
	);
}

const MODIFIERS = [
	{
		key: "skillModifier",
		label: "BS / WS characteristic",
		hint: "+1 improves, uncapped",
	},
	{ key: "hitModifier", label: "Hit roll", hint: "capped to ±1" },
	{ key: "woundModifier", label: "Wound roll", hint: "capped to ±1" },
	{ key: "apModifier", label: "AP", hint: "+1 is one better" },
];

const REROLLS = [
	{ key: "rerollHits", label: "Re-roll hits" },
	{ key: "rerollWounds", label: "Re-roll wounds" },
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

export function ContextControls({ ctx, onChange }) {
	const set = (key, value) => onChange({ ...ctx, [key]: value });
	// The phase has its own tabs, so a reset keeps it.
	const defaults = { ...bestCaseContext(), phase: ctx.phase };
	const isDefault = Object.keys(defaults).every(
		(key) => ctx[key] === defaults[key],
	);

	return (
		<div className="panel text-sm">
			<div className="panel-header">
				<span className="panel-title">Battlefield</span>
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

			<div className="flex flex-col gap-5 p-4">
				<div className="grid gap-5 md:grid-cols-3">
					{TOGGLE_GROUPS.map((group) => (
						<div key={group.label} className="flex flex-col gap-2">
							<span className="section-label">{group.label}</span>
							<div className="flex flex-wrap gap-2">
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
										>
											{toggle.label}
											{toggle.hint && (
												<span className="hint">{toggle.hint}</span>
											)}
										</Toggle>
									))}
							</div>
						</div>
					))}
				</div>

				<div className="flex flex-col gap-2">
					<span className="section-label">
						Apply to all{" "}
						<span className="hint normal-case tracking-normal">
							— every attacking weapon gains these
						</span>
					</span>
					<div className="flex flex-wrap items-center gap-2">
						{APPLY_TO_ALL.map((toggle) => (
							<Toggle
								key={toggle.key}
								pressed={ctx[toggle.key]}
								onChange={(value) => set(toggle.key, value)}
							>
								{toggle.label}
							</Toggle>
						))}
						<div className="flex items-center gap-2">
							<span className="font-semibold">[SUSTAINED HITS]</span>
							<Segmented
								label="Sustained Hits for all weapons"
								value={ctx.allSustainedHits ?? 0}
								options={SUSTAINED_OPTIONS}
								onChange={(value) => set("allSustainedHits", value)}
							/>
						</div>
					</div>
				</div>

				<div className="flex flex-col gap-2">
					<span className="section-label">Modifiers & re-rolls</span>
					<div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3 lg:grid-cols-6">
						{MODIFIERS.map((modifier) => (
							<label key={modifier.key} className="flex flex-col gap-1">
								<span className="font-semibold">{modifier.label}</span>
								<input
									type="number"
									step="1"
									value={ctx[modifier.key] ?? 0}
									onChange={(e) =>
										set(modifier.key, Number(e.target.value) || 0)
									}
									className="w-20"
								/>
								<span className="hint">{modifier.hint}</span>
							</label>
						))}
						{REROLLS.map((reroll) => (
							<div key={reroll.key} className="flex flex-col gap-1">
								<span className="font-semibold">{reroll.label}</span>
								<Segmented
									label={reroll.label}
									value={ctx[reroll.key]}
									options={REROLL_OPTIONS}
									onChange={(value) => set(reroll.key, value)}
								/>
							</div>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}
