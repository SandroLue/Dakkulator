import {
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	LabelList,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { formatDiceExpr } from "../diceExpr";
import { AXIS, GRID, TOOLTIP, axisLabel, percent } from "./charts";
import { useSimulation } from "./useSimulation";

const ROUNDS_CAP = 10;

const format = (value, digits = 2) =>
	Number.isFinite(value) ? value.toFixed(digits) : "∞";

const describeGroup = (group) =>
	group
		? `${group.name} ×${group.count} — T${group.toughness} Sv${group.save}${
				group.invuln ? `/${String(group.invuln).trim()}+` : ""
			} W${group.wounds}${group.fnp ? ` · FNP ${group.fnp}+` : ""}`
		: "—";

function weaponLabel(w) {
	const profile = String(w.weaponName ?? "").replace(/^[➤▸▶>*\s]+/, "");
	const selection = w.selectionName;
	if (!selection || profile.toLowerCase().startsWith(selection.toLowerCase())) {
		return profile || selection;
	}
	return (
		<>
			{profile}
			<div className="text-xs text-muted">{selection}</div>
		</>
	);
}

const COLUMNS = [
	["Weapon", weaponLabel],
	["Attacks", (w) => format(w.declaredAttacks ?? w.attacks)],
	["Hits", (w) => format(w.hits)],
	["Wounds", (w) => format(w.wounds)],
	["Mortal", (w) => format(w.mortalWounds)],
	["Failed saves", (w) => format(w.failedSaves)],
	["Damage", (w) => format(w.rawDamage)],
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
			<td className="border border-line px-3 py-2 text-xs text-muted">
				{weapon.detail.autoHit ? "auto-hit" : `hit ${weapon.detail.hitTarget}+`}{" "}
				· wound {weapon.detail.woundTarget}+ · save{" "}
				{weapon.detail.saveTarget >= 7
					? "none"
					: `${weapon.detail.saveTarget}+`}{" "}
				· D {formatDiceExpr(weapon.detail.damage)}
			</td>
		</tr>
	);
}

export function MatchupDetail({
	pairing,
	rowCells = [],
	pinned = false,
	onTogglePin,
}) {
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
				No weapons for this pairing in the {pairing?.phase} phase.
			</div>
		);
	}

	const groups = pairing.groups || [];
	const multiGroup =
		new Set(pairing.weapons.map((w) => w.groupIndex ?? 0)).size > 1;
	const chartData = simulation?.histogram;
	const clearData = simulation?.clearedBy.map((probability, index) => ({
		round: index + 1,
		probability,
	}));
	const roundsData = rowCells.map((cell) => {
		const rounds = cell.totals.roundsToClear;
		return {
			name: cell.defenderName,
			rounds: Number.isFinite(rounds)
				? Math.min(rounds, ROUNDS_CAP)
				: ROUNDS_CAP,
			label: Number.isFinite(rounds) ? rounds.toFixed(1) : "never",
			selected: cell === pairing,
		};
	});

	return (
		<div className="panel flex flex-col gap-4 p-4">
			<div className="flex flex-wrap items-start gap-3">
				<div className="flex flex-col gap-1">
					<div className="panel-title">
						{pairing.attackerName} <span className="text-accent">→</span>{" "}
						{pairing.defenderName}
					</div>
					<div className="text-sm text-muted">
						<span className="capitalize">{pairing.phase}</span> ·{" "}
						{groups.length > 1
							? `${groups.length} allocation groups, in the order the defender must use`
							: describeGroup(groups[0])}
					</div>
				</div>
				{onTogglePin && (
					<button
						type="button"
						className="button-small print-display-none ml-auto"
						aria-pressed={pinned}
						onClick={onTogglePin}
					>
						{pinned ? "Unpin from comparison" : "Pin to compare"}
					</button>
				)}
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

			<div className="overflow-x-auto">
				<table className="w-full border-collapse text-sm">
					<thead>
						<tr>
							{COLUMNS.map(([label]) => (
								<th
									key={label}
									className="section-label border border-line bg-surface-muted px-3 py-2 text-left"
								>
									{label}
								</th>
							))}
							{multiGroup && (
								<th className="section-label border border-line bg-surface-muted px-3 py-2 text-left">
									Target
								</th>
							)}
							<th className="section-label border border-line bg-surface-muted px-3 py-2 text-left">
								Rolls
							</th>
						</tr>
					</thead>
					<tbody>
						{pairing.weapons.map((weapon, index) => (
							<WeaponRow
								key={`${weapon.weaponName}-${index}`}
								weapon={weapon}
								groups={groups}
								multiGroup={multiGroup}
							/>
						))}
						{pairing.alternatives?.length > 0 && (
							<tr>
								<td
									colSpan={COLUMNS.length + (multiGroup ? 2 : 1)}
									className="section-label border border-line bg-surface-muted px-3 py-2"
								>
									Alternative profiles — not counted in the totals
								</td>
							</tr>
						)}
						{pairing.alternatives?.map((weapon, index) => (
							<WeaponRow
								key={`alt-${weapon.weaponName}-${index}`}
								weapon={weapon}
								groups={groups}
								multiGroup={multiGroup}
								muted
							/>
						))}
					</tbody>
				</table>
			</div>

			<div className="grid gap-4 md:grid-cols-2">
				<div className="flex flex-col gap-4">
					{!simulation && (
						<div className="hint">
							{simulationError
								? `Monte-Carlo failed: ${simulationError}`
								: "Running Monte-Carlo…"}
						</div>
					)}
					<div className="flex flex-col gap-1">
						<div className="section-label">Wounds lost in one round</div>
						<div style={{ height: 220 }}>
							{chartData && (
								<ResponsiveContainer width="100%" height="100%">
									<BarChart
										data={chartData}
										margin={{ top: 4, right: 8, bottom: 16, left: 8 }}
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
											labelFormatter={(value) => `${value} wounds lost`}
										/>
										<Bar
											dataKey="probability"
											fill="var(--primary-color)"
											radius={[3, 3, 0, 0]}
											isAnimationActive={false}
										/>
									</BarChart>
								</ResponsiveContainer>
							)}
						</div>
					</div>
					<div className="flex flex-col gap-1">
						<div className="section-label">Unit destroyed by round</div>
						<div style={{ height: 220 }}>
							{clearData && (
								<ResponsiveContainer width="100%" height="100%">
									<BarChart
										data={clearData}
										margin={{ top: 4, right: 8, bottom: 16, left: 8 }}
									>
										<CartesianGrid {...GRID} vertical={false} />
										<XAxis
											dataKey="round"
											{...AXIS}
											label={axisLabel("Round")}
										/>
										<YAxis
											tickFormatter={percent}
											domain={[0, 1]}
											width={48}
											{...AXIS}
										/>
										<Tooltip
											{...TOOLTIP}
											formatter={(value) => [percent(value), "Destroyed"]}
											labelFormatter={(value) => `By the end of round ${value}`}
										/>
										<Bar
											dataKey="probability"
											fill="var(--color-accent)"
											radius={[3, 3, 0, 0]}
											isAnimationActive={false}
										/>
									</BarChart>
								</ResponsiveContainer>
							)}
						</div>
					</div>
				</div>
				{roundsData.length > 1 && (
					<div className="flex flex-col gap-1">
						<div className="section-label">
							Expected rounds to clear — {pairing.attackerName} vs each target
						</div>
						<div style={{ height: Math.max(120, roundsData.length * 28 + 40) }}>
							<ResponsiveContainer width="100%" height="100%">
								<BarChart
									data={roundsData}
									layout="vertical"
									margin={{ top: 4, right: 40, bottom: 16, left: 8 }}
								>
									<CartesianGrid {...GRID} horizontal={false} />
									<XAxis
										type="number"
										domain={[0, ROUNDS_CAP]}
										ticks={[0, 2, 4, 6, 8, 10]}
										{...AXIS}
										label={axisLabel(`Rounds (capped at ${ROUNDS_CAP})`)}
									/>
									<YAxis
										type="category"
										dataKey="name"
										width={130}
										interval={0}
										{...AXIS}
									/>
									<Tooltip
										{...TOOLTIP}
										formatter={(_value, _name, item) => [
											item.payload.label,
											"Expected rounds",
										]}
									/>
									<Bar
										dataKey="rounds"
										fill="var(--primary-color)"
										radius={[0, 3, 3, 0]}
										isAnimationActive={false}
									>
										<LabelList
											dataKey="label"
											position="right"
											fill="var(--color-muted)"
											fontSize={12}
										/>
										{roundsData.map((entry, index) => (
											<Cell
												key={`${entry.name}-${index}`}
												fill={
													entry.selected
														? "var(--color-accent)"
														: "var(--primary-color)"
												}
											/>
										))}
									</Bar>
								</BarChart>
							</ResponsiveContainer>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
