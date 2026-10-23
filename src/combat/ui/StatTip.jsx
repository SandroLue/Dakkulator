import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Datasheet-style hover cards: unit and weapon statlines in small bordered
 * tables, floating next to whatever was hovered.
 */

const TIP_WIDTH_PX = 440;
const TIP_GAP_PX = 6;
const TIP_MARGIN_PX = 8;

const tipWidth = () =>
	Math.min(TIP_WIDTH_PX, window.innerWidth - 2 * TIP_MARGIN_PX);

// Fixed positioning, because a scroll container would clip an absolute tooltip.
export function tipPosition(rect, placement) {
	const maxLeft = window.innerWidth - tipWidth() - TIP_MARGIN_PX;
	return placement === "right"
		? {
				left: Math.min(rect.right + TIP_GAP_PX, maxLeft),
				top: rect.top,
			}
		: { left: Math.min(rect.left, maxLeft), top: rect.bottom + TIP_GAP_PX };
}

/** `[tip, setTip]`; a fixed tooltip would drift away from its anchor on scroll. */
export function useTip() {
	const [tip, setTip] = useState(null);
	useEffect(() => {
		if (!tip) return;
		const hide = () => setTip(null);
		window.addEventListener("scroll", hide, true);
		return () => window.removeEventListener("scroll", hide, true);
	}, [tip]);
	return [tip, setTip];
}

// Empty and "-" both mean the datasheet leaves the field blank.
export const stat = (value) => {
	const text = String(value ?? "").trim();
	return text && text !== "-" ? text : "–";
};

const TIP_CELL = "truncate border border-line px-1.5 py-0.5 font-normal";
// Every table has six stat columns of this width, so they line up under each other.
const TIP_STAT_COLUMN = "2.75rem";

/** `rows`: `{ key, cells, note }`; the note is a muted line under the row. */
export function StatTable({ head, rows }) {
	return (
		<table className="w-full table-fixed border-collapse text-xs">
			<colgroup>
				<col />
				{head.slice(1).map((label) => (
					<col key={label} style={{ width: TIP_STAT_COLUMN }} />
				))}
			</colgroup>
			<thead>
				<tr className="bg-surface-muted text-muted">
					{head.map((label, index) => (
						<th
							key={label}
							className={`${TIP_CELL} ${index ? "text-center" : "text-left"}`}
						>
							{label}
						</th>
					))}
				</tr>
			</thead>
			<tbody>
				{rows.map(({ key, cells, note }) => (
					<Fragment key={key}>
						<tr>
							{cells.map((cell, index) => (
								<td
									key={head[index]}
									className={`${TIP_CELL} ${index ? "text-center" : "font-semibold"} ${note ? "border-b-0" : ""}`}
								>
									{cell}
								</td>
							))}
						</tr>
						{note && (
							<tr>
								<td
									colSpan={cells.length}
									className={`${TIP_CELL} border-t-0 pb-1 text-muted`}
								>
									{note}
								</td>
							</tr>
						)}
					</Fragment>
				))}
			</tbody>
		</table>
	);
}

/** `weapons`: `{ name, range, attacks, skill, str, ap, damage, keywords }`, as printed. */
export function WeaponTable({ title, weapons, isMelee }) {
	if (!weapons.length) return null;
	return (
		<div className="flex flex-col gap-0.5">
			{title && <div className="section-label">{title}</div>}
			<StatTable
				head={["Weapon", "Range", "A", isMelee ? "WS" : "BS", "S", "AP", "D"]}
				rows={weapons.map((w, index) => ({
					key: `${w.name}-${index}`,
					cells: [
						w.name,
						stat(w.range),
						stat(w.attacks),
						stat(w.skill),
						stat(w.str),
						stat(w.ap),
						stat(w.damage),
					],
					note: stat(w.keywords) === "–" ? null : w.keywords,
				}))}
			/>
		</div>
	);
}

/** The floating card itself; `tip.position` comes from `tipPosition`. */
export function FloatingTip({ tip, id, children }) {
	const ref = useRef(null);
	// Moved up once measured, so a tall tooltip never runs off the bottom of the screen.
	const [top, setTop] = useState(null);
	useLayoutEffect(() => {
		const height = ref.current?.offsetHeight ?? 0;
		const wanted = tip?.position.top ?? 0;
		setTop(
			Math.max(
				TIP_MARGIN_PX,
				Math.min(wanted, window.innerHeight - height - TIP_MARGIN_PX),
			),
		);
	}, [tip]);
	if (!tip) return null;
	return (
		<div
			ref={ref}
			role="tooltip"
			id={id}
			className="pointer-events-none fixed z-50 flex flex-col gap-2 rounded-lg border border-line-strong bg-surface-raised px-3 py-2 text-left text-sm font-normal not-italic text-ink shadow-lg shadow-black/40"
			style={{
				...tip.position,
				top: top ?? tip.position.top,
				width: tipWidth(),
			}}
		>
			{children}
		</div>
	);
}
