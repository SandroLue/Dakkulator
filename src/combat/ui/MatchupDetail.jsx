import { Fragment } from "react";
import {
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	ReferenceLine,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { abilityLabels } from "../weaponKeywords";
import { phaseLabel } from "./ContextControls";
import {
	AXIS,
	BAR_ANIMATION,
	GRID,
	TOOLTIP,
	axisLabel,
	percent,
} from "./charts";
import { format } from "./metrics";
import { useSimulation } from "./useSimulation";

const describeGroup = (group) =>
	group
		? `${group.name} ×${group.count} — T${group.toughness} Sv${group.save}${
				group.invuln ? `/${String(group.invuln).trim()}+` : ""
			} W${group.wounds}${group.fnp ? ` · FNP ${group.fnp}+` : ""}`
		: "—";

/** The weapon's abilities; granted ones (modifiers, "apply to all") are marked. */
function WeaponAbilities({ weapon }) {
	if (!weapon.abilities) return null;
	const own = new Set(abilityLabels(weapon.baseAbilities ?? weapon.abilities));
	const labels = abilityLabels(weapon.abilities);
	const unknown = weapon.abilities.unknown ?? [];
	if (!labels.length && !unknown.length) return null;
	return (
		<div className="mt-1 flex flex-wrap gap-1 not-italic">
			{labels.map((label) =>
				own.has(label) ? (
					<span key={label} className="ability-tag">
						{label}
					</span>
				) : (
					<span
						key={label}
						className="ability-tag ability-tag-granted"
						title="Granted by a modifier or “Apply to all”"
					>
						+ {label}
					</span>
				),
			)}
			{unknown.map((token) => (
				<span
					key={token}
					className="ability-tag ability-tag-unknown"
					title="Not recognised — ignored in the maths"
				>
					{token.toUpperCase()}
				</span>
			))}
		</div>
	);
}

function weaponLabel(w) {
	const profile = String(w.weaponName ?? "").replace(/^[➤▸▶>*\s]+/, "");
	const selection = w.selectionName;
	const showSelection =
		selection && !profile.toLowerCase().startsWith(selection.toLowerCase());
	return (
		<>
			{profile || selection}
			{/* Only set for attached units, where weapons come from several units. */}
			{w.showSource && (
				<div className="text-xs font-semibold text-accent">
					{w.sourceUnitName}
				</div>
			)}
			{showSelection && <div className="text-xs text-muted">{selection}</div>}
			<WeaponAbilities weapon={w} />
		</>
	);
}

const SUMMED = [
	"attacks",
	"declaredAttacks",
	"hits",
	"wounds",
	"mortalWounds",
	"failedSaves",
	"rawDamage",
];

/**
 * Rows for identical profiles (two models with the same Fleshmower, against
 * the same models) as one row, in the order they first appear.
 */
export function groupIdentical(weapons) {
	const rows = new Map();
	for (const w of weapons) {
		const d = w.detail ?? {};
		const key = JSON.stringify([
			w.isMelee,
			w.sourceUnitName,
			w.weaponName,
			w.selectionName,
			w.groupIndex ?? 0,
			abilityLabels(w.abilities ?? {}),
			abilityLabels(w.baseAbilities ?? w.abilities ?? {}),
			d.hitTarget,
			d.woundTarget,
			d.critWoundTarget,
			d.saveTarget,
			d.damage,
		]);
		const row = rows.get(key);
		if (!row) {
			rows.set(key, { ...w });
			continue;
		}
		for (const field of [...SUMMED, "woundsLost"]) {
			row[field] = (row[field] ?? 0) + (w[field] ?? 0);
		}
	}
	return [...rows.values()];
}

/** Column totals over the counted weapons (alternatives are not counted). */
function sumWeapons(weapons) {
	const total = {};
	for (const key of SUMMED) {
		total[key] = weapons.reduce((sum, w) => sum + (w[key] ?? 0), 0);
	}
	return total;
}

// `[label, accessor, hint]`; the hint is the header's tooltip.
const COLUMNS = [
	["Weapon", weaponLabel],
	[
		"Attacks",
		(w) => format(w.declaredAttacks ?? w.attacks),
		"Every attack the weapon makes, as on its datasheet.",
	],
	[
		"Hits",
		(w) => format(w.hits),
		"Counts only attacks resolved while the target is still alive. Attacks that would land after the unit is destroyed are left out, so a weapon that always hits, like [TORRENT], can show fewer hits than attacks.",
	],
	["Wounds", (w) => format(w.wounds)],
	["Mortal", (w) => format(w.mortalWounds)],
	["Failed saves", (w) => format(w.failedSaves)],
	["Damage", (w) => format(w.rawDamage)],
	// After the one-model damage cap, excess damage and Feel No Pain.
	["Wounds lost", (w) => format(w.woundsLost)],
];

function WeaponRow({ weapon, groups, multiGroup, muted = false }) {
	return (
		<tr
			className={`hover:bg-surface-muted ${muted ? "text-muted italic" : ""}`}
		>
			{COLUMNS.map(([label, accessor]) => (
				<td key={label} className="border border-line px-3 py-2">
					{accessor(weapon)}
				</td>
			))}
			{multiGroup && (
				<td className="border border-line px-3 py-2 text-xs text-muted">
					{describeGroup(groups[weapon.groupIndex ?? 0])}
				</td>
			)}
		</tr>
	);
}

const weaponName = (w) => String(w.weaponName ?? "").replace(/^[➤▸▶>*\s]+/, "");

/** The round-one distribution, overkill included, with a bar for every total. */
export function woundsChartData(simulation, unitWounds) {
	const histogram = simulation.potentialHistogram?.length
		? simulation.potentialHistogram
		: simulation.histogram;
	const byValue = new Map(histogram.map((h) => [h.value, h.probability]));
	const top = Math.max(unitWounds, ...histogram.map((h) => h.value));
	return Array.from({ length: top + 1 }, (_, value) => ({
		value,
		probability: byValue.get(value) ?? 0,
		overkill: Math.max(0, value - unitWounds),
	}));
}

/** The pairing's result in plain sentences, one statement per line, before any tables. */
function summarise(pairing) {
	const groups = pairing.groups || [];
	const t = pairing.totals;
	const wounds = groups.reduce((sum, g) => sum + g.count * g.wounds, 0);
	const models = groups.reduce((sum, g) => sum + g.count, 0);
	if (!(t.woundsLost >= 0.05)) {
		return [
			`Barely damages ${pairing.defenderName}: ${format(t.woundsLost, 1)} of ${wounds} wounds per round.`,
		];
	}

	// The weapon that removes the most, when there is more than one. With
	// shooting and fighting combined, say which phase it is used in.
	const combined = pairing.phase === "combined";
	const byWeapon = new Map();
	for (const w of pairing.weapons) {
		const name = weaponName(w);
		const label =
			combined && name
				? `${name} in the ${w.isMelee ? "Fight" : "Shooting"} phase`
				: name;
		byWeapon.set(label, (byWeapon.get(label) || 0) + (w.woundsLost || 0));
	}
	const [top] = [...byWeapon.entries()].sort((a, b) => b[1] - a[1]);
	const mostly = byWeapon.size > 1 && top ? `, mostly with the ${top[0]}` : "";

	const share = Math.round((t.woundsLost / (wounds || 1)) * 100);
	// Wounds and models are separate measures: overkill is lost, and an average
	// of 1.2 models' worth of wounds can still kill fewer models on average.
	return [
		`Removes ${format(t.woundsLost, 1)} of ${wounds} wounds per round (${share}%)${mostly}.`,
		models > 1 &&
			`On average ${format(t.modelsSlain, 1)} of ${models} models die per round.`,
		`Clears it in one round ${Math.round(t.pDestroyed * 100)}% of the time.`,
		Number.isFinite(t.roundsToClear) &&
			`About ${format(t.roundsToClear, 1)} rounds to clear on average.`,
	].filter(Boolean);
}

export function MatchupDetail({ pairing }) {
	const { result: simulation, error: simulationError } = useSimulation(
		pairing,
		{
			trials: 10000,
			seed: 1,
		},
	);

	if (!pairing?.weapons.length) {
		return (
			<div className="panel p-4 text-sm text-muted">
				No weapons for this pairing ({phaseLabel(pairing?.phase)}).
			</div>
		);
	}

	const groups = pairing.groups || [];
	// A leader and its bodyguard: name the unit behind each weapon.
	const sources = new Set(
		[...pairing.weapons, ...(pairing.alternatives || [])].map(
			(w) => w.sourceUnitName,
		),
	);
	// Shooting + Fight: shooting weapons first, then fight, each under a divider.
	const combined = pairing.phase === "combined";
	const weaponRows = groupIdentical(
		combined
			? [...pairing.weapons].sort(
					(a, b) => Number(a.isMelee) - Number(b.isMelee),
				)
			: pairing.weapons,
	);
	const withSource = (weapon) =>
		sources.size > 1 ? { ...weapon, showSource: true } : weapon;
	const multiGroup =
		new Set(pairing.weapons.map((w) => w.groupIndex ?? 0)).size > 1;
	// Every wound total from 0 up, overkill included, so the line for "unit
	// destroyed" has a place even where no trial ended exactly on it.
	const unitWounds = groups.reduce((sum, g) => sum + g.count * g.wounds, 0);
	const chartData = simulation && woundsChartData(simulation, unitWounds);
	// Reaching the line at all is what counts: the chance the unit is destroyed.
	const killChance = (chartData ?? [])
		.filter((d) => d.value >= unitWounds)
		.reduce((sum, d) => sum + d.probability, 0);

	return (
		<div className="panel flex flex-col gap-4 p-4">
			<div className="flex flex-wrap items-start gap-3">
				<div className="flex flex-col gap-1">
					<div className="panel-title">
						{pairing.attackerName} <span className="text-accent">→</span>{" "}
						{pairing.defenderName}
					</div>
					<div className="text-sm text-muted">
						{phaseLabel(pairing.phase)} ·{" "}
						{groups.length > 1
							? `${groups.length} allocation groups, in the order the defender must use`
							: describeGroup(groups[0])}
					</div>
				</div>
			</div>
			<div className="flex flex-col text-base">
				{summarise(pairing).map((line) => (
					<p key={line}>{line}</p>
				))}
			</div>
			{pairing.appliedModifiers?.length > 0 && (
				<div className="flex flex-wrap items-center gap-1.5 text-xs">
					<span className="text-muted">Modifiers applied:</span>
					{[...new Set(pairing.appliedModifiers)].map((name) => (
						<span key={name} className="badge">
							{name}
						</span>
					))}
				</div>
			)}

			{/* The dice maths, for whoever wants to check the numbers. */}
			<details>
				<summary className="section-label cursor-pointer py-1 hover:text-ink">
					Show breakdown
				</summary>
				<div className="overflow-x-auto">
					<table className="w-full border-collapse text-sm">
						<thead>
							<tr>
								{COLUMNS.map(([label, , hint]) => (
									<th
										key={label}
										title={hint}
										className="section-label border border-line bg-surface-muted px-3 py-2 text-left"
									>
										{/* A dotted underline marks headers that explain themselves on hover. */}
										{hint ? (
											<span className="cursor-help underline decoration-dotted underline-offset-4">
												{label}
											</span>
										) : (
											label
										)}
									</th>
								))}
								{multiGroup && (
									<th className="section-label border border-line bg-surface-muted px-3 py-2 text-left">
										Target
									</th>
								)}
							</tr>
						</thead>
						<tbody>
							{weaponRows.map((weapon, index) => (
								<Fragment key={`${weapon.weaponName}-${index}`}>
									{combined &&
										weapon.isMelee !== weaponRows[index - 1]?.isMelee && (
											<>
												{/* A small gap sets each phase apart from what is above it. */}
												<tr>
													<td
														colSpan={COLUMNS.length + (multiGroup ? 1 : 0)}
														className="h-2 border-0 p-0"
													/>
												</tr>
												<tr>
													<td
														colSpan={COLUMNS.length + (multiGroup ? 1 : 0)}
														className="section-label border border-line bg-surface-muted px-3 py-1.5"
													>
														{weapon.isMelee ? "Fight phase" : "Shooting phase"}
													</td>
												</tr>
											</>
										)}
									<WeaponRow
										weapon={withSource(weapon)}
										groups={groups}
										multiGroup={multiGroup}
									/>
								</Fragment>
							))}
							<tr>
								<td className="border border-line px-3 py-2">Total</td>
								{COLUMNS.slice(1).map(([label, accessor]) => (
									<td
										key={label}
										className={`border border-line px-3 py-2 ${
											label === "Wounds lost" ? "font-bold" : ""
										}`}
									>
										{accessor({
											...sumWeapons(pairing.weapons),
											// The exact total, as in the results matrix.
											woundsLost: pairing.totals.woundsLost,
										})}
									</td>
								))}
								{multiGroup && <td className="border border-line px-3 py-2" />}
							</tr>
							{pairing.alternatives?.length > 0 && (
								<tr>
									<td
										colSpan={COLUMNS.length + (multiGroup ? 1 : 0)}
										className="section-label border border-line bg-surface-muted px-3 py-2"
									>
										Alternative profiles — not counted in the totals
									</td>
								</tr>
							)}
							{groupIdentical(pairing.alternatives ?? []).map(
								(weapon, index) => (
									<WeaponRow
										key={`alt-${weapon.weaponName}-${index}`}
										weapon={withSource(weapon)}
										groups={groups}
										multiGroup={multiGroup}
										muted
									/>
								),
							)}
						</tbody>
					</table>
				</div>
			</details>

			<div className="flex flex-col gap-4">
				<div className="flex flex-col gap-1">
					<div className="section-label">Wounds lost in one round</div>
					<div style={{ height: 280 }}>
						{!chartData && (
							<div className="hint flex h-full items-center justify-center">
								{simulationError
									? `Monte-Carlo failed: ${simulationError}`
									: "Running Monte-Carlo…"}
							</div>
						)}
						{chartData && (
							<ResponsiveContainer width="100%" height="100%">
								<BarChart
									data={chartData}
									margin={{ top: 24, right: 8, bottom: 16, left: 8 }}
								>
									<CartesianGrid {...GRID} vertical={false} />
									<XAxis
										dataKey="value"
										{...AXIS}
										label={axisLabel("Wounds lost")}
									/>
									<YAxis tickFormatter={percent} width={48} {...AXIS} />
									<Tooltip
										{...TOOLTIP}
										formatter={(value) => [percent(value), "Probability"]}
										labelFormatter={(value) =>
											value > unitWounds
												? `${value} wounds · ${value - unitWounds} overkill`
												: value === unitWounds
													? `${value} wounds lost · ${value} or more: ${percent(killChance)}`
													: `${value} wounds lost`
										}
									/>
									{/* Past this line the unit is gone: the rest is overkill. */}
									<ReferenceLine
										x={unitWounds}
										stroke="var(--color-muted)"
										strokeDasharray="4 3"
										label={{
											value: `destroyed · ${percent(killChance)}`,
											// Above the plot, so no bar can cover it.
											position: "top",
											fill: "var(--color-muted)",
											fontSize: 11,
										}}
									/>
									<Bar
										dataKey="probability"
										fill="var(--primary-color)"
										radius={[3, 3, 0, 0]}
										{...BAR_ANIMATION}
									>
										{chartData.map((entry) => (
											<Cell
												key={entry.value}
												fillOpacity={entry.overkill > 0 ? 0.4 : 1}
											/>
										))}
									</Bar>
								</BarChart>
							</ResponsiveContainer>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
