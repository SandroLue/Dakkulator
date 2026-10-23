import { REROLL_MODES } from "./modifiers";
import { defaultContext } from "./resolve";
import { sustainedHitsValue } from "./weaponKeywords";

/**
 * The calculator setup remembered between visits, in localStorage:
 * - per army list: which units are selected and which leaders joined whom;
 * - for every matchup: the battlefield context (incl. phase) and the metric.
 *
 * Everything is validated on the way back in, so a stale or
 * hand-edited entry falls back to the defaults instead of breaking the page.
 */

const UNIT_KEY = /^\d{1,4}:\d{1,4}$/;
const PHASES = ["combined", "shooting", "fight"];

export function validAttachments(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	return Object.fromEntries(
		Object.entries(value).filter(
			([leader, bodyguard]) =>
				UNIT_KEY.test(leader) &&
				typeof bodyguard === "string" &&
				UNIT_KEY.test(bodyguard),
		),
	);
}

export function validContext(value) {
	const defaults = defaultContext();
	const ctx = {};
	if (!value || typeof value !== "object") return defaults;
	for (const [key, raw] of Object.entries(value)) {
		// Sustained Hits may be dice ("D3") as well as a number.
		if (key === "allSustainedHits") {
			if (sustainedHitsValue(raw)) ctx[key] = String(raw).trim();
			continue;
		}
		if (!(key in defaults) || typeof raw !== typeof defaults[key]) continue;
		if (typeof raw === "number") {
			if (Number.isFinite(raw)) ctx[key] = Math.max(-6, Math.min(6, raw));
		} else if (key === "phase") {
			if (PHASES.includes(raw)) ctx[key] = raw;
		} else if (key.startsWith("reroll")) {
			if (REROLL_MODES.includes(raw)) ctx[key] = raw;
		} else {
			ctx[key] = raw;
		}
	}
	return defaultContext(ctx);
}

const UNIT_SETUP_KEY = "unitSetupByList";
const VIEW_KEY = "calculatorView";
/** Lists that were not opened for a while are forgotten first. */
const MAX_LISTS = 50;

function readJson(key, storage) {
	try {
		return JSON.parse(storage?.getItem(key) ?? "null");
	} catch {
		return null;
	}
}

function writeJson(key, value, storage) {
	try {
		storage?.setItem(key, JSON.stringify(value));
	} catch {
		// Full or blocked storage: the setup simply is not remembered.
	}
}

const defaultStorage = () => globalThis.localStorage;

/**
 * @param {Set<string>} allKeys every unit key of the list, all selected by default
 * @param {(attachments: object) => object} suggest the obvious attachments to add
 * the first time a list is loaded (see `suggestAttachments`)
 * @returns `{ selected: Set, attachments: object, autoAttached: true }`
 */
export function loadUnitSetup(
	listId,
	allKeys,
	storage = defaultStorage(),
	suggest = () => ({}),
) {
	const stored = listId ? readJson(UNIT_SETUP_KEY, storage)?.[listId] : null;
	if (!stored || !Array.isArray(stored.selected)) {
		return {
			selected: new Set(allKeys),
			attachments: suggest({}),
			autoAttached: true,
		};
	}
	const known = (key) => allKeys.has(key);
	const attachments = Object.fromEntries(
		Object.entries(validAttachments(stored.attachments)).filter(
			([leader, bodyguard]) => known(leader) && known(bodyguard),
		),
	);
	return {
		selected: new Set(stored.selected.filter(known)),
		// Obvious leaders are attached once per list; after that the user decides.
		attachments: stored.autoAttached
			? attachments
			: { ...attachments, ...suggest(attachments) },
		autoAttached: true,
	};
}

export function saveUnitSetup(
	listId,
	{ selected, attachments, autoAttached = false },
	storage = defaultStorage(),
) {
	if (!listId) return;
	const all = readJson(UNIT_SETUP_KEY, storage) ?? {};
	delete all[listId];
	// Most recently saved last, so the oldest lists are dropped first.
	const entries = [
		...Object.entries(all),
		[listId, { selected: [...selected], attachments, autoAttached }],
	].slice(-MAX_LISTS);
	writeJson(UNIT_SETUP_KEY, Object.fromEntries(entries), storage);
}

const ABILITIES_FILLED_KEY = "abilityModifiersFilled";

/** Whether a list's abilities were already turned into modifiers (once per list). */
export function abilitiesFilled(listId, storage = defaultStorage()) {
	const filled = readJson(ABILITIES_FILLED_KEY, storage);
	return Array.isArray(filled) && filled.includes(listId);
}

export function markAbilitiesFilled(listId, storage = defaultStorage()) {
	const filled = readJson(ABILITIES_FILLED_KEY, storage);
	const ids = (Array.isArray(filled) ? filled : []).filter(
		(id) => id !== listId,
	);
	writeJson(
		ABILITIES_FILLED_KEY,
		[...ids, listId].slice(-MAX_LISTS * 4),
		storage,
	);
}

/**
 * @param {object} fallbackCtx the context for a first visit
 * @param {object} metrics the metric keys that exist
 * @returns `{ ctx, metric }`
 */
export function loadView(
	fallbackCtx,
	fallbackMetric,
	metrics,
	storage = defaultStorage(),
) {
	const stored = readJson(VIEW_KEY, storage);
	return {
		ctx: stored?.ctx ? validContext(stored.ctx) : fallbackCtx,
		metric: stored?.metric in metrics ? stored.metric : fallbackMetric,
	};
}

export function saveView(view, storage = defaultStorage()) {
	writeJson(VIEW_KEY, view, storage);
}
