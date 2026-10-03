import { useEffect, useMemo, useState } from "react";
import { getUnitTotalModels } from "../profiles";
import { MetricSelect } from "./MetricSelect";
import { METRICS, formatValue } from "./metrics";

// Higher is better and never negative; also the sort score.
function goodness(value, lowerIsBetter) {
	if (value === undefined || Number.isNaN(value)) return 0;
	if (!lowerIsBetter) return Math.max(0, value);
	return value > 0 && Number.isFinite(value) ? 1 / value : 0;
}

/**
 * `grid[row][col]` = `{ value, score, share, unarmed }`; `unarmed` marks an
 * attacker with no weapons in this phase, which is not the same as failing.
 */
function buildGrid(matchup, metric) {
	const { get, share, lowerIsBetter = false } = METRICS[metric];
	return matchup.rows.map((row) =>
		row.cells.map((cell, col) => {
			if (!cell.weapons.length) {
				return {
					value: Number.NaN,
					score: 0,
					share: Number.NaN,
					unarmed: true,
				};
			}
			const value = get(cell.totals);
			return {
				value,
				score: goodness(value, lowerIsBetter),
				share: share(cell.totals, row.attacker, matchup.defenderUnits[col]),
				unarmed: false,
			};
		}),
	);
}

const byScoreDesc = (a, b) =>
	a.score === b.score ? 0 : a.score < b.score ? 1 : -1;

/**
 * Red at 0 → yellow at 50% → green at 100%, getting lighter all the way, so the
 * order also reads without telling red from green. Text turns dark on the light
 * half, where it contrasts better than light text.
 */
function shareColors(share) {
	if (Number.isNaN(share)) return {};
	const t = Math.max(0, Math.min(1, share));
	return {
		backgroundColor: `hsl(${Math.round(110 * t)}, 40%, ${22 + 24 * t}%)`,
		color: t >= 0.5 ? "var(--primary-ink)" : undefined,
	};
}

// Column widths come from CSS (`--matrix-name`, `--matrix-cell`), narrower on phones.
const NAME_COLUMN = "var(--matrix-name)";
const CELL = "var(--matrix-cell)";
const HEADER_BUTTON =
	"block w-full cursor-pointer rounded-none border-0 bg-transparent px-3 py-2 text-left font-normal hover:bg-[#ffffff14] focus-visible:-outline-offset-2";

const TIP_WIDTH_PX = 256;
const TIP_GAP_PX = 6;

// Fixed positioning, because the table's scroll container would clip an absolute tooltip.
function tipPosition(rect, placement) {
	const maxLeft = window.innerWidth - TIP_WIDTH_PX - 8;
	return placement === "right"
		? {
				left: Math.min(rect.right + TIP_GAP_PX, maxLeft),
				top: rect.top,
			}
		: { left: Math.min(rect.left, maxLeft), top: rect.bottom + TIP_GAP_PX };
}

function HeaderTip({ tip }) {
	if (!tip) return null;
	return (
		<div
			role="tooltip"
			id="matrix-header-tip"
			className="pointer-events-none fixed z-50 flex flex-col gap-1 rounded-lg border border-line-strong bg-surface-raised px-3 py-2 text-sm shadow-lg shadow-black/40"
			style={{ ...tip.position, width: TIP_WIDTH_PX }}
		>
			<div className="font-bold leading-snug">{tip.name}</div>
			<div className="text-muted">
				{tip.points ?? 0} pts · {tip.models}{" "}
				{tip.models === 1 ? "model" : "models"}
			</div>
			<div className="border-t border-line pt-1 text-xs text-muted">
				Click to sort the matrix by this unit
			</div>
		</div>
	);
}

function SortableHeader({
	unit,
	active,
	onClick,
	arrow,
	placement,
	onTip,
	showPoints,
}) {
	const show = (event) =>
		onTip({
			name: unit.name,
			points: unit.cost?.points,
			models: getUnitTotalModels(unit),
			position: tipPosition(
				event.currentTarget.getBoundingClientRect(),
				placement,
			),
		});
	const hide = () => onTip(null);
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={active}
			aria-describedby="matrix-header-tip"
			onMouseEnter={show}
			onFocus={show}
			onMouseLeave={hide}
			onBlur={hide}
			className={HEADER_BUTTON}
		>
			<div className={`truncate font-bold ${active ? "text-primary" : ""}`}>
				{active && `${arrow} `}
				{unit.name}
			</div>
			{showPoints && <div className="hint">{unit.cost?.points ?? 0} pts</div>}
		</button>
	);
}

export function ResultsMatrix({
	matchup,
	selectedCell,
	onSelectCell,
	metric,
	onMetricChange,
}) {
	const [tip, setTip] = useState(null);
	// A fixed tooltip would drift away from its header on scroll.
	useEffect(() => {
		if (!tip) return;
		const hide = () => setTip(null);
		window.addEventListener("scroll", hide, true);
		return () => window.removeEventListener("scroll", hide, true);
	}, [tip]);
	// null | { by: defender column index, desc }
	const [rowSort, setRowSort] = useState(null);
	// null | { by: attacker row index, desc }
	const [colSort, setColSort] = useState(null);
	// Unit costs only matter to the points-based metrics.
	const showPoints = Boolean(METRICS[metric].usesPoints);
	const grid = useMemo(() => buildGrid(matchup, metric), [matchup, metric]);

	const toggleSort = (by) => (current) =>
		current?.by === by ? { by, desc: !current.desc } : { by, desc: true };

	const rows = useMemo(() => {
		// Keep the original row index so the drill-down keeps pointing at the
		// right pairing even when rows are re-ordered.
		// "Descending" always means best first.
		const indexed = matchup.rows.map((row, index) => ({
			row,
			index,
			score: grid[index][rowSort?.by]?.score ?? 0,
		}));
		if (rowSort) {
			const sign = rowSort.desc ? 1 : -1;
			indexed.sort((a, b) => sign * byScoreDesc(a, b));
		}
		return indexed;
	}, [matchup, grid, rowSort]);

	const columns = useMemo(() => {
		const sortRow = colSort ? grid[colSort.by] : null;
		const indexed = matchup.defenderUnits.map((unit, index) => ({
			unit,
			index,
			score: sortRow?.[index]?.score ?? 0,
		}));
		if (sortRow) {
			const sign = colSort.desc ? 1 : -1;
			indexed.sort((a, b) => sign * byScoreDesc(a, b));
		}
		return indexed;
	}, [matchup, grid, colSort]);

	return (
		<div className="panel overflow-hidden">
			<div className="print-display-none flex items-center gap-3 px-4 pt-3 text-sm">
				<MetricSelect value={metric} onChange={onMetricChange} />
				{(rowSort || colSort) && (
					<button
						type="button"
						className="button-small ml-auto"
						onClick={() => {
							setRowSort(null);
							setColSort(null);
						}}
					>
						Reset sort
					</button>
				)}
			</div>
			{/* Padding outside the scroll box: inside it, cells would scroll past the sticky names.
			    The names cast a shadow, so columns visibly slide underneath them. */}
			<div className="p-4">
				<div className="overflow-x-auto">
					<table
						// Separate borders move with the sticky cells; collapsed ones stay behind and leave gaps.
						className="table-fixed border-separate border-spacing-0 text-sm"
						style={{
							width: `calc(${NAME_COLUMN} + ${matchup.defenderUnits.length} * ${CELL})`,
						}}
					>
						<colgroup>
							<col style={{ width: NAME_COLUMN }} />
							{columns.map(({ unit, index }) => (
								<col key={`${unit.name}-${index}`} style={{ width: CELL }} />
							))}
						</colgroup>
						<thead>
							<tr>
								{/* The pickers above already name the sides. */}
								<th className="sticky left-0 z-20 border border-line bg-surface-muted p-0 shadow-[6px_0_8px_-4px_#000c]" />
								{columns.map(({ unit, index }) => (
									<th
										key={`${unit.name}-${index}`}
										className="border-y border-r border-line bg-surface-muted p-0 text-left"
									>
										<SortableHeader
											showPoints={showPoints}
											unit={unit}
											active={rowSort?.by === index}
											arrow={rowSort?.desc ? "▼" : "▲"}
											placement="below"
											onTip={setTip}
											onClick={() => setRowSort(toggleSort(index))}
										/>
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{rows.map(({ row, index: rowIndex }) => (
								<tr key={`${row.attacker.name}-${rowIndex}`}>
									{/* Sticky, so attacker names stay visible while scrolling sideways. */}
									<th className="sticky left-0 z-10 border-x border-b border-line bg-surface-muted p-0 text-left shadow-[6px_0_8px_-4px_#000c]">
										<SortableHeader
											showPoints={showPoints}
											unit={row.attacker}
											active={colSort?.by === rowIndex}
											arrow={colSort?.desc ? "▶" : "◀"}
											placement="right"
											onTip={setTip}
											onClick={() => setColSort(toggleSort(rowIndex))}
										/>
									</th>
									{columns.map(({ index: colIndex }) => {
										const cell = row.cells[colIndex];
										const value = grid[rowIndex][colIndex];
										const isSelected =
											selectedCell?.row === rowIndex &&
											selectedCell?.col === colIndex;
										const shown = value.unarmed
											? "—"
											: formatValue(metric, value.value);
										const detail = METRICS[metric].detail?.(
											cell.totals,
											row.attacker,
											matchup.defenderUnits[colIndex],
										);
										return (
											// `h-px` lets the button fill the row, which the name column can make taller;
											// the hover shade sits on the cell for the same reason.
											<td
												key={`${cell.defenderName}-${colIndex}`}
												style={shareColors(value.share)}
												title={
													value.unarmed
														? "No weapons in this phase"
														: `${METRICS[metric].label}: ${shown}${detail ? ` (${detail} removed)` : ""} · ${Math.round(value.share * 100)}% of ${METRICS[metric].full}`
												}
												className={`h-px border-b border-r p-0 hover:shadow-[inset_0_0_0_999px_#ffffff14] ${
													isSelected
														? "outline outline-2 -outline-offset-2 outline-ink"
														: ""
												} border-line`}
											>
												<button
													type="button"
													onClick={() =>
														onSelectCell({ row: rowIndex, col: colIndex })
													}
													className="block h-full w-full cursor-pointer rounded-none border-0 bg-transparent px-3 py-2.5 text-center font-normal text-inherit focus-visible:-outline-offset-2"
												>
													<b
														className={`text-base ${value.unarmed ? "font-normal text-muted" : ""}`}
													>
														{shown}
													</b>
												</button>
											</td>
										);
									})}
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</div>
			<HeaderTip tip={tip} />
		</div>
	);
}
