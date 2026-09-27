import { useMemo } from "react";
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
import { MetricSelect } from "./MetricSelect";
import { AXIS, GRID, SERIES_COLORS, TOOLTIP } from "./charts";
import { METRICS, format, formatMetric } from "./metrics";

const colorOf = (index) => SERIES_COLORS[index % SERIES_COLORS.length];
const BAR_HEIGHT_PX = 36;

/**
 * @param {Array} items `{ key, label, pairing }` for every pinned pairing
 * @param {string} metric the metric picked in the results matrix
 */
export function ComparisonPanel({
	items,
	metric,
	onMetricChange,
	onUnpin,
	onClear,
}) {
	const { label, get, suffix = "" } = METRICS[metric];
	// "∞" rounds to clear has no bar length, so it is drawn empty and labelled.
	const bars = useMemo(
		() =>
			items.map((item, index) => {
				const value = get(item.pairing.totals);
				return {
					label: item.label,
					value: Number.isFinite(value) ? value : 0,
					text: formatMetric(metric, item.pairing.totals),
					color: colorOf(index),
				};
			}),
		[items, metric, get],
	);

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
				<MetricSelect
					value={metric}
					onChange={onMetricChange}
					className="print-display-none ml-auto text-sm"
				/>
				<button
					type="button"
					className="button-ghost button-small print-display-none"
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
							{Object.entries(METRICS).map(([key, m]) => (
								<th
									key={key}
									title={m.label}
									className={`${headClass} ${key === metric ? "text-primary" : ""}`}
								>
									{m.short}
								</th>
							))}
							<th className={`${headClass} print-display-none`} />
						</tr>
					</thead>
					<tbody>
						{items.map((item, index) => (
							<tr key={item.key} className="hover:bg-surface-muted">
								<td className={cellClass}>
									<span
										className="mr-2 inline-block h-2.5 w-2.5 rounded-full"
										style={{ background: colorOf(index) }}
									/>
									{item.label}
								</td>
								{Object.keys(METRICS).map((key) => (
									<td
										key={key}
										className={`${cellClass} ${key === metric ? "font-bold" : ""}`}
									>
										{formatMetric(key, item.pairing.totals)}
									</td>
								))}
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
						))}
					</tbody>
				</table>
			</div>

			<div className="flex flex-col gap-1">
				<div className="section-label">{label}</div>
				<div style={{ height: bars.length * BAR_HEIGHT_PX + 40 }}>
					<ResponsiveContainer width="100%" height="100%">
						<BarChart
							data={bars}
							layout="vertical"
							margin={{ top: 4, right: 56, bottom: 8, left: 8 }}
						>
							<CartesianGrid {...GRID} horizontal={false} />
							<XAxis
								type="number"
								tickFormatter={(value) => `${format(value, 0)}${suffix}`}
								{...AXIS}
							/>
							<YAxis
								type="category"
								dataKey="label"
								width={260}
								interval={0}
								{...AXIS}
							/>
							<Tooltip
								{...TOOLTIP}
								formatter={(value, _name, entry) => [entry.payload.text, label]}
							/>
							<Bar dataKey="value" isAnimationActive={false}>
								{bars.map((bar) => (
									<Cell key={bar.label} fill={bar.color} />
								))}
								<LabelList
									dataKey="text"
									position="right"
									fill="var(--color-text)"
								/>
							</Bar>
						</BarChart>
					</ResponsiveContainer>
				</div>
			</div>
		</div>
	);
}
