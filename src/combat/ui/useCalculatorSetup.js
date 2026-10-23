import { useEffect, useMemo, useState } from "react";
import {
	trySettingLocalStorage,
	useLocalStorage,
} from "../../helpers/useLocalStorage";
import { abilityModifiers, mergeAbilityModifiers } from "../abilityModifiers";
import {
	armyOf,
	modifiersForArmies,
	parseModifierList,
	parseModifierStore,
	storeModifiersForArmies,
} from "../modifiers";
import {
	abilitiesFilled,
	loadUnitSetup,
	loadView,
	markAbilitiesFilled,
	saveUnitSetup,
	saveView,
} from "../setupStore";
import { listUnits, suggestAttachments } from "../unitList";
import { bestCaseContext } from "./ContextControls";
import { METRICS } from "./metrics";

/** The state behind the calculator, split out of `Calculator.jsx` by concern. */

const MODIFIER_KEY = "modifiersByArmy";
const LEGACY_MODIFIER_KEY = "modifiers";
const DEFAULT_METRIC = "pointsReturn";

/**
 * One side's unit selection and leader attachments, remembered per army list.
 * `onListChange` runs when another list is chosen for this side.
 */
export function useUnitSetup(roster, listId, onListChange) {
	const load = () => {
		const entries = listUnits(roster);
		return loadUnitSetup(
			listId,
			new Set(entries.map((entry) => entry.key)),
			undefined,
			(attachments) => suggestAttachments(entries, attachments),
		);
	};
	const [setup, setSetup] = useState(load);
	const [shownList, setShownList] = useState(listId);
	// Unit keys are per roster, so another list brings its own remembered setup.
	if (shownList !== listId) {
		setShownList(listId);
		setSetup(load());
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
 * Turns each list's abilities into modifiers the first time the list is used,
 * so its abilities count without manual work. Once per list: modifiers the
 * user edits or deletes afterwards stay that way.
 */
export function useAbilityModifiers({ sides, modifiers, saveModifiers }) {
	// Runs after every render, but only acts for a list it has not filled yet.
	useEffect(() => {
		let next = modifiers;
		const filled = [];
		for (const { slot, roster, listId } of sides) {
			if (!roster || !listId || abilitiesFilled(listId)) continue;
			next = mergeAbilityModifiers(next, abilityModifiers(roster, slot));
			filled.push(listId);
		}
		if (!filled.length) return;
		// Marked first, so the re-render after saving does not fill again.
		for (const listId of filled) markAbilitiesFilled(listId);
		if (next !== modifiers) saveModifiers(next);
	});
}
