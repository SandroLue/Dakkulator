import { useEffect, useMemo, useRef, useState } from "react";
import { calculateMatchup } from "../index";
import { unitAbilityEntries } from "../profiles";
import { applyAttachments, listUnits } from "../unitList";
import { AssumptionsLine, ContextControls, PhaseTabs } from "./ContextControls";
import { MatchupDetail } from "./MatchupDetail";
import { ModifierBuilder } from "./ModifierBuilder";
import { ResultsMatrix } from "./ResultsMatrix";
import { UnitPicker } from "./UnitPicker";
import {
	useArmyModifiers,
	useShareLink,
	useUnitSetup,
	useView,
} from "./useCalculatorSetup";

const is11th = (roster) => roster?.gameType === "Warhammer 40,000 11th Edition";

const uniqueNames = (roster) => [
	...new Set(listUnits(roster).map((entry) => entry.unit.name)),
];

const uniqueKeywords = (roster) =>
	[
		...new Set(
			listUnits(roster).flatMap((entry) =>
				[...(entry.unit.keywords || [])]
					.map((k) => String(k).toUpperCase())
					// Rosters tag units with their weapon categories too; those are not unit keywords.
					.filter((k) => !k.endsWith(" WEAPON")),
			),
		),
	].sort();

function ShareBanner({
	notice,
	pending,
	rosterA,
	rosterB,
	onApply,
	onDismiss,
}) {
	if (!notice && !pending) return null;
	const waiting = pending?.stage === "selection";
	return (
		<div className="print-display-none flex flex-wrap items-center gap-3 rounded-lg border border-info bg-info-soft px-4 py-3 text-sm">
			<span>{notice}</span>
			{waiting && (
				<span>
					To restore the unit selection, choose “{pending.rosterNames.A}” as the{" "}
					{pending.reversed ? "defender" : "attacker"} and “
					{pending.rosterNames.B}” as the{" "}
					{pending.reversed ? "attacker" : "defender"}.
				</span>
			)}
			{waiting && rosterA && rosterB && (
				<button type="button" onClick={onApply}>
					Use the loaded rosters anyway
				</button>
			)}
			<button
				type="button"
				className="button-ghost ml-auto"
				onClick={onDismiss}
			>
				Dismiss
			</button>
		</div>
	);
}

/** Abilities the engine doesn't model, split by the side whose units have them. */
function unmodelledAbilities(matchup) {
	const attacker = new Set();
	const defender = new Set();
	for (const row of matchup?.rows || []) {
		for (const cell of row.cells) {
			for (const t of cell.warnings.unmodelledAttackerAbilities)
				attacker.add(t);
			for (const t of cell.warnings.unmodelledDefenderAbilities)
				defender.add(t);
		}
	}
	const sorted = (names) => [...names].sort((a, b) => a.localeCompare(b));
	return { attacker: sorted(attacker), defender: sorted(defender) };
}

function Warnings({ matchup }) {
	const weaponAbilities = new Set();
	for (const row of matchup.rows) {
		for (const cell of row.cells) {
			for (const t of cell.warnings.unknownWeaponAbilities)
				weaponAbilities.add(t);
		}
	}
	if (!weaponAbilities.size) return null;

	return (
		<details className="rounded-lg border border-accent bg-accent-soft px-4 py-3 text-sm">
			<summary className="cursor-pointer font-semibold text-accent">
				Not included in these numbers
			</summary>
			<div className="pt-1">
				<b>Unrecognised weapon abilities:</b> {[...weaponAbilities].join(", ")}
			</div>
		</details>
	);
}

export function Calculator({
	rosterA,
	rosterB,
	listIds = {},
	reversed = false,
	onReversedChange,
	listSelect,
}) {
	// Every unit starts selected, so both unit lists stay closed until needed.
	const [choosingUnits, setChoosingUnits] = useState(false);
	const [selectedCell, setSelectedCell] = useState(null);
	// Each side's unit selection and attachments are remembered per army list.
	const sideA = useUnitSetup(rosterA, listIds.A, () => setSelectedCell(null));
	const sideB = useUnitSetup(rosterB, listIds.B, () => setSelectedCell(null));
	const { ctx, setCtx, metric, setMetric } = useView();
	const { modifiers, saveModifiers } = useArmyModifiers(rosterA, rosterB);
	const share = useShareLink({
		rosterA,
		rosterB,
		sideA,
		sideB,
		ctx,
		setCtx,
		reversed,
		onReversedChange,
		modifiers,
		saveModifiers,
		onApplied: () => setSelectedCell(null),
	});

	// A click on a cell brings its breakdown into view, which sits below the matrix.
	const detailRef = useRef(null);
	const battlefieldRef = useRef(null);
	const scrollToDetail = useRef(false);
	const selectCell = (cell) => {
		scrollToDetail.current = true;
		setSelectedCell(cell);
	};
	// Runs after every render, but only acts on the one that follows a click.
	useEffect(() => {
		if (!scrollToDetail.current) return;
		scrollToDetail.current = false;
		const reduce = window.matchMedia?.(
			"(prefers-reduced-motion: reduce)",
		).matches;
		// "nearest" leaves the page alone when the breakdown is already in view.
		detailRef.current?.scrollIntoView({
			behavior: reduce ? "auto" : "smooth",
			block: "nearest",
		});
	});

	const [shownReversed, setShownReversed] = useState(reversed);
	// Swapping roles transposes the matrix, so the selected cell no longer applies.
	if (shownReversed !== reversed) {
		setSelectedCell(null);
		setShownReversed(reversed);
	}

	const unitNames = useMemo(
		() => ({ A: uniqueNames(rosterA), B: uniqueNames(rosterB) }),
		[rosterA, rosterB],
	);
	const unitKeywords = useMemo(
		() => ({ A: uniqueKeywords(rosterA), B: uniqueKeywords(rosterB) }),
		[rosterA, rosterB],
	);
	const abilityTexts = useMemo(() => {
		const texts = new Map();
		for (const entry of [...listUnits(rosterA), ...listUnits(rosterB)]) {
			for (const [name, description] of unitAbilityEntries(entry.unit)) {
				const key = String(name).toLowerCase();
				if (description && !texts.has(key)) texts.set(key, description);
			}
		}
		return texts;
	}, [rosterA, rosterB]);

	const banner = (
		<ShareBanner
			notice={share.notice}
			pending={share.pending}
			rosterA={rosterA}
			rosterB={rosterB}
			onApply={share.apply}
			onDismiss={share.dismiss}
		/>
	);

	const entriesA = useMemo(
		() => applyAttachments(listUnits(rosterA), sideA.attachments),
		[rosterA, sideA.attachments],
	);
	const entriesB = useMemo(
		() => applyAttachments(listUnits(rosterB), sideB.attachments),
		[rosterB, sideB.attachments],
	);

	const unitsA = entriesA
		.filter((e) => sideA.selected.has(e.key))
		.map((e) => e.unit);
	const unitsB = entriesB
		.filter((e) => sideB.selected.has(e.key))
		.map((e) => e.unit);

	const attackers = reversed ? unitsB : unitsA;
	const defenders = reversed ? unitsA : unitsB;

	const matchup = useMemo(
		() =>
			attackers.length && defenders.length
				? calculateMatchup(attackers, defenders, ctx, {
						modifiers,
						attackerList: reversed ? "B" : "A",
						defenderList: reversed ? "A" : "B",
					})
				: null,
		[attackers, defenders, ctx, modifiers, reversed],
	);

	const pickers = (
		<div className="print-display-none grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
			<UnitPicker
				header={listSelect?.("A")}
				roster={rosterA}
				selected={sideA.selected}
				onChange={sideA.setSelected}
				attachments={sideA.attachments}
				onAttachmentsChange={sideA.setAttachments}
				open={choosingUnits}
				onOpenChange={setChoosingUnits}
			/>
			<button
				type="button"
				onClick={() => onReversedChange?.(!reversed)}
				aria-label="Swap attacker and defender"
				title="Swap attacker and defender (keeps the unit selection)"
				className="self-center justify-self-center rounded-full p-2"
			>
				<svg
					viewBox="0 0 24 24"
					aria-hidden="true"
					className="h-4 w-4 text-accent"
					fill="none"
					stroke="currentColor"
					strokeWidth="2.2"
					strokeLinecap="round"
					strokeLinejoin="round"
				>
					<path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" />
				</svg>
			</button>
			<UnitPicker
				header={listSelect?.("B")}
				roster={rosterB}
				selected={sideB.selected}
				onChange={sideB.setSelected}
				attachments={sideB.attachments}
				onAttachmentsChange={sideB.setAttachments}
				open={choosingUnits}
				onOpenChange={setChoosingUnits}
			/>
		</div>
	);

	if (!rosterA || !rosterB) {
		return (
			<div className="print-display-none flex w-full flex-col gap-5">
				{banner}
				{pickers}
			</div>
		);
	}
	if (!is11th(rosterA) || !is11th(rosterB)) {
		return (
			<div className="print-display-none flex w-full flex-col gap-5">
				{pickers}
				<div className="panel border-danger px-4 py-4 text-danger">
					The combat calculator supports Warhammer 40,000 11th Edition only.
					{!is11th(rosterA) && (
						<div>
							The {reversed ? "defender" : "attacker"} list is{" "}
							{rosterA.gameType}.
						</div>
					)}
					{!is11th(rosterB) && (
						<div>
							The {reversed ? "attacker" : "defender"} list is{" "}
							{rosterB.gameType}.
						</div>
					)}
				</div>
			</div>
		);
	}

	// Never leave the breakdown empty: without a (still valid) pick, show the first
	// pairing whose attacker has weapons in this phase.
	const firstArmedRow = matchup
		? Math.max(
				0,
				matchup.rows.findIndex((row) => row.cells[0]?.weapons.length),
			)
		: 0;
	const shownCell = matchup?.rows[selectedCell?.row]?.cells[selectedCell?.col]
		? selectedCell
		: { row: firstArmedRow, col: 0 };
	const pairing = matchup?.rows[shownCell.row]?.cells[shownCell.col] ?? null;

	return (
		<div className="flex w-full flex-col gap-5">
			{banner}
			{pickers}

			<PhaseTabs
				phase={ctx.phase}
				onChange={(phase) => setCtx({ ...ctx, phase })}
				controls="calculator-results"
			/>
			<AssumptionsLine
				ctx={ctx}
				onEdit={() =>
					battlefieldRef.current?.scrollIntoView({ behavior: "smooth" })
				}
			/>

			{matchup ? (
				<div
					id="calculator-results"
					role="tabpanel"
					className="calculator-results -mt-1 flex flex-col gap-4"
				>
					<Warnings matchup={matchup} />
					<ResultsMatrix
						matchup={matchup}
						selectedCell={shownCell}
						onSelectCell={selectCell}
						metric={metric}
						onMetricChange={setMetric}
					/>
					{pairing && (
						<div ref={detailRef} className="scroll-my-4">
							<MatchupDetail
								pairing={pairing}
								rowCells={matchup.rows[shownCell.row].cells}
							/>
						</div>
					)}
				</div>
			) : (
				<div
					id="calculator-results"
					role="tabpanel"
					className="panel -mt-1 px-4 py-10 text-center text-sm text-muted"
				>
					Select at least one unit in each list.
				</div>
			)}

			<div ref={battlefieldRef} className="print-display-none scroll-mt-4">
				<ContextControls ctx={ctx} onChange={setCtx} />
			</div>

			<div className="print-display-none">
				<ModifierBuilder
					abilities={unmodelledAbilities(matchup)}
					attackerList={reversed ? "B" : "A"}
					modifiers={modifiers}
					onChange={saveModifiers}
					unitNames={unitNames}
					keywords={unitKeywords}
					abilityTexts={abilityTexts}
					listNames={{ A: rosterA.name, B: rosterB.name }}
				/>
			</div>

			<div className="print-display-none flex flex-wrap items-center justify-center gap-3 text-sm">
				<button type="button" onClick={share.copy}>
					Copy share link
				</button>
				{share.copyStatus && (
					<span className="text-muted">{share.copyStatus}</span>
				)}
			</div>
		</div>
	);
}
