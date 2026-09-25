import { useMemo, useSyncExternalStore } from "react";
import { parseJSON, stringifyJSON } from "../helpers/json";
import { SUPPORTED_GAME } from "./loadRoster";

/**
 * The user's army lists, persisted in localStorage.
 *
 * `library` holds `{ id, addedAt, source, roster }[]`; `slotA` / `slotB` hold
 * the id of the list used as attacker / defender.
 */

export const SLOTS = ["A", "B"];
const LIBRARY_KEY = "library";
const SLOT_KEYS = { A: "slotA", B: "slotB" };
const LEGACY_KEYS = ["rosters", "rosterA", "rosterB"];

const listeners = new Set();

function subscribe(listener) {
	listeners.add(listener);
	// Keeps several open tabs in sync.
	window.addEventListener("storage", listener);
	return () => {
		listeners.delete(listener);
		window.removeEventListener("storage", listener);
	};
}

/** @returns `false` when the browser refused the write (storage full). */
function write(key, value, storage = localStorage) {
	try {
		if (value) storage.setItem(key, value);
		else storage.removeItem(key);
		return true;
	} catch {
		return false;
	} finally {
		for (const listener of listeners) listener();
	}
}

const newId = () =>
	globalThis.crypto?.randomUUID?.() ??
	`${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

function safeParse(raw) {
	if (!raw) return null;
	try {
		return parseJSON(raw);
	} catch {
		return null;
	}
}

export function parseLibrary(raw) {
	const entries = safeParse(raw);
	if (!Array.isArray(entries)) return [];
	return entries.filter(
		(entry) => entry?.id && entry.roster?.gameType === SUPPORTED_GAME,
	);
}

/** Table-friendly view of an entry. */
export function describeEntry(entry) {
	const forces = entry.roster.forces || [];
	return {
		...entry,
		name: entry.roster.name || "Unnamed list",
		faction: forces[0]?.catalog || "",
		points: entry.roster.cost?.points ?? 0,
		unitCount: forces.reduce(
			(sum, force) => sum + (force.units?.length || 0),
			0,
		),
	};
}

const sameRoster = (a, b) =>
	a?.name === b?.name &&
	a?.cost?.points === b?.cost?.points &&
	a?.forces?.[0]?.catalog === b?.forces?.[0]?.catalog;

/**
 * One-off move from the old storage layout (a `rosters` history plus full
 * copies in `rosterA` / `rosterB`). Old keys are only removed once the new
 * library was written successfully.
 */
export function migrateLegacyStorage(storage = globalThis.localStorage) {
	if (!storage || storage.getItem(LIBRARY_KEY) !== null) return;
	if (!LEGACY_KEYS.some((key) => storage.getItem(key) !== null)) return;

	const entries = [];
	const history = safeParse(storage.getItem("rosters"));
	for (const roster of Array.isArray(history) ? history : []) {
		if (roster?.gameType !== SUPPORTED_GAME) continue;
		entries.push({
			id: newId(),
			addedAt: Date.now(),
			source: "upload",
			roster,
		});
	}

	const slotIds = {};
	for (const slot of SLOTS) {
		const roster = safeParse(storage.getItem(`roster${slot}`));
		if (roster?.gameType !== SUPPORTED_GAME) continue;
		let entry = entries.find((e) => sameRoster(e.roster, roster));
		if (!entry) {
			entry = { id: newId(), addedAt: Date.now(), source: "upload", roster };
			entries.push(entry);
		}
		slotIds[slot] = entry.id;
	}

	if (!write(LIBRARY_KEY, stringifyJSON(entries), storage)) return;
	for (const slot of SLOTS) write(SLOT_KEYS[slot], slotIds[slot], storage);
	for (const key of LEGACY_KEYS) storage.removeItem(key);
}

// The mutators read storage fresh so several can run in one event handler.
const currentEntries = () => parseLibrary(localStorage.getItem(LIBRARY_KEY));
const currentSlot = (slot) => localStorage.getItem(SLOT_KEYS[slot]);

/** @returns the new entry, or `null` when the browser storage is full */
function add(roster, source = "upload") {
	const entry = { id: newId(), addedAt: Date.now(), source, roster };
	const saved = write(LIBRARY_KEY, stringifyJSON([entry, ...currentEntries()]));
	return saved ? entry : null;
}

function remove(id) {
	write(
		LIBRARY_KEY,
		stringifyJSON(currentEntries().filter((entry) => entry.id !== id)),
	);
	for (const slot of SLOTS) {
		if (currentSlot(slot) === id) write(SLOT_KEYS[slot], null);
	}
}

function assign(slot, id) {
	write(SLOT_KEYS[slot], id || null);
}

/** Puts a freshly added list into the first empty slot, if any. */
function assignIfEmpty(id) {
	const slot = SLOTS.find((s) => !currentSlot(s));
	if (slot) assign(slot, id);
}

const readLibrary = () => localStorage.getItem(LIBRARY_KEY);

/** True until the first list is ever saved; deleting every list does not reset it. */
export const isFirstVisit = () => readLibrary() === null;
const readSlotA = () => localStorage.getItem(SLOT_KEYS.A);
const readSlotB = () => localStorage.getItem(SLOT_KEYS.B);

export function useRosterLibrary() {
	const raw = useSyncExternalStore(subscribe, readLibrary);
	const slotA = useSyncExternalStore(subscribe, readSlotA);
	const slotB = useSyncExternalStore(subscribe, readSlotB);

	const entries = useMemo(() => parseLibrary(raw).map(describeEntry), [raw]);
	const entryA = entries.find((entry) => entry.id === slotA);
	const entryB = entries.find((entry) => entry.id === slotB);

	return {
		entries,
		slots: { A: entryA?.id ?? null, B: entryB?.id ?? null },
		rosters: { A: entryA?.roster, B: entryB?.roster },
		add,
		remove,
		assign,
		assignIfEmpty,
	};
}
