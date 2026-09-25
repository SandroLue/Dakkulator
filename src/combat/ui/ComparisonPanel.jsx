import { useMemo } from "react";
import {
	CartesianGrid,
	Legend,
	Line,
	LineChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import {
	AXIS,
	GRID,
	SERIES_COLORS,
	TOOLTIP,
	axisLabel,
	percent,
} from "./charts";
import { useSimulations } from "./useSimulation";

const format = (value, digits = 2) =>
	Number.isFinite(value) ? value.toFixed(digits) : "∞";

const colorOf = (index) => SERIES_COLORS[index % SERIES_COLORS.length];
// Recharts reads dots in a string dataKey as a path, so unit names cannot be keys.
const seriesKey = (index) => `p${index}`;

/**
 * @param {Array} items `{ key, label, pairing }` for every pinned pairing
 */
export function ComparisonPanel({ items, onUnpin, onClear }) {
	const pairings = useMemo(() => items.map((item) => item.pairing), [items]);
	const simulations = useSimulations(pairings, { trials: 10000, seed: 1 });

	const curve = useMemo(() => {
		if (!simulations) return null;
		const rounds = Math.max(
			0,
			...simulations.map((s) => s.result?.clearedBy.length ?? 0),
		);
		return Array.from({ length: rounds }, (_, round) => {
			const point = { round: round + 1 };
			for (const [index, sim] of simulations.entries()) {
				const p = sim.result?.clearedBy[round];
				if (p !== undefined) point[seriesKey(index)] = p;
			}
			return point;
		});
	}, [simulations]);

	const cellClass = "border border-line px-3 py-2";
	const headClass = `section-label ${cellClass} bg-surface-muted text-left`;

	return (
		<div className="panel flex flex-col gap-4 p-4">
			<div className="flex flex-wrap items-center gap-3">
				<span className="panel-title">Comparison</span>
				<span className="hint">
					{items.length < 2
						? "Pin another pairing from its breakdown to compare them."
						: "Pinned pairings, resolved with the current settings."}
				</span>
				<button
					type="button"
					className="button-ghost button-small print-display-none ml-auto"
					onClick={onClear}
				>
					Unpin all
				</button>
			</div>

			<div className="overflow-x-auto">
				<table className="w-full border-collapse text-sm">
					<thead>
						<tr>
							<th className={headClass}>Pairing</th>
							<th className={headClass}>Wounds lost</th>
							<th className={headClass}>Models slain</th>
							<th className={headClass}>Points killed</th>
							<th className={headClass}>Expected rounds</th>
							<th className={headClass}>P(destroyed)</th>
							<th className={headClass}>Median rounds</th>
							<th className={`${headClass} print-display-none`} />
						</tr>
					</thead>
					<tbody>
						{items.map((item, index) => {
							const { totals } = item.pairing;
							const sim = simulations?.[index];
							return (
								<tr key={item.key} className="hover:bg-surface-muted">
									<td className={cellClass}>
										<span
											className="mr-2 inline-block h-2.5 w-2.5 rounded-full"
											style={{ background: colorOf(index) }}
										/>
										{item.label}
									</td>
									<td className={cellClass}>{format(totals.woundsLost)}</td>
									<td className={cellClass}>{format(totals.modelsSlain)}</td>
									<td className={cellClass}>
										{format(totals.pointsKilled, 0)}
									</td>
									<td className={cellClass}>
										{format(totals.roundsToClear, 1)}
									</td>
									<td className={cellClass}>
										{sim?.result
											? percent(sim.result.pDestroyed)
											: (sim?.error ?? "…")}
									</td>
									<td className={cellClass}>
										{sim?.result
											? (sim.result.medianRounds ??
												`> ${sim.result.clearedBy.length}`)
											: "…"}
									</td>
									<td className={`${cellClass} print-display-none`}>
										<button
											type="button"
											className="button-ghost button-small"
											onClick={() => onUnpin(item.key)}
										>
											Unpin
										</button>
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>

			<div className="flex flex-col gap-1">
				<div className="section-label">Unit destroyed by round</div>
				<div style={{ height: 260 }}>
					{curve ? (
						<ResponsiveContainer width="100%" height="100%">
							<LineChart
								data={curve}
								margin={{ top: 4, right: 16, bottom: 16, left: 8 }}
							>
								<CartesianGrid {...GRID} />
								<XAxis dataKey="round" {...AXIS} label={axisLabel("Round")} />
								<YAxis
									tickFormatter={percent}
									domain={[0, 1]}
									width={48}
									{...AXIS}
								/>
								<Tooltip
									{...TOOLTIP}
									cursor={{ stroke: "var(--color-border-strong)" }}
									formatter={(value) => percent(value)}
									labelFormatter={(value) => `By the end of round ${value}`}
								/>
								<Legend verticalAlign="top" />
								{items.map((item, index) => (
									<Line
										key={item.key}
										dataKey={seriesKey(index)}
										name={item.label}
										stroke={colorOf(index)}
										strokeWidth={2}
										dot={{ r: 3 }}
										isAnimationActive={false}
									/>
								))}
							</LineChart>
						</ResponsiveContainer>
					) : (
						<div className="hint">Running Monte-Carlo…</div>
					)}
				</div>
			</div>
		</div>
	);
}
