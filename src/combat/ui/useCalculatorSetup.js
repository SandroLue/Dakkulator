import { useEffect, useMemo, useState } from "react";
import {
	trySettingLocalStorage,
	useLocalStorage,
} from "../../helpers/useLocalStorage";
import {
	armyOf,
	modifiersForArmies,
	parseModifierList,
	parseModifierStore,
	storeModifiersForArmies,
} from "../modifiers";
import {
	loadUnitSetup,
	loadView,
	saveUnitSetup,
	saveView,
} from "../setupStore";
import {
	decodeShareState,
	encodeShareState,
	mergeSharedModifiers,
} from "../shareState";
import { listUnits } from "../unitList";
import { bestCaseContext } from "./ContextControls";
import { METRICS } from "./metrics";

/** The state behind the calculator, split out of `Calculator.jsx` by concern. */

const MODIFIER_KEY = "modifiersByArmy";
const LEGACY_MODIFIER_KEY = "modifiers";
const DEFAULT_METRIC = "pDestroyed";

export const allUnitKeys = (roster) =>
	new Set(listUnits(roster).map((entry) => entry.key));

/**
 * One side's unit selection and leader attachments, remembered per army list.
 * `onListChange` runs when another list is chosen for this side.
 */
export function useUnitSetup(roster, listId, onListChange) {
	const [setup, setSetup] = useState(() =>
		loadUnitSetup(listId, allUnitKeys(roster)),
	);
	const [shownList, setShownList] = useState(listId);
	// Unit keys are per roster, so another list brings its own remembered setup.
	if (shownList !== listId) {
		setShownList(listId);
		setSetup(loadUnitSetup(listId, allUnitKeys(roster)));
		onListChange?.();
	}
	useEffect(() => {
		if (shownList === listId) saveUnitSetup(listId, setup);
	}, [listId, shownList, setup]);

	return {
		selected: setup.selected,
		attachments: setup.attachments,
		setSelected: (selected) => setSetup((s) => ({ ...s, selected })),
		setAttachments: (attachments) => setSetup((s) => ({ ...s, attachments })),
	};
}

/** Battlefield context (including the phase) and metric, remembered for every matchup. */
export function useView() {
	const [view, setView] = useState(() =>
		loadView(bestCaseContext(), DEFAULT_METRIC, METRICS),
	);
	useEffect(() => saveView(view), [view]);
	return {
		ctx: view.ctx,
		setCtx: (ctx) => setView((v) => ({ ...v, ctx })),
		metric: view.metric,
		setMetric: (metric) => setView((v) => ({ ...v, metric })),
	};
}

/** The user-built modifiers of the two loaded armies, stored per army. */
export function useArmyModifiers(rosterA, rosterB) {
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
	return { modifiers, saveModifiers };
}

/**
 * Reading a share link from the URL (in two stages: settings at once, unit
 * selection once the same rosters are loaded) and copying one.
 */
export function useShareLink({
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
	onApplied,
}) {
	const [pending, setPending] = useState(() => {
		const shared = decodeShareState(window.location.hash);
		return shared && { ...shared, stage: "settings" };
	});
	const [notice, setNotice] = useState(null);
	const [copyStatus, setCopyStatus] = useState("");

	useEffect(() => {
		if (pending?.stage !== "settings") return;
		setCtx(pending.ctx);
		onReversedChange?.(pending.reversed);
		setNotice("Loaded the shared battlefield settings.");
		setPending({ ...pending, stage: "selection" });
		// Reloading should not re-apply the link.
		window.history.replaceState(
			null,
			"",
			`${window.location.pathname}${window.location.search}`,
		);
	}, [pending, onReversedChange, setCtx]);

	// Modifiers are stored per army, so they wait until the shared rosters are loaded.
	const apply = (shared) => {
		const merged = mergeSharedModifiers(modifiers, shared.modifiers);
		saveModifiers(merged.modifiers);
		setNotice(
			`Loaded a shared setup: ${merged.added} modifier(s) added${
				merged.disabled ? `, ${merged.disabled} of yours switched off` : ""
			}.`,
		);
		sideA.setSelected(new Set(shared.selected.A));
		sideB.setSelected(new Set(shared.selected.B));
		sideA.setAttachments(shared.attachments.A);
		sideB.setAttachments(shared.attachments.B);
		onApplied?.();
		setPending(null);
	};

	useEffect(() => {
		if (pending?.stage !== "selection") return;
		if (
			rosterA?.name === pending.rosterNames.A &&
			rosterB?.name === pending.rosterNames.B
		) {
			apply(pending);
		}
	});

	const copy = async () => {
		const hash = encodeShareState({
			rosterNames: { A: rosterA.name, B: rosterB.name },
			selected: { A: sideA.selected, B: sideB.selected },
			attachments: { A: sideA.attachments, B: sideB.attachments },
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

	return {
		notice,
		pending,
		copyStatus,
		copy,
		apply: () => apply(pending),
		dismiss: () => {
			setNotice(null);
			setPending(null);
		},
	};
}
