import { validAttachments, validContext } from "./shareState";

/**
 * The calculator setup remembered between visits, in localStorage:
 * - per army list: which units are selected and which leaders joined whom;
 * - for every matchup: the battlefield context (incl. phase) and the metric.
 *
 * Everything is validated on the way back in, like a share link, so a stale or
 * hand-edited entry falls back to the defaults instead of breaking the page.
 */

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
 * @returns `{ selected: Set, attachments: object }`
 */
export function loadUnitSetup(listId, allKeys, storage = defaultStorage()) {
	const stored = listId ? readJson(UNIT_SETUP_KEY, storage)?.[listId] : null;
	if (!stored || !Array.isArray(stored.selected)) {
		return { selected: new Set(allKeys), attachments: {} };
	}
	const known = (key) => allKeys.has(key);
	return {
		selected: new Set(stored.selected.filter(known)),
		attachments: Object.fromEntries(
			Object.entries(validAttachments(stored.attachments)).filter(
				([leader, bodyguard]) => known(leader) && known(bodyguard),
			),
		),
	};
}

export function saveUnitSetup(
	listId,
	{ selected, attachments },
	storage = defaultStorage(),
) {
	if (!listId) return;
	const all = readJson(UNIT_SETUP_KEY, storage) ?? {};
	delete all[listId];
	// Most recently saved last, so the oldest lists are dropped first.
	const entries = [
		...Object.entries(all),
		[listId, { selected: [...selected], attachments }],
	].slice(-MAX_LISTS);
	writeJson(UNIT_SETUP_KEY, Object.fromEntries(entries), storage);
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
