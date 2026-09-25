import { useEffect, useMemo, useState } from "react";
import { getUnitTotalModels } from "../profiles";
import { Toggle } from "./controls";

const format = (value, digits = 2) =>
	Number.isFinite(value) ? value.toFixed(digits) : "∞";

const woundShare = (t) =>
	Number.isFinite(t.roundsToClear) && t.roundsToClear > 0
		? 1 / t.roundsToClear
		: 0;

/**
 * `get` sorts rows and fills the cell; `share` colours
 * cells on a fixed 0–1 scale so the colour means the same in every matchup
 * (1 = `full`).
 */
const METRICS = {
	woundsLost: {
		label: "Wounds lost",
		get: (t) => t.woundsLost,
		share: woundShare,
		full: "unit wiped",
	},
	modelsSlain: {
		label: "Models slain",
		get: (t) => t.modelsSlain,
		share: (t, _attacker, defender) =>
			t.modelsSlain / (getUnitTotalModels(defender) || 1),
		full: "unit wiped",
	},
	pointsKilled: {
		label: "Points killed",
		get: (t) => t.pointsKilled,
		digits: 0,
		share: (t, _attacker, defender) =>
			t.pointsKilled / (defender.cost?.points || 1),
		full: "unit wiped",
	},
	damagePer100Points: {
		label: "Efficiency (dmg / 100 pts)",
		get: (t) => t.damagePer100Points,
		digits: 1,
		// Points' worth of wounds dealt, relative to the attacker's own cost.
		share: (t, attacker, defender) =>
			(woundShare(t) * (defender.cost?.points || 0)) /
			(attacker.cost?.points || 1),
		full: "own cost traded",
	},
	pDestroyed: {
		label: "P(unit destroyed)",
		get: (t) => t.pDestroyed * 100,
		digits: 0,
		suffix: "%",
		share: (t) => t.pDestroyed,
		full: "certain kill",
	},
	roundsToClear: {
		label: "Rounds to clear",
		get: (t) => t.roundsToClear,
		digits: 1,
		lowerIsBetter: true,
		share: woundShare,
		full: "cleared in one round",
	},
};

// Scores can be ±Infinity (never cleared), so plain subtraction would give NaN.
const byScoreDesc = (a, b) =>
	a.score === b.score ? 0 : a.score < b.score ? 1 : -1;

/** Neutral → yellow at 50% → Ork green at 100%. */
function shareColor(share) {
	if (!(share > 0)) return "transparent";
	const t = Math.min(1, share);
	const k = Math.max(0, t - 0.5) * 2;
	return `hsla(${48 + 40 * k}, ${95 - 45 * k}%, 55%, ${0.08 + 0.57 * t})`;
}

const LEGEND = `linear-gradient(90deg, ${shareColor(0.01)}, ${shareColor(0.5)}, ${shareColor(1)})`;
const NAME_COLUMN_REM = 10;
const CELL_REM = 6.5;
const HEADER_BUTTON =
	"block w-full cursor-pointer rounded-none border-0 bg-transparent px-3 py-2 text-left font-normal hover:bg-[#ffffff14]";

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

function SortableHeader({ unit, active, onClick, arrow, placement, onTip }) {
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
			<div className="hint">{unit.cost?.points ?? 0} pts</div>
		</button>
	);
}

export function ResultsMatrix({ matchup, selectedCell, onSelectCell }) {
	const [metric, setMetric] = useState("woundsLost");
	const [tip, setTip] = useState(null);
	// A fixed tooltip would drift away from its header on scroll.
	useEffect(() => {
		if (!tip) return;
		const hide = () => setTip(null);
		window.addEventListener("scroll", hide, true);
		return () => window.removeEventListener("scroll", hide, true);
	}, [tip]);
	// null | { by: "average" | defender column index, desc }
	const [rowSort, setRowSort] = useState(null);
	// null | { by: attacker row index, desc }
	const [colSort, setColSort] = useState(null);
	const metricValue = METRICS[metric].get;
	const shareOf = METRICS[metric].share;
	const { digits = 2, suffix = "", lowerIsBetter = false } = METRICS[metric];
	// "Descending" always means best first.
	const scoreOf = useMemo(
		() => (totals) => {
			const value = metricValue(totals);
			if (value === undefined || Number.isNaN(value)) return 0;
			return lowerIsBetter ? -value : value;
		},
		[metricValue, lowerIsBetter],
	);

	const toggleSort = (by) => (current) =>
		current?.by === by ? { by, desc: !current.desc } : { by, desc: true };

	const rows = useMemo(() => {
		// Keep the original row index so the drill-down keeps pointing at the
		// right pairing even when rows are re-ordered.
		const indexed = matchup.rows.map((row, index) => ({
			row,
			index,
			score:
				rowSort?.by === "average"
					? row.cells.reduce((sum, cell) => sum + scoreOf(cell.totals), 0) /
						Math.max(1, row.cells.length)
					: scoreOf(row.cells[rowSort?.by]?.totals ?? {}),
		}));
		if (rowSort) {
			const sign = rowSort.desc ? 1 : -1;
			indexed.sort((a, b) => sign * byScoreDesc(a, b));
		}
		return indexed;
	}, [matchup, scoreOf, rowSort]);

	const columns = useMemo(() => {
		const sortRow = colSort ? matchup.rows[colSort.by] : null;
		const indexed = matchup.defenderUnits.map((unit, index) => ({
			unit,
			index,
			score: sortRow ? scoreOf(sortRow.cells[index]?.totals ?? {}) : 0,
		}));
		if (sortRow) {
			const sign = colSort.desc ? 1 : -1;
			indexed.sort((a, b) => sign * byScoreDesc(a, b));
		}
		return indexed;
	}, [matchup, scoreOf, colSort]);

	return (
		<div className="panel overflow-hidden">
			<div className="panel-header print-display-none text-sm">
				<span className="panel-title">Results</span>
				<span className="hint">
					Click a cell for the breakdown, a name to sort by it.
				</span>
				<label className="ml-auto flex items-center gap-2">
					<span className="text-muted">Show</span>
					<select
						value={metric}
						onChange={(event) => setMetric(event.target.value)}
					>
						{Object.entries(METRICS).map(([key, { label }]) => (
							<option key={key} value={key}>
								{label}
							</option>
						))}
					</select>
				</label>
				<Toggle
					pressed={rowSort?.by === "average"}
					onChange={(pressed) =>
						setRowSort(pressed ? { by: "average", desc: true } : null)
					}
				>
					Sort attackers
				</Toggle>
			</div>
			<div className="print-display-none flex items-center gap-2 px-4 pt-3 text-xs text-muted">
				<span>0</span>
				<span
					className="h-2 w-40 rounded-full border border-line"
					style={{ background: LEGEND }}
				/>
				<span>{METRICS[metric].full}</span>
			</div>
			<div className="overflow-x-auto p-4">
				<table
					className="table-fixed border-collapse text-sm"
					style={{
						width: `${NAME_COLUMN_REM + matchup.defenderUnits.length * CELL_REM}rem`,
					}}
				>
					<colgroup>
						<col style={{ width: `${NAME_COLUMN_REM}rem` }} />
						{columns.map(({ unit, index }) => (
							<col
								key={`${unit.name}-${index}`}
								style={{ width: `${CELL_REM}rem` }}
							/>
						))}
					</colgroup>
					<thead>
						<tr>
							<th className="section-label border border-line bg-surface-muted p-0 text-left">
								<button
									type="button"
									title="Reset sorting"
									onClick={() => {
										setRowSort(null);
										setColSort(null);
									}}
									className={`${HEADER_BUTTON} section-label`}
								>
									Attacker \ Defender
								</button>
							</th>
							{columns.map(({ unit, index }) => (
								<th
									key={`${unit.name}-${index}`}
									className="border border-line bg-surface-muted p-0 text-left"
								>
									<SortableHeader
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
								<th className="border border-line bg-surface-muted p-0 text-left">
									<SortableHeader
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
									const isSelected =
										selectedCell?.row === rowIndex &&
										selectedCell?.col === colIndex;
									const share = shareOf(
										cell.totals,
										row.attacker,
										matchup.defenderUnits[colIndex],
									);
									return (
										<td
											key={`${cell.defenderName}-${colIndex}`}
											style={{ backgroundColor: shareColor(share) }}
											title={`${Math.round(share * 100)}% (100% = ${METRICS[metric].full})`}
											className={`border p-0 ${
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
												className="block w-full cursor-pointer rounded-none border-0 bg-transparent px-3 py-2.5 text-left font-normal hover:bg-[#ffffff14]"
											>
												<b className="text-base">
													{format(metricValue(cell.totals), digits)}
													{suffix}
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
			<HeaderTip tip={tip} />
		</div>
	);
}
