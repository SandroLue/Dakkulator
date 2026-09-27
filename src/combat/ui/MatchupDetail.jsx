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

const SUMMED = [
	"attacks",
	"declaredAttacks",
	"hits",
	"wounds",
	"mortalWounds",
	"failedSaves",
	"rawDamage",
];

/** Column totals over the counted weapons (alternatives are not counted). */
function sumWeapons(weapons) {
	const total = {};
	for (const key of SUMMED) {
		total[key] = weapons.reduce((sum, w) => sum + (w[key] ?? 0), 0);
	}
	return total;
}

const COLUMNS = [
	["Weapon", weaponLabel],
	["Attacks", (w) => format(w.declaredAttacks ?? w.attacks)],
	["Hits", (w) => format(w.hits)],
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

/** Explains why the columns don't simply multiply down from the attacks. */
function HowToRead() {
	return (
		<div className="group relative">
			<button
				type="button"
				aria-label="How to read this table"
				aria-describedby="breakdown-help"
				className="button-small flex h-7 w-7 items-center justify-center rounded-full p-0"
			>
				<svg
					viewBox="0 0 24 24"
					aria-hidden="true"
					className="h-4 w-4"
					fill="none"
					stroke="currentColor"
					strokeWidth="2.2"
					strokeLinecap="round"
				>
					<circle cx="12" cy="12" r="9" />
					<path d="M12 11v5M12 7.5v.01" />
				</svg>
			</button>
			<div
				id="breakdown-help"
				role="tooltip"
				className="absolute right-0 top-full z-50 mt-2 hidden w-96 max-w-[90vw] flex-col gap-2 rounded-lg border border-line-strong bg-surface-raised px-4 py-3 text-sm shadow-lg shadow-black/40 group-focus-within:flex group-hover:flex"
			>
				<div className="font-bold">How to read this table</div>
				<p>
					Every number is an <b>average</b> over all possible dice rolls, so
					fractions are normal.
				</p>
				<p>
					<b>Attacks</b> is the weapon's full number of attacks. <b>Hits</b> and
					the columns after it only count dice rolled while the target is still
					alive: once the unit is likely wiped out, the remaining attacks do
					nothing. That's why hits can be lower than attacks × the hit chance.
				</p>
				<p>
					<b>Hits</b> include [SUSTAINED HITS] extra hits. <b>Wounds</b> are
					successful wound rolls, including [LETHAL HITS]. <b>Mortal</b> is the
					part of those wounds that became mortal wounds through [DEVASTATING
					WOUNDS] and skips the save.
				</p>
				<p>
					<b>Damage</b> is what the unsaved and mortal wounds inflict.{" "}
					<b>Wounds lost</b> is what the target actually loses after damage
					beyond one model is wasted and Feel No Pain. With several weapons,
					each row shows what that weapon adds on top of the ones above it. The
					total matches the results matrix.
				</p>
			</div>
		</div>
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
				<div className="print-display-none ml-auto flex items-center gap-2">
					{onTogglePin && (
						<button
							type="button"
							className="button-small"
							aria-pressed={pinned}
							onClick={onTogglePin}
						>
							{pinned ? "Unpin from comparison" : "Pin to compare"}
						</button>
					)}
					<HowToRead />
				</div>
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
