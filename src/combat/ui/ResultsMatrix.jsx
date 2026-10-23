import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { getUnitTotalModels } from "../profiles";
import { MetricSelect } from "./MetricSelect";
import {
	FloatingTip,
	StatTable,
	WeaponTable,
	stat,
	tipPosition,
	useTip,
} from "./StatTip";
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
// The name column grows with the table up to this much of its base width;
// everything beyond goes to the result columns.
const NAME_STRETCH = 1.3;
const NAME_WIDTH = `clamp(${NAME_COLUMN}, 20%, calc(${NAME_STRETCH} * ${NAME_COLUMN}))`;

/**
 * Always the panel's full width; the result columns, left without a width,
 * share what the name column leaves equally. Never narrower than the widest
 * name column plus base-width cells: past that the panel scrolls sideways.
 */
const tableWidth = (cellCount) =>
	`max(calc(${NAME_STRETCH} * ${NAME_COLUMN} + ${cellCount} * ${CELL}), 100%)`;

// Text and row height grow with the cells, up to this much.
const MAX_SCALE = 1.5;
const BASE_ROW_REM = 2.75;

/**
 * How much wider the result cells are than their base width (`--matrix-cell`),
 * between 1 and `MAX_SCALE`, kept up to date as the panel resizes. Fonts and
 * row heights follow it, so a stretched matrix looks scaled, not stretched.
 */
function useCellScale(columnCount) {
	const ref = useRef(null);
	const [scale, setScale] = useState(1);
	// biome-ignore lint/correctness/useExhaustiveDependencies: re-measure when the columns change
	useLayoutEffect(() => {
		const box = ref.current;
		if (!box || typeof ResizeObserver === "undefined") return;
		const measure = () => {
			const table = box.querySelector("table");
			const cell = table?.querySelector("thead th:nth-child(2)");
			if (!cell) return;
			const rootPx = Number.parseFloat(
				getComputedStyle(document.documentElement).fontSize,
			);
			const baseRem = Number.parseFloat(
				getComputedStyle(table).getPropertyValue("--matrix-cell"),
			);
			if (!(rootPx > 0 && baseRem > 0)) return;
			const ratio = cell.offsetWidth / (baseRem * rootPx);
			setScale(Math.min(MAX_SCALE, Math.max(1, ratio)));
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(box);
		return () => observer.disconnect();
	}, [columnCount]);
	return [ref, scale];
}

// A column so name and points stack, filling the cell however tall the row is.
// `items-stretch` and `gap-0` undo the global button style, which centres and
// spaces its content: centred lines would neither sit left nor truncate.
const HEADER_BUTTON =
	"flex h-full w-full min-w-0 cursor-pointer flex-col items-stretch justify-center gap-0 rounded-none border-0 bg-transparent px-3 py-2 text-left font-normal hover:bg-[#ffffff14] focus-visible:-outline-offset-2";

/** Each weapon once, however many models carry it, in the tooltip's shape. */
function unitWeapons(unit, key) {
	const isMelee = key === "meleeWeapons";
	const byName = new Map();
	for (const model of unit?.models || []) {
		for (const weapon of model[key] || []) {
			if (byName.has(weapon.name)) continue;
			byName.set(weapon.name, {
				name: weapon.name,
				range: weapon.range,
				attacks: weapon.attacks,
				skill: isMelee ? weapon.ws : weapon.bs,
				str: weapon.str,
				ap: weapon.ap,
				damage: weapon.damage,
				keywords: weapon.type,
			});
		}
	}
	return [...byName.values()];
}

function HeaderTip({ tip }) {
	const unit = tip?.unit;
	return (
		<FloatingTip tip={tip} id="matrix-header-tip">
			{unit && (
				<>
					<div className="flex flex-col gap-0.5">
						<div className="truncate font-bold leading-snug">{unit.name}</div>
						<div className="text-muted">
							{unit.cost?.points ?? 0} pts · {tip.models}{" "}
							{tip.models === 1 ? "model" : "models"}
						</div>
					</div>
					{unit.modelStats?.length > 0 && (
						<StatTable
							head={["Model", "M", "T", "Sv", "Inv", "W", "Ld"]}
							rows={unit.modelStats.map((m, index) => ({
								key: `${m.name}-${index}`,
								cells: [
									m.name,
									stat(m.move),
									stat(m.toughness),
									stat(m.save),
									stat(m.invulnerableSave),
									stat(m.wounds),
									stat(m.leadership),
								],
							}))}
						/>
					)}
					<WeaponTable
						title="Ranged weapons"
						weapons={unitWeapons(unit, "rangedWeapons")}
					/>
					<WeaponTable
						title="Melee weapons"
						weapons={unitWeapons(unit, "meleeWeapons")}
						isMelee
					/>
					<div className="border-t border-line pt-1 text-xs text-muted">
						Click to sort the matrix by this unit
					</div>
				</>
			)}
		</FloatingTip>
	);
}

function SortableHeader({ unit, active, onClick, arrow, placement, onTip }) {
	const show = (event) =>
		onTip({
			unit,
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
			<div className="hint truncate">{unit.cost?.points ?? 0} pts</div>
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
	const [tip, setTip] = useTip();
	// null | { by: defender column index, desc }
	const [rowSort, setRowSort] = useState(null);
	// null | { by: attacker row index, desc }
	const [colSort, setColSort] = useState(null);
	const grid = useMemo(() => buildGrid(matchup, metric), [matchup, metric]);
	const [scrollRef, scale] = useCellScale(matchup.defenderUnits.length);

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
			{/* Padding outside the scroll box: inside it, cells would scroll past the sticky names. */}
			<div className="p-4">
				<div ref={scrollRef} className="overflow-x-auto">
					<table
						// Separate borders move with the sticky cells; collapsed ones stay behind and leave gaps.
						className="table-fixed border-separate border-spacing-0"
						style={{
							width: tableWidth(matchup.defenderUnits.length),
							// text-sm, scaled with the cells; the sizes inside are in em.
							fontSize: `${0.875 * scale}rem`,
						}}
					>
						<colgroup>
							<col style={{ width: NAME_WIDTH }} />
							{columns.map(({ unit, index }) => (
								<col key={`${unit.name}-${index}`} />
							))}
						</colgroup>
						<thead>
							<tr>
								{/* The pickers above already name the sides. */}
								<th className="sticky left-0 z-20 border border-line bg-surface-muted p-0" />
								{columns.map(({ unit, index }) => (
									<th
										key={`${unit.name}-${index}`}
										className="border-y border-r border-line bg-surface-muted p-0 text-left"
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
								<tr
									key={`${row.attacker.name}-${rowIndex}`}
									style={{ height: `${BASE_ROW_REM * scale}rem` }}
								>
									{/* Sticky, so attacker names stay visible while scrolling sideways. */}
									<th className="sticky left-0 z-10 h-px border-x border-b border-line bg-surface-muted p-0 text-left">
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
														className={`text-[1.143em] ${value.unarmed ? "font-normal text-muted" : ""}`}
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
