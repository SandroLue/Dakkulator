import { useEffect, useMemo, useState } from "react";
import {
	trySettingLocalStorage,
	useLocalStorage,
} from "../../helpers/useLocalStorage";
import { calculateMatchup } from "../index";
import {
	armyOf,
	modifiersForArmies,
	parseModifierList,
	parseModifierStore,
	storeModifiersForArmies,
} from "../modifiers";
import { unitAbilityEntries } from "../profiles";
import {
	decodeShareState,
	encodeShareState,
	mergeSharedModifiers,
} from "../shareState";
import { ComparisonPanel } from "./ComparisonPanel";
import { ContextControls, PhaseTabs, bestCaseContext } from "./ContextControls";
import { MatchupDetail } from "./MatchupDetail";
import { ModifierBuilder } from "./ModifierBuilder";
import { ResultsMatrix } from "./ResultsMatrix";
import { UnitPicker, applyAttachments, listUnits } from "./UnitPicker";

const MODIFIER_KEY = "modifiersByArmy";
const LEGACY_MODIFIER_KEY = "modifiers";

const is11th = (roster) => roster?.gameType === "Warhammer 40,000 11th Edition";

const uniqueNames = (roster) => [
	...new Set(listUnits(roster).map((entry) => entry.unit.name)),
];

const allUnitKeys = (roster) =>
	new Set(listUnits(roster).map((entry) => entry.key));

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
					To restore the unit selection, choose “{pending.rosterNames.A}” as
					List A and “{pending.rosterNames.B}” as List B.
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

// Pins survive selection changes, so they name units (plus an ordinal for duplicates) rather than matrix indices.
function unitRef(units, index) {
	const name = units[index].name;
	const ordinal = units.slice(0, index).filter((u) => u.name === name).length;
	return { name, ordinal };
}

function findUnit(units, { name, ordinal }) {
	let seen = 0;
	for (const [index, unit] of units.entries()) {
		if (unit.name !== name) continue;
		if (seen === ordinal) return index;
		seen++;
	}
	return -1;
}

const refLabel = ({ name, ordinal }) =>
	ordinal ? `${name} (${ordinal + 1})` : name;

function pinOf(matchup, { row, col }) {
	const attacker = unitRef(matchup.attackerUnits, row);
	const defender = unitRef(matchup.defenderUnits, col);
	const label = `${refLabel(attacker)} → ${refLabel(defender)}`;
	return { key: label, label, attacker, defender };
}

function unmodelledAbilities(matchup) {
	const names = new Set();
	for (const row of matchup?.rows || []) {
		for (const cell of row.cells) {
			for (const t of cell.warnings.unmodelledAttackerAbilities) names.add(t);
			for (const t of cell.warnings.unmodelledDefenderAbilities) names.add(t);
		}
	}
	return [...names].sort((a, b) => a.localeCompare(b));
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
	const [selectedA, setSelectedA] = useState(() => allUnitKeys(rosterA));
	const [selectedB, setSelectedB] = useState(() => allUnitKeys(rosterB));
	const [attachA, setAttachA] = useState({});
	const [attachB, setAttachB] = useState({});
	const [ctx, setCtx] = useState(bestCaseContext);
	const [selectedCell, setSelectedCell] = useState(null);
	const [pins, setPins] = useState([]);
	const [shownReversed, setShownReversed] = useState(reversed);
	// Swapping roles transposes the matrix, so the selected cell no longer applies.
	if (shownReversed !== reversed) {
		setSelectedCell(null);
		setPins([]);
		setShownReversed(reversed);
	}
	const [shownLists, setShownLists] = useState(listIds);
	// Unit keys are per roster, so a newly chosen list starts with all its units selected.
	if (shownLists.A !== listIds.A || shownLists.B !== listIds.B) {
		if (shownLists.A !== listIds.A) {
			setSelectedA(allUnitKeys(rosterA));
			setAttachA({});
		}
		if (shownLists.B !== listIds.B) {
			setSelectedB(allUnitKeys(rosterB));
			setAttachB({});
		}
		setSelectedCell(null);
		setPins([]);
		setShownLists(listIds);
	}
	// No initial value: `useLocalStorage` would write it during render and update App.
	const [storedModifiers, setStoredModifiers] = useLocalStorage(
		MODIFIER_KEY,
		"",
	);
	const armyA = armyOf(rosterA);
	const armyB = armyOf(rosterB);
	const modifierStore = useMemo(
		() => parseModifierStore(storedModifiers),
		[storedModifiers],
	);
	const modifiers = useMemo(
		() => modifiersForArmies(modifierStore, armyA, armyB),
		[modifierStore, armyA, armyB],
	);
	const saveModifiers = (next) => {
		const json = JSON.stringify(
			storeModifiersForArmies(modifierStore, armyA, armyB, next),
		);
		// The hook's storage listener re-reads localStorage, so write it first.
		trySettingLocalStorage(MODIFIER_KEY, json, setStoredModifiers);
		setStoredModifiers(json);
	};
	// Modifiers used to be one list for every army: file them under the armies loaded now.
	useEffect(() => {
		const legacy = localStorage.getItem(LEGACY_MODIFIER_KEY);
		if (legacy === null) return;
		localStorage.removeItem(LEGACY_MODIFIER_KEY);
		if (!storedModifiers) saveModifiers(parseModifierList(legacy));
	});
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
	const [pendingShare, setPendingShare] = useState(() => {
		const shared = decodeShareState(window.location.hash);
		return shared && { ...shared, stage: "settings" };
	});
	const [shareNotice, setShareNotice] = useState(null);
	const [copyStatus, setCopyStatus] = useState("");

	useEffect(() => {
		if (pendingShare?.stage !== "settings") return;
		setCtx(pendingShare.ctx);
		onReversedChange?.(pendingShare.reversed);
		setShareNotice("Loaded the shared battlefield settings.");
		setPendingShare({ ...pendingShare, stage: "selection" });
		// Reloading should not re-apply the link.
		window.history.replaceState(
			null,
			"",
			`${window.location.pathname}${window.location.search}`,
		);
	}, [pendingShare, onReversedChange]);

	// Modifiers are stored per army, so they wait until the shared rosters are loaded.
	const applySharedSelection = (shared) => {
		const merged = mergeSharedModifiers(modifiers, shared.modifiers);
		saveModifiers(merged.modifiers);
		setShareNotice(
			`Loaded a shared setup: ${merged.added} modifier(s) added${
				merged.disabled ? `, ${merged.disabled} of yours switched off` : ""
			}.`,
		);
		setSelectedA(new Set(shared.selected.A));
		setSelectedB(new Set(shared.selected.B));
		setAttachA(shared.attachments.A);
		setAttachB(shared.attachments.B);
		setSelectedCell(null);
		setPendingShare(null);
	};

	useEffect(() => {
		if (pendingShare?.stage !== "selection") return;
		if (
			rosterA?.name === pendingShare.rosterNames.A &&
			rosterB?.name === pendingShare.rosterNames.B
		) {
			applySharedSelection(pendingShare);
		}
	});

	const copyShareLink = async () => {
		const hash = encodeShareState({
			rosterNames: { A: rosterA.name, B: rosterB.name },
			selected: { A: selectedA, B: selectedB },
			attachments: { A: attachA, B: attachB },
			ctx,
			reversed,
			modifiers,
		});
		const { origin, pathname, search } = window.location;
		const url = `${origin}${pathname}${search}${hash}`;
		try {
			await navigator.clipboard.writeText(url);
			setCopyStatus("Link copied — the recipient needs the same two rosters.");
			setTimeout(() => setCopyStatus(""), 4000);
		} catch {
			window.prompt("Copy this link:", url);
		}
	};

	const banner = (
		<ShareBanner
			notice={shareNotice}
			pending={pendingShare}
			rosterA={rosterA}
			rosterB={rosterB}
			onApply={() => applySharedSelection(pendingShare)}
			onDismiss={() => {
				setShareNotice(null);
				setPendingShare(null);
			}}
		/>
	);

	const entriesA = useMemo(
		() => applyAttachments(listUnits(rosterA), attachA),
		[rosterA, attachA],
	);
	const entriesB = useMemo(
		() => applyAttachments(listUnits(rosterB), attachB),
		[rosterB, attachB],
	);

	const unitsA = entriesA
		.filter((e) => selectedA.has(e.key))
		.map((e) => e.unit);
	const unitsB = entriesB
		.filter((e) => selectedB.has(e.key))
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

	const pinnedItems = useMemo(() => {
		if (!matchup) return [];
		return pins.flatMap((pin) => {
			const row = findUnit(matchup.attackerUnits, pin.attacker);
			const col = findUnit(matchup.defenderUnits, pin.defender);
			if (row < 0 || col < 0) return [];
			return [{ ...pin, pairing: matchup.rows[row].cells[col] }];
		});
	}, [pins, matchup]);

	const pickers = (
		<div className="print-display-none grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
			<UnitPicker
				header={listSelect?.("A")}
				roster={rosterA}
				selected={selectedA}
				onChange={setSelectedA}
				attachments={attachA}
				onAttachmentsChange={setAttachA}
			/>
			<button
				type="button"
				onClick={() => onReversedChange?.(!reversed)}
				aria-label="Swap attacker and defender"
				title="Swap attacker and defender (keeps the unit selection)"
				className="self-center justify-self-center rounded-full p-2 md:mt-[42px] md:self-start"
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
				selected={selectedB}
				onChange={setSelectedB}
				attachments={attachB}
				onAttachmentsChange={setAttachB}
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
					{!is11th(rosterA) && <div>List A is {rosterA.gameType}.</div>}
					{!is11th(rosterB) && <div>List B is {rosterB.gameType}.</div>}
				</div>
			</div>
		);
	}

	const pairing =
		matchup && selectedCell
			? matchup.rows[selectedCell.row]?.cells[selectedCell.col]
			: null;
	const selectedPin = pairing ? pinOf(matchup, selectedCell) : null;
	const isPinned = pins.some((pin) => pin.key === selectedPin?.key);
	const togglePin = () =>
		setPins(
			isPinned
				? pins.filter((pin) => pin.key !== selectedPin.key)
				: [...pins, selectedPin],
		);

	return (
		<div className="flex w-full flex-col gap-5">
			{banner}
			{pickers}

			<div className="print-display-none">
				<ContextControls ctx={ctx} onChange={setCtx} />
			</div>

			<div className="print-display-none">
				<ModifierBuilder
					abilities={unmodelledAbilities(matchup)}
					modifiers={modifiers}
					onChange={saveModifiers}
					unitNames={unitNames}
					keywords={unitKeywords}
					abilityTexts={abilityTexts}
					listNames={{ A: rosterA.name, B: rosterB.name }}
				/>
			</div>

			<PhaseTabs
				phase={ctx.phase}
				onChange={(phase) => setCtx({ ...ctx, phase })}
				controls="calculator-results"
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
						selectedCell={selectedCell}
						onSelectCell={setSelectedCell}
					/>
					{pairing && (
						<MatchupDetail
							pairing={pairing}
							rowCells={matchup.rows[selectedCell.row].cells}
							pinned={isPinned}
							onTogglePin={togglePin}
						/>
					)}
					{pinnedItems.length > 0 && (
						<ComparisonPanel
							items={pinnedItems}
							onUnpin={(key) => setPins(pins.filter((pin) => pin.key !== key))}
							onClear={() => setPins([])}
						/>
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

			<div className="print-display-none flex flex-wrap items-center justify-center gap-3 text-sm">
				<button type="button" onClick={copyShareLink}>
					Copy share link
				</button>
				{copyStatus && <span className="text-muted">{copyStatus}</span>}
			</div>
		</div>
	);
}
